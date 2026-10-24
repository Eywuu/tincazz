# Gamba Economy Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the bot persistent SQLite storage (schema, migrations, Docker volume) and slash
command infrastructure, so phases 2 to 4 can build the economy on top.

**Architecture:** `src/db/` opens a `better-sqlite3` database through Drizzle, applies committed
migrations from `drizzle/` on startup and is exposed as `container.db`. `createClient` sets
Sapphire's default guild IDs from `GUILD_ID` so slash commands register instantly to the server.
`/ping` is the first slash command and proves registration end to end. A listener answers failed
interactions with an ephemeral error. No economy logic in this phase.

**Tech Stack:** TypeScript (NodeNext ESM), Sapphire 5.5 / discord.js 14.27, better-sqlite3 13,
drizzle-orm 0.45, drizzle-kit 0.31, zod 4, Vitest, Biome, Docker (node:24-alpine).

**Spec:** `docs/superpowers/specs/2026-10-24-gamba-economy-design.md` (sections "Data model",
"Architecture", "Deployment", "Error handling", "Delivery" item 1)

## Global Constraints

- Work on branch `feat/gamba-economy`, which already holds the spec commit. This phase is one PR;
  later phases branch from `main` after it merges.
- Every commit: Conventional Commits, and `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
  passes. End each commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Dependencies only through `pnpm add` / `pnpm add -D`; commit `pnpm-lock.yaml`.
- Relative imports use `.js`; type-only imports use `import type`.
- `process.env` is read only in `src/config/env.ts`. New variables go in the zod schema **and**
  `.env.example` in the same commit.
- Log through `container.logger` / `client.logger`; never log the token or the environment.
- All coin amounts and timestamps are SQLite `INTEGER`; timestamps are epoch milliseconds (UTC).
- Every table is keyed by `guild_id` (text snowflake) first.
- Default database path: `./data/tincazz.db`. Docker volume: `tincazz-data:/app/data`.
- The container stays `read_only: true`; only `/app/data` is writable.
- No new gateway intents.

## Review Focus

1. `.env` copied from `.env.example` contains `GUILD_ID=` and `DATABASE_PATH=` as empty strings:
   they must behave as unset (global registration, default path), not fail validation. Task 1.
2. First run on a fresh clone: `./data/` does not exist; `openDatabase` must create it. Task 2.
3. Restart with an existing database: migrations must not re-run destructively and existing rows
   must survive. Task 2.
4. An interaction that errors after it already replied or deferred, or whose token has expired:
   the error listener must use `followUp`, and a failing error reply must be logged, never thrown.
   Task 5.
5. Someone edits `src/db/schema.ts` without generating a migration: CI must fail. Task 6.

---

## File Structure

| File | Responsibility |
| ---- | -------------- |
| `src/config/env.ts` (modify) | Add `DATABASE_PATH`, `GUILD_ID` |
| `.env.example` (modify) | Document both |
| `test/support/env.ts` (create) | `testEnv`: one valid `Env` for all tests |
| `src/db/schema.ts` (create) | Drizzle tables: `wallets`, `ledger`, `spins`, `playerStats`, `pots` |
| `src/db/index.ts` (create) | `openDatabase`, `closeDatabase`, `Db` type, `container.db` augmentation |
| `drizzle.config.ts` (create) | drizzle-kit config |
| `drizzle/` (generated) | `0000_init.sql` and `meta/` |
| `src/index.ts` (modify) | Open the database before login, close it on shutdown |
| `src/client.ts` (modify) | Default guild IDs and bulk-overwrite registration behaviour |
| `src/commands/general/ping.ts` (modify) | Add `chatInputRun` and registration |
| `src/listeners/interaction-errors.ts` (create) | Ephemeral generic error for failed slash commands and components |
| `Dockerfile`, `docker-compose.yml`, `pnpm-workspace.yaml`, `biome.json`, `package.json`, `.github/workflows/ci.yml` (modify) | Native build, volume, migrations in image, drift check |
| `README.md`, `AGENTS.md` (modify) | Document all of the above |

---

### Task 1: Database and guild env vars

**Files:**
- Modify: `src/config/env.ts`, `.env.example`, `test/env.test.ts`, `test/client.test.ts`,
  `test/ping.test.ts`, `test/gamba-command.test.ts`
- Create: `test/support/env.ts`

**Interfaces:**
- Produces: `Env` gains `DATABASE_PATH: string` (default `'./data/tincazz.db'`) and
  `GUILD_ID?: string` (a snowflake, `/^\d{17,20}$/`). `test/support/env.ts` exports
  `testEnv: Env` = `{ DISCORD_TOKEN: 'x', COMMAND_PREFIX: '?', LOG_LEVEL: 'error', DATABASE_PATH: ':memory:' }`.

- [ ] **Step 1: Write the failing tests** in `test/env.test.ts`

```ts
it('applies defaults when only the token is set', () => {
  expect(parseEnv({ DISCORD_TOKEN: 'abc' })).toEqual({
    DISCORD_TOKEN: 'abc',
    COMMAND_PREFIX: '?',
    LOG_LEVEL: 'info',
    DATABASE_PATH: './data/tincazz.db',
  });
});

it('treats empty optional values as unset', () => {
  const env = parseEnv({ DISCORD_TOKEN: 'abc', GUILD_ID: '', DATABASE_PATH: '' });
  expect(env.GUILD_ID).toBeUndefined();
  expect(env.DATABASE_PATH).toBe('./data/tincazz.db');
});

it('accepts a guild ID', () => {
  expect(parseEnv({ DISCORD_TOKEN: 'abc', GUILD_ID: '123456789012345678' }).GUILD_ID).toBe(
    '123456789012345678',
  );
});

it('rejects a guild ID that is not a snowflake', () => {
  expect(() => parseEnv({ DISCORD_TOKEN: 'abc', GUILD_ID: 'my-server' })).toThrow(/GUILD_ID/);
});
```

(Replace the existing "applies defaults" test with the first one.)

- [ ] **Step 2: Run** `pnpm vitest run test/env.test.ts`. Expected: the four tests above FAIL.

- [ ] **Step 3: Implement** in `src/config/env.ts`. Wrap both new fields in
  `z.preprocess((value) => (value === '' ? undefined : value), ...)` so empty strings count as
  unset. `DATABASE_PATH`: `z.string().min(1).default('./data/tincazz.db')`. `GUILD_ID`:
  `z.string().regex(/^\d{17,20}$/, 'GUILD_ID must be a server ID').optional()`. Make sure
  `z.infer` still gives `DATABASE_PATH: string` (not optional); if `preprocess` widens the type,
  put the preprocess on the object input instead.

- [ ] **Step 4: Add to `.env.example`**, after `LOG_LEVEL`:

```
# SQLite database file. In Docker this lives on the tincazz-data volume.
DATABASE_PATH=./data/tincazz.db

# Optional: server ID to register slash commands to (instant updates). Empty = global commands.
# Discord: User Settings -> Advanced -> Developer Mode, then right-click the server -> Copy Server ID
GUILD_ID=
```

- [ ] **Step 5: Add `test/support/env.ts`** exporting `testEnv`, then replace the inline env
  literals in `test/client.test.ts`, `test/ping.test.ts` and `test/gamba-command.test.ts` with it.

- [ ] **Step 6: Run** `pnpm lint && pnpm typecheck && pnpm test`. Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/config/env.ts .env.example test/
git commit -m "feat(config): add DATABASE_PATH and GUILD_ID env vars"
```

---

### Task 2: SQLite database, schema and first migration

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `biome.json`
- Create: `src/db/schema.ts`, `src/db/index.ts`, `drizzle.config.ts`, `drizzle/*`,
  `test/db.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 at the code level.
- Produces:
  - `src/db/schema.ts`: tables `wallets`, `ledger`, `spins`, `playerStats`, `pots`; const arrays
    `ledgerReasons`, `spinModes`, `spinResults`; their union types `LedgerReason`, `SpinMode`,
    `SpinResult`.
  - `src/db/index.ts`:
    - `type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database }`
    - `openDatabase(path: string): Db`: creates the parent directory unless the path is
      `':memory:'`, sets pragmas `journal_mode = WAL`, `foreign_keys = ON`,
      `busy_timeout = 5000`, then runs `migrate(db, { migrationsFolder })`. `migrationsFolder`
      is `../../drizzle` relative to `import.meta.url`, which works from `src/db` and `dist/db`.
    - `closeDatabase(db: Db): void`

- [ ] **Step 1: Allow the native build, then install.** Add `better-sqlite3: true` under
  `allowBuilds` in `pnpm-workspace.yaml`, then:

```bash
pnpm add better-sqlite3 drizzle-orm
pnpm add -D drizzle-kit @types/better-sqlite3
```

  Expected: `node -e "require('better-sqlite3')(':memory:')"` exits 0.

- [ ] **Step 2: Write the schema** in `src/db/schema.ts`. Column names are snake_case strings and
  TS keys are camelCase. These are the spec's values; use exactly these names:

```ts
export const ledgerReasons = ['start', 'daily', 'bailout', 'chat', 'free_prize', 'bet', 'payout',
  'pot_win', 'admin_grant', 'admin_take'] as const;
export const spinModes = ['free', 'wager'] as const;
export const spinResults = ['none', 'pair', 'triple', 'jackpot'] as const;
```

| Table (TS name) | Columns (all `notNull` unless marked `?`) | Constraints / indexes |
| --------------- | ----------------------------------------- | --------------------- |
| `wallets` | `guild_id` text, `user_id` text, `balance` int, `daily_streak` int default 0, `last_daily_at?` int, `last_bailout_at?` int, `last_chat_reward_at?` int, `created_at` int | PK (`guild_id`, `user_id`); `check('wallets_balance_non_negative', sql\`balance >= 0\`)`; index `wallets_guild_balance_idx` (`guild_id`, `balance`) |
| `ledger` | `id` int PK autoincrement, `guild_id`, `user_id`, `delta` int, `balance_after` int, `reason` text enum `ledgerReasons`, `ref?` int, `actor_id?` text, `created_at` int | index `ledger_user_idx` (`guild_id`, `user_id`, `id`) |
| `spins` | `id` int PK autoincrement, `guild_id`, `user_id`, `mode` text enum `spinModes`, `reels` text, `result` text enum `spinResults`, `bet` int default 0, `payout` int default 0, `pot_won` int default 0, `created_at` int | index `spins_user_idx` (`guild_id`, `user_id`) |
| `playerStats` → `player_stats` | `guild_id`, `user_id`, `spins`, `wins`, `jackpots`, `wagered`, `won`, `biggest_win`, `best_odds`; each int default 0 | PK (`guild_id`, `user_id`); indexes on (`guild_id`, x) for x in `biggest_win`, `jackpots`, `spins` |
| `pots` | `guild_id` text PK, `amount` int, `last_winner_id?` text, `last_won_at?` int | none |

The profit leaderboard sorts on `won - wagered` without an index. A guild has at most a few
thousand players, so a scan is fine and drizzle-kit needs no expression index.

- [ ] **Step 3: Add `drizzle.config.ts`** (`defineConfig({ dialect: 'sqlite', schema:
  './src/db/schema.ts', out: './drizzle' })`), the script `"db:generate": "drizzle-kit generate"`
  in `package.json`, and exclude generated migrations from Biome:
  `"files": { "includes": ["**", "!drizzle"] }` in `biome.json`. Then run
  `pnpm db:generate --name init`. Expected: `drizzle/0000_init.sql` plus `drizzle/meta/`, and the
  SQL contains the CHECK constraint and all five `CREATE TABLE`s.

- [ ] **Step 4: Write the failing tests** in `test/db.test.ts` (`tmpdir` comes from
  `node:os`; clean up with `rmSync(dir, { recursive: true })` in `afterEach`):

```ts
it('applies migrations to a fresh in-memory database', () => {
  const db = openDatabase(':memory:');
  const tables = db.$client
    .prepare("select name from sqlite_master where type = 'table' and name not like '\\_\\_%' escape '\\' and name != 'sqlite_sequence'")
    .pluck().all();
  expect(tables.sort()).toEqual(['ledger', 'player_stats', 'pots', 'spins', 'wallets']);
});

it('round-trips a row through every table', () => { /* insert one row into each table with
  Drizzle (db.insert(...).values(...)), select it back with db.select().from(...), and expect
  toEqual the inserted values including defaults (daily_streak 0, bet 0, etc.) */ });

it('rejects a negative balance', () => {
  // insert a wallet with balance 0, then update balance to -1: expect toThrow(/CHECK constraint/)
});

it('enables WAL and foreign keys on file databases', () => {
  // openDatabase(join(dir, 'x.db')): pragma('journal_mode', { simple: true }) === 'wal',
  // pragma('foreign_keys', { simple: true }) === 1
});

it('creates missing parent directories', () => {
  const path = join(dir, 'nested', 'deeper', 'tincazz.db');
  closeDatabase(openDatabase(path));
  expect(existsSync(path)).toBe(true);
});

it('keeps data and does not re-run migrations on reopen', () => {
  // open file db, insert a pots row, close; reopen same path: the row is still there and
  // select count(*) from __drizzle_migrations is 1
});
```

- [ ] **Step 5: Run** `pnpm vitest run test/db.test.ts`. Expected: FAIL (`openDatabase` not
  defined).

- [ ] **Step 6: Implement `src/db/index.ts`** with the interfaces above, using `drizzle` from
  `drizzle-orm/better-sqlite3` (`drizzle({ client, schema })`) and `migrate` from
  `drizzle-orm/better-sqlite3/migrator`.

- [ ] **Step 7: Run** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. Expected: all
  PASS, and `dist/db/index.js` resolves `drizzle/` (check with
  `node -e "import('./dist/db/index.js').then(m => m.openDatabase(':memory:'))"`, which exits 0).

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml biome.json drizzle.config.ts drizzle src/db test/db.test.ts
git commit -m "feat(db): add sqlite database with drizzle schema and migrations"
```

---

### Task 3: Open the database on startup and expose it on the container

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`, `src/db/index.ts`, `src/index.ts`
- Test: `test/db.test.ts`

**Interfaces:**
- Consumes: `openDatabase`, `closeDatabase`, `Db` (Task 2); `env.DATABASE_PATH` (Task 1).
- Produces: `container.db: Db`, available in every piece as `this.container.db`. Tests set it
  with `container.db = openDatabase(':memory:')`.

- [ ] **Step 1: Install the pieces package** so the augmentation resolves under pnpm's strict
  layout: `pnpm add @sapphire/pieces`. Expected: `pnpm why @sapphire/pieces` shows one version,
  the same one `@sapphire/framework` uses (4.4.1 today).

- [ ] **Step 2: Write the failing test** in `test/db.test.ts`:

```ts
it('is reachable from the Sapphire container', () => {
  container.db = openDatabase(':memory:');
  expect(container.db.select().from(pots).all()).toEqual([]);
});
```

  (`container` imported from `@sapphire/framework`.)

- [ ] **Step 3: Run** `pnpm typecheck`. Expected: FAIL (`Property 'db' does not exist on type
  'Container'`).

- [ ] **Step 4: Add the augmentation** to `src/db/index.ts`:

```ts
declare module '@sapphire/pieces' {
  interface Container {
    db: Db;
  }
}
```

- [ ] **Step 5: Wire up `src/index.ts`.**
  - Inside the existing `try`, before `client.login`, run
    `container.db = openDatabase(env.DATABASE_PATH)`. A migration or open failure then takes the
    existing fatal-log-and-exit path.
  - `shutdown` and the failure path call `closeDatabase(container.db)` after `client.destroy()`,
    and only if it was opened. Use a local `let db: Db | undefined`, not a container read.
  - Log `Database ready at <path>` at info.

- [ ] **Step 6: Run** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. Expected: PASS.

- [ ] **Step 7: Smoke-test startup.** Run
  `DISCORD_TOKEN=invalid DATABASE_PATH=<scratch dir>/smoke/t.db node dist/index.js`. Use the
  session scratchpad, or `mktemp -d` outside an agent session. Expected:
  `Database ready at <path>`, then a fatal login error and exit code 1. The file exists and
  contains the five tables. Delete the directory afterwards.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml src/db/index.ts src/index.ts test/db.test.ts
git commit -m "feat(db): open the database on startup and expose it on the container"
```

---

### Task 4: Slash command registration and `/ping`

**Files:**
- Modify: `src/client.ts`, `src/commands/general/ping.ts`, `test/client.test.ts`,
  `test/ping.test.ts`

**Interfaces:**
- Consumes: `env.GUILD_ID` (Task 1).
- Produces: the pattern every later slash command follows:
  `registerApplicationCommands(registry)` calls `registry.registerChatInputCommand((b) =>
  b.setName(this.name).setDescription(this.description))`, and a `chatInputRun(interaction)`.
  `createClient(env)` calls `ApplicationCommandRegistries.setDefaultGuildIds(env.GUILD_ID ?
  [env.GUILD_ID] : null)` and
  `ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(RegisterBehavior.BulkOverwrite)`.

- [ ] **Step 1: Write the failing tests.** In `test/client.test.ts`:

```ts
it('registers slash commands to GUILD_ID when set', () => {
  createClient({ ...testEnv, GUILD_ID: '123456789012345678' });
  expect(ApplicationCommandRegistries.getDefaultGuildIds()).toEqual(['123456789012345678']);
  expect(ApplicationCommandRegistries.getDefaultBehaviorWhenNotIdentical()).toBe(
    RegisterBehavior.BulkOverwrite,
  );
});

it('registers slash commands globally without GUILD_ID', () => {
  createClient({ ...testEnv, GUILD_ID: '123456789012345678' });
  createClient(testEnv);
  expect(ApplicationCommandRegistries.getDefaultGuildIds()).toBeFalsy();
});
```

  In `test/ping.test.ts`, add `/ping replies with latency`. Emit `Events.InteractionCreate` with
  a stubbed chat input interaction:
  - `isChatInputCommand: () => true` and the other `is*` methods return false;
  - `commandName: 'ping'`, `commandId: '1'`, `createdTimestamp: 1000`, `client`, `guildId`,
    `channelId`, `user: { id: '1' }`;
  - `reply: vi.fn(async () => ({ resource: { message: { createdTimestamp: 1042 } } }))` and
    `editReply: vi.fn()`.

  Assertions:
  - `reply` was called with `{ content: 'Pinging...', withResponse: true }`;
  - the `editReply` argument matches `/^Pong! Round trip: 42ms/`.

  Rename the existing prefix test to `?ping replies with latency` if it isn't already.

- [ ] **Step 2: Run** `pnpm vitest run test/client.test.ts test/ping.test.ts`. Expected: the new
  tests FAIL.

- [ ] **Step 3: Implement** the registry defaults in `createClient`, and `/ping` in
  `ping.ts`. Both run paths share one private `formatPong(roundTrip: number): string` so the
  reply text stays identical. The existing prefix path must keep passing.

- [ ] **Step 4: Run** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client.ts src/commands/general/ping.ts test/client.test.ts test/ping.test.ts
git commit -m "feat(commands): register slash commands per guild and add /ping"
```

---

### Task 5: Ephemeral error reply for failed interactions

**Files:**
- Create: `src/listeners/interaction-errors.ts`, `test/interaction-errors.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - Two listener classes in one file, `ChatInputCommandErrorListener` (event
    `Events.ChatInputCommandError`) and `InteractionHandlerErrorListener` (event
    `Events.InteractionHandlerError`).
  - Both call the exported `replyWithGenericError(interaction: Interaction): Promise<void>`.
  - The copy is exactly `Something went wrong running that. It has been logged.`
  - Sapphire's core error listeners already log the error itself, so these listeners only reply.
    Do not log the error twice.

- [ ] **Step 1: Write the failing tests** in `test/interaction-errors.test.ts`. Call
  `replyWithGenericError` with stub interactions:

```ts
const ephemeral = { content: 'Something went wrong running that. It has been logged.',
  flags: MessageFlags.Ephemeral };

it('replies ephemerally when nothing was sent yet', async () => {
  const i = stub({ replied: false, deferred: false });
  await replyWithGenericError(i);
  expect(i.reply).toHaveBeenCalledWith(ephemeral);
  expect(i.followUp).not.toHaveBeenCalled();
});

it('follows up when the interaction already replied', /* replied: true -> followUp(ephemeral) */);
it('follows up when the interaction was deferred', /* deferred: true -> followUp(ephemeral) */);
it('does nothing for non-repliable interactions', /* isRepliable: () => false -> neither called */);
it('swallows and logs a failing error reply', async () => {
  const i = stub({ replied: false, deferred: false });
  i.reply.mockRejectedValue(new Error('Unknown interaction'));
  const warn = vi.spyOn(container.logger, 'warn');
  await expect(replyWithGenericError(i)).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalled();
});
```

  Also add `it('loads both error listeners')` to `test/client.test.ts`. It asserts the listener
  store keys contain `ChatInputCommandErrorReply` and `InteractionHandlerErrorReply`. Both classes
  live in one file, so give them those names explicitly via the `name` option. Otherwise Sapphire
  names pieces after the file.

- [ ] **Step 2: Run** `pnpm vitest run test/interaction-errors.test.ts`. Expected: FAIL (module not
  found).

- [ ] **Step 3: Implement** `src/listeners/interaction-errors.ts` with the interfaces above. The
  `warn` log names the interaction ID and the error message only.

- [ ] **Step 4: Run** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/listeners/interaction-errors.ts test/interaction-errors.test.ts test/client.test.ts
git commit -m "feat(listeners): reply to failed interactions with an ephemeral error"
```

---

### Task 6: Docker volume, native build and migration drift check

**Files:**
- Modify: `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `drizzle/` and `db:generate` (Task 2).
- Produces: an image that runs migrations from `/app/drizzle` and writes to `/app/data`.

- [ ] **Step 1: Dockerfile.**
  - In the `base` stage, add `RUN apk add --no-cache python3 make g++`. This is the fallback when
    no musl prebuild of better-sqlite3 matches. The runtime stage starts from a clean
    `node:24-alpine` and gets no toolchain.
  - In `runtime`, add `COPY --chown=node:node drizzle ./drizzle`, plus
    `RUN mkdir -p /app/data && chown node:node /app/data` before `USER node`.

- [ ] **Step 2: docker-compose.yml.** Add `volumes: [tincazz-data:/app/data]` to `bot`, and a
  top-level `volumes: { tincazz-data: {} }`. Keep `read_only: true`. Add a comment that
  `/app/data` is the only writable path and holds the database.

- [ ] **Step 3: Verify the image.**
  - Run `docker build -t tincazz:phase1 .`. Expected: success.
  - Then run `docker run --rm --read-only -v tincazz-smoke:/app/data -e DISCORD_TOKEN=invalid
    tincazz:phase1`. Expected: `Database ready at ./data/tincazz.db`, then a fatal login error.
  - Clean up with `docker volume rm tincazz-smoke`.
  - If Docker is not available locally, say so and rely on the PR's CI Docker build.

- [ ] **Step 4: CI drift check.** In `.github/workflows/ci.yml`'s `check` job, after `pnpm build`,
  add:

```yaml
      - name: Check migrations match the schema
        run: |
          pnpm db:generate
          git status --porcelain -- drizzle
          test -z "$(git status --porcelain -- drizzle)"
```

  Verify locally: add a throwaway column to `src/db/schema.ts`, run the three commands, and
  expect a non-zero exit. Revert the column and confirm a zero exit.

- [ ] **Step 5: Commit** as two commits:

```bash
git add Dockerfile docker-compose.yml
git commit -m "build(docker): persist the database on a volume and build better-sqlite3"
git add .github/workflows/ci.yml
git commit -m "ci: fail when migrations do not match the schema"
```

---

### Task 7: Documentation

**Files:**
- Modify: `AGENTS.md`, `README.md`

- [ ] **Step 1: AGENTS.md.**
  - **Layout:** add `src/db/`, `drizzle/` and `interaction-handlers/` (the latter arrives in
    phase 3, so say so).
  - **Commands table:** add `pnpm db:generate`.
  - New **Database** section:
    - SQLite via better-sqlite3 and Drizzle, migrations applied on startup.
    - Change `src/db/schema.ts`, then run `pnpm db:generate --name <change>` and commit both. CI
      fails on drift.
    - Coins and timestamps are integers.
    - Tests use `openDatabase(':memory:')` and assign `container.db`.
  - **Discord notes:**
    - Slash commands register to `GUILD_ID` when set, otherwise globally (global updates can
      take up to an hour).
    - The CI section now includes the migration drift check.
  - **Node/pnpm note:** `better-sqlite3` must stay in `allowBuilds`.

- [ ] **Step 2: README.md.** Update the setup and deployment sections:
  - the new env vars;
  - the `tincazz-data` volume;
  - backup command `docker compose exec bot node -e "require('better-sqlite3')('/app/data/tincazz.db').backup('/app/data/backup.db')"`,
    then `docker compose cp bot:/app/data/backup.db .`. The image has no `sqlite3` CLI, so this
    replaces the spec's `sqlite3 .backup` example.

- [ ] **Step 3: Run** `pnpm lint`. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md README.md
git commit -m "docs: document the database, slash commands and new env vars"
```

---

## Done when

- All seven tasks are committed and each commit passes lint, typecheck, test and build.
- `docker compose up -d --build` on the server starts the bot, creates
  `/app/data/tincazz.db` on the volume, and `/ping` appears instantly in the server when
  `GUILD_ID` is set.
- The PR's CI is green, including the Docker build and the migration drift check.
