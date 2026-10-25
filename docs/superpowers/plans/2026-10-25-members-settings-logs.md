# Departed Members, Auto-role and Log Channels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide members who left the server (purging them after 30 days), give configured roles to
new members, and post economy and mod events to admin-chosen log channels.

**Architecture:** Typed SQLite tables hold per-guild settings, auto-roles, departures
(`wallets.departed_at`) and job runs. Live member listeners plus a daily in-process reconcile job
keep departures correct; one `/settings` command edits configuration; a `features/logs` module
renders tagged events into Components V2 cards and sends them without ever throwing.

**Tech Stack:** TypeScript (strict, ESM, NodeNext), discord.js 14, Sapphire 5, Drizzle +
better-sqlite3, Vitest, fast-check, Biome.

**Spec:** `docs/superpowers/specs/2026-10-25-members-settings-logs-design.md`

## Global Constraints

- Every commit leaves `pnpm lint && pnpm typecheck && pnpm test && pnpm build` passing.
- Conventional Commits, imperative lower-case summary ≤ 72 chars, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `.js` extensions on relative imports; `import type` for type-only imports.
- No `process.env` outside `parseEnv`; no new env variables; no new dependencies.
- Log through `this.container.logger` / `container.logger`, never `console`.
- Coin amounts and timestamps are integers (epoch ms, UTC).
- Only `src/features/economy/` changes balances (the purge lives in `economy/prune.ts`).
- Admin gate: `PermissionFlagsBits.ManageGuild`, set as default member permission **and** checked
  at runtime.
- Grace period `30 * 86_400_000` ms; member fetch guard `0.95 × guild.memberCount`; big spin and
  big flip threshold `5_000`; at most `10` auto-roles per target; scheduler tick `3_600_000` ms;
  reconcile every `86_400_000` ms; purged users listed by mention only when `≤ 20`.
- `allowedMentions` stays `{ parse: [], repliedUser: false }`; log sends never widen it.
- Logging is fire-and-forget (`void`), after the database commit and after the user's reply.
- Feature modules that import each other's internals import the file (`../settings/store.js`),
  not the `index.ts`, to avoid ESM import cycles.
- Tests that build a client share one `createClient` per file (Sapphire global state), as
  `test/ping.test.ts` does.

## Review Focus

- **One guild failing the reconcile must not stop the others** (bot in several guilds, no
  `GUILD_ID`): the others still reconcile and the job reports failure so it retries. Test in Task 8.
- **Setting a log channel to the one already set** should say so and change nothing (no
  confirmation spam, no mod log entry). Test in Task 4.
- **A departed member rejoining while Rules Screening is on** gets their wallet back at join, but
  roles only after screening. Test in Task 7.
- **User-written text in log cards** (an `/eco` reason containing `@everyone` or `<@id>`) must not
  ping: log sends pass no `allowedMentions` override. Test in Task 3.
- **A role deleted while it is in both auto-role lists** is removed from both with a single mod
  log entry. Test in Task 5.

---

## File map

| Path                                                                                      | Responsibility                                                            |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `src/db/schema.ts`                                                                        | `departed_at`, `guild_settings`, `guild_auto_roles`, `job_runs`, `pruned` |
| `drizzle/00NN_members-settings-logs.sql`                                                  | generated migration                                                       |
| `src/features/scheduler/{config,runner,index}.ts`                                         | persisted interval jobs                                                   |
| `src/features/logs/{config,events,cards,send,economy,index}.ts`                           | log events, cards, delivery                                               |
| `src/features/settings/{config,store,channels,autorole,assign,cards,index}.ts`            | settings data, validation, role assignment, reply cards                   |
| `src/features/members/{config,departures,reconcile,job,index}.ts`                         | departures, reconcile plan, daily job                                     |
| `src/features/economy/prune.ts`                                                           | purge one wallet (balance-changing)                                       |
| `src/commands/admin/settings.ts`                                                          | `/settings`                                                               |
| `src/listeners/{member-join,member-leave,member-screening,role-delete,channel-delete}.ts` | Discord events                                                            |
| `test/support/interaction.ts`                                                             | extended chat-input stub                                                  |

---

### Task 1: Schema and migration

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/<generated>` (via `pnpm db:generate --name members-settings-logs`)
- Test: `test/db.test.ts`

**Interfaces:**
- Produces (all exported from `src/db/schema.ts`):
  - `wallets.departedAt` (`integer('departed_at')`, nullable), index
    `wallets_guild_departed_idx` on `(guildId, departedAt)`
  - `ledgerReasons` gains `'pruned'` (append at the end)
  - `autoRoleTargets = ['member', 'bot'] as const`, `type AutoRoleTarget`
  - `guildSettings`: `guildId` (`guild_id`, pk), `economyLogChannelId`, `modLogChannelId`
    (nullable text), `updatedAt` (not null)
  - `guildAutoRoles`: `guildId`, `roleId`, `target` (`text('target', { enum: autoRoleTargets })`),
    `createdAt`; `primaryKey({ columns: [guildId, roleId, target] })`
  - `jobRuns`: `name` (pk), `lastRunAt` (`last_run_at`, not null)

- [ ] **Step 1: Write the failing test** in `test/db.test.ts`

```ts
it('creates the settings, auto-role and job tables and wallets.departed_at', () => {
  const db = openDatabase(':memory:');
  const names = db.$client
    .prepare("select name from sqlite_master where type = 'table'")
    .pluck()
    .all();
  expect(names).toEqual(expect.arrayContaining(['guild_settings', 'guild_auto_roles', 'job_runs']));
  const columns = db.$client.prepare('pragma table_info(wallets)').all() as { name: string }[];
  expect(columns.map((c) => c.name)).toContain('departed_at');
});
```

- [ ] **Step 2: Run** `pnpm vitest run test/db.test.ts` — expect FAIL (tables missing).
- [ ] **Step 3: Edit the schema** as listed in Interfaces.
- [ ] **Step 4: Generate the migration**: `pnpm db:generate --name members-settings-logs`. Expect
  one new `.sql` file plus snapshot/journal updates in `drizzle/`; open it and check it only adds
  the column, index and three tables.
- [ ] **Step 5: Run** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — PASS.
- [ ] **Step 6: Commit** `feat(db): add departed members, guild settings and job runs`
  (`src/db/schema.ts drizzle/ test/db.test.ts`).

---

### Task 2: Scheduler

**Files:**
- Create: `src/features/scheduler/config.ts`, `runner.ts`, `index.ts`
- Test: `test/scheduler.test.ts`

**Interfaces:**
- Consumes: `jobRuns` (Task 1), `container.db`, `container.logger`.
- Produces:
  - `scheduler = { tickMs: 3_600_000 } as const`
  - `interface Job { name: string; everyMs: number; run(client: Client<true>, now: number): Promise<boolean> }`
  - `startJobs(client: Client<true>, jobs: readonly Job[]): () => void` — ticks once immediately,
    then every `scheduler.tickMs` (`unref`'d `setInterval`). A job runs when it has no `job_runs`
    row or `now - lastRunAt >= everyMs`. Upsert `lastRunAt = now` (the tick's start time) only when
    `run` resolves `true`. A `Set<string>` of running names prevents overlap. Throws and `false`
    are logged with `logger.warn` (`scheduler: <name> failed: <message>` / `... did not finish`).
    Returns a function that clears the interval.

- [ ] **Step 1: Write the failing tests** with `vi.useFakeTimers()`, `container.db =
  openDatabase(':memory:')`, a stub client `{} as Client<true>` and `vi.advanceTimersByTimeAsync`:
  - `runs a due job at start and records the run` — `run` called once; `job_runs` row with
    `lastRunAt === Date.now()` at start.
  - `skips a job that ran within everyMs` — pre-insert `lastRunAt = now - 1000`, `everyMs = 86_400_000`;
    after start and one tick, `run` not called.
  - `retries a failed run on the next tick` — `run` resolves `false` first then `true`; after
    `advanceTimersByTimeAsync(3_600_000)` it has been called twice and only then is a row present.
  - `logs and survives a throwing job` — `run` rejects; no throw from `startJobs`; no row.
  - `never overlaps runs of the same job` — `run` returns a promise that resolves only when a test
    resolver is called; advance two ticks; `run` called once.
  - `stop clears the timer` — call the returned function, advance 2 ticks, still one call.
- [ ] **Step 2: Run** `pnpm vitest run test/scheduler.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement** `runner.ts` per Interfaces; `index.ts` re-exports `config.js` and `runner.js`.
- [ ] **Step 4: Run** the test file — PASS; then the full check suite.
- [ ] **Step 5: Commit** `feat(scheduler): run persisted daily jobs`.

---

### Task 3: Log events, cards and delivery

**Files:**
- Create: `src/features/settings/store.ts` (log channel part), `src/features/logs/config.ts`,
  `events.ts`, `cards.ts`, `send.ts`, `index.ts`
- Test: `test/logs.test.ts`, `test/settings-store.test.ts`

**Interfaces:**
- Consumes: `guildSettings` (Task 1), `card`, `accents`, `coins` from `features/ui`.
- Produces:
  - `src/features/logs/config.ts`: `logKinds = ['economy', 'mod'] as const`, `type LogKind`,
    `logThresholds = { bigSpin: 5_000, bigFlip: 5_000 } as const`
  - `src/features/settings/store.ts`:
    - `logChannelId(db: DbOrTx, guildId: string, kind: LogKind): string | undefined`
    - `setLogChannel(db: DbOrTx, guildId: string, kind: LogKind, channelId: string | null, now: number): string | undefined` — upserts, returns the previous ID
    - `clearChannelEverywhere(db: DbOrTx, channelId: string, now: number): { guildId: string; kind: LogKind }[]`
  - `src/features/logs/events.ts`:

```ts
export type EconomyEvent =
  | {
      type: 'admin_adjust';
      actorId: string;
      userId: string;
      action: AdminAction;
      amount: number;
      reason: string;
      balance: number;
    }
  | {
      type: 'jackpot';
      userId: string;
      bet: number;
      payout: number;
      potWon: number;
      roleAssigned: boolean;
    }
  | { type: 'big_spin'; userId: string; bet: number; result: SpinResult; payout: number }
  | {
      type: 'big_flip';
      mode: FlipMode;
      playerIds: string[];
      bet: number;
      winnerId?: string;
      rake: number;
    } // winnerId undefined: the bot won
  | { type: 'member_departed'; userId: string; balance: number; purgeAt: number }
  | { type: 'member_restored'; userId: string; balance: number }
  | {
      type: 'reconcile_summary';
      departed: number;
      restored: number;
      purged: string[];
      coinsRemoved: number;
    };

export type ModEvent =
  | {
      type: 'autorole_added' | 'autorole_removed';
      actorId: string;
      roleId: string;
      target: AutoRoleTarget;
    }
  | {
      type: 'log_channel_set';
      actorId: string;
      kind: LogKind;
      fromChannelId?: string;
      toChannelId: string;
    }
  | { type: 'log_channel_cleared'; actorId: string; kind: LogKind; fromChannelId: string }
  | {
      type: 'setting_auto_cleared';
      setting: 'autorole' | 'log_channel';
      id: string;
      detail: string;
    }
  | { type: 'autorole_failed'; userId: string; failures: { roleId: string; reason: string }[] };
```

- `cards.ts`: `economyLogCard(event: EconomyEvent, now: number): ContainerBuilder`,
  `modLogCard(event: ModEvent, now: number): ContainerBuilder`. Each card: a `### <title>` line,
  detail lines with mentions (`<@id>`, `<@&id>`, `<#id>`) and `coins()` amounts, last line
  `-# <t:${Math.floor(now / 1000)}:f>`. Accents: `gold` for jackpot, `win` for big wins,
  `loss` for departures and purges, `brand` otherwise, `error` for `autorole_failed`. A
  `reconcile_summary` with more than `members.maxListedPurges` (20, imported from
  `features/members/config.ts`, created here as `members = { graceMs: 2_592_000_000, minFetchRatio: 0.95, maxListedPurges: 20 } as const`) purged users shows only the count.
- `send.ts`:
  - `sendLog(channelId: string, card: ContainerBuilder): Promise<boolean>` — cache then
    `channels.fetch` (caught), requires `channel.isSendable()`, sends
    `{ components: [card], flags: MessageFlags.IsComponentsV2 }` (no `allowedMentions`), returns
    false and `logger.warn`s on any problem. Never throws.
  - `logEconomy(guildId: string, event: EconomyEvent, now = Date.now()): Promise<void>`
  - `logMod(guildId: string, event: ModEvent, now = Date.now()): Promise<void>` — both read the
    channel with `logChannelId(container.db, …)`; unset returns silently without warning.

* [ ] **Step 1: Write the failing store tests** (`test/settings-store.test.ts`): set then read;
  `setLogChannel` returns the previous ID; setting `null` clears; kinds are independent;
  `clearChannelEverywhere('50')` clears both kinds in every guild that pointed at `50` and returns
  each `{ guildId, kind }`.
* [ ] **Step 2: Write the failing log tests** (`test/logs.test.ts`), one shared client; fake
  channel `{ id: '50', isSendable: () => true, send: vi.fn(async () => ({})) }` put in
  `client.channels.cache`:
  - `renders a card for every event type` — for one sample of each union member, `JSON.stringify`
    the card and assert it contains the key mention or amount (e.g. `admin_adjust` contains
    `'<@1>'` and `'500'`; `reconcile_summary` with 25 purged contains `'25'` and no `'<@'`).
  - `posts economy events to the economy channel` — `setLogChannel(db, '2', 'economy', '50', 1)`;
    `await logEconomy('2', event)`; `send` called once with `flags: MessageFlags.IsComponentsV2`.
  - `does nothing when no channel is set` — `send` not called, `logger.warn` not called.
  - `warns when the channel is gone or sending throws` — unknown ID and a `send` that rejects both
    resolve without throwing and call `container.logger.warn` (spy).
  - **Review Focus:** `never lets user text ping` — event reason `'@everyone <@3>'`; assert the
    payload passed to `send` has no `allowedMentions` key.
* [ ] **Step 3: Run** both files — FAIL.
* [ ] **Step 4: Implement** the files listed, with `logs/index.ts` re-exporting config, events,
  cards and send.
* [ ] **Step 5: Run** both files — PASS; full suite.
* [ ] **Step 6: Commit** `feat(logs): send economy and mod log cards`.

---

### Task 4: `/settings logs` and `/settings show` (logs part), channel deletions

**Files:**
- Create: `src/commands/admin/settings.ts`, `src/features/settings/channels.ts`,
  `src/features/settings/cards.ts`, `src/features/settings/index.ts`,
  `src/listeners/channel-delete.ts`
- Modify: `test/support/interaction.ts`
- Test: `test/settings-command.test.ts`, `test/channel-delete.test.ts`

**Interfaces:**
- Consumes: store and logs (Task 3).
- Produces:
  - `channels.ts`: `logChannelProblem(channel: { type: ChannelType; permissionsFor(me: GuildMember): Readonly<PermissionsBitField> | null }, me: GuildMember): string | undefined`
    — `'Pick a text or announcement channel.'` unless `GuildText`/`GuildAnnouncement`;
    `'I need View Channel and Send Messages in <#id>.'` when either permission is missing.
  - `cards.ts` constants: `settingsNeedsManageServer = 'You need the Manage Server permission to use \`/settings\`.'`,
    `logChannelAlreadySet = (kind, id) => \`<#${id}> is already the ${kind} log channel.\``;
    `settingsCard(view: SettingsView): ContainerBuilder`where
   `SettingsView = { autoRoles: Record<AutoRoleTarget, { roleId: string; problem?: string }[]>; logs: Record<LogKind, { channelId?: string; problem?: string }> }`.
    Lines exactly: `## Settings`, `**Auto-roles (members):** …`, `**Auto-roles (bots):** …`,
    `**Economy log:** …`, `**Mod log:** …`; empty lists read `none`, unset logs `not set`, a
    problem appends ` ⚠️ <problem>`.
  - `SettingsCommand` (`name: 'settings'`, description `'Configure the bot (admins)'`), guild-only,
    `setDefaultMemberPermissions(ManageGuild)`. This task registers `show` and the `logs` group
    (`set` with `type` choice `economy|mod` required and `channel` required with
    `addChannelTypes(GuildText, GuildAnnouncement)`; `clear` with `type`). Task 6 adds the
    `autorole` group. `chatInputRun` checks `ManageGuild` first, then dispatches on
    `getSubcommandGroup(false)` / `getSubcommand()`.
  - `logs set`: same channel as current → ephemeral `logChannelAlreadySet`, no writes, no logs.
    Otherwise `logChannelProblem` → error reply; else send
    `card(accents.brand, \`This channel now receives ${kind} logs. Set by <@${actor}>.\`)`to the
    channel; on send failure reply`'I couldn't post in <#id>, so nothing changed.'`; on success
    `setLogChannel`, ephemeral reply `'Set the <kind> log to <#id>.'`, then
    `void logMod(guildId, { type: 'log_channel_set', … })`; when `kind === 'mod'`and there was a
    previous channel, also`void sendLog(previous, modLogCard(event, now))`.
  - `logs clear`: nothing set → `'The <kind> log isn't set.'`; else clear, reply
    `'Cleared the <kind> log.'`, then for `economy` `void logMod(…'log_channel_cleared')` and for
    `mod` `void sendLog(previous, modLogCard(event, now))` (the old mod channel hears it; `logMod`
    would find nothing set).
  - `show` (logs part): problem `'channel no longer exists'` when not in `guild.channels.cache`,
    otherwise `logChannelProblem` with `guild.members.me`.
  - `ChannelDeleteListener` (`event: Events.ChannelDelete`): `clearChannelEverywhere`, then for
    each cleared `kind === 'economy'` → `logMod(guildId, { type: 'setting_auto_cleared', setting: 'log_channel', id, detail: 'economy log channel was deleted' })`;
    for `mod` → `logger.info` only.
- `test/support/interaction.ts` `makeChatInput` gains: `subcommandGroup?: string`
  (`getSubcommandGroup: () => subcommandGroup ?? null`), `getChannel`, `getRole` (return
  `options[name] ?? null`), `absentMembers?: string[]` (`getMember(name)` returns `null` when the
  user option's id is in it, else `{ id }`), and `guild?: unknown` (default
  `{ id: guildId, ownerId: '0', channels: { cache: new Map() }, roles: { cache: new Map() }, members: { me: makeMe() } }`).
  Existing tests must keep passing unchanged.

- [ ] **Step 1: Write the failing command tests** (`test/settings-command.test.ts`), in the style
  of `test/eco-command.test.ts` (one client, `container.db` fresh per test, `run(group, sub, options, extras)`):
  - `refuses without Manage Server` — text contains `settingsNeedsManageServer`; ephemeral.
  - `sets the economy log after posting a confirmation there` — fake channel `50` (GuildText,
    all permissions, `send` mock); `send` called with text containing
    `'This channel now receives economy logs'`; `logChannelId(db,'2','economy') === '50'`.
  - `rejects a channel it cannot post in` — `permissionsFor` returns no bits; reply contains
    `'I need View Channel and Send Messages'`; nothing stored.
  - `changes nothing when the confirmation fails` — `send` rejects; nothing stored.
  - **Review Focus:** `says so when the channel is already set` — preset `50`; reply contains
    `logChannelAlreadySet('economy','50')`; channel `send` not called.
  - `tells the old mod log when the mod log moves` — preset mod `60` (fake channel in client cache);
    set mod to `50`; both channels' `send` called.
  - `clears a log` and `explains clearing an unset log`.
  - `shows log settings with warnings` — economy set to an ID not in `guild.channels.cache`;
    reply contains `'**Economy log:**'`, `'⚠️ channel no longer exists'`, `'**Mod log:** not set'`.
- [ ] **Step 2: Write the failing listener test** (`test/channel-delete.test.ts`): both kinds set
  to `50` in guild `2`; emit `Events.ChannelDelete` with `{ id: '50', guildId: '2' }`; both
  cleared; no send to the deleted channel.
- [ ] **Step 3: Run** — FAIL.
- [ ] **Step 4: Implement** the files listed; extend the test helper.
- [ ] **Step 5: Run** — PASS; full suite.
- [ ] **Step 6: Commit** `feat(settings): add /settings logs and show`.

---

### Task 5: Auto-role validation, assignment, screening, role deletions, intent

**Files:**
- Create: `src/features/settings/config.ts`, `autorole.ts`, `assign.ts`,
  `src/listeners/member-join.ts`, `src/listeners/member-screening.ts`, `src/listeners/role-delete.ts`
- Modify: `src/features/settings/store.ts`, `src/features/settings/index.ts`, `src/client.ts`
- Test: `test/settings-autorole.test.ts`, `test/settings-assign.test.ts`,
  `test/settings-store.test.ts`, `test/member-listeners.test.ts`, `test/client.test.ts`

**Interfaces:**
- Consumes: `logMod` (Task 3), `guildAutoRoles` (Task 1).
- Produces:
  - `config.ts`: `autoRoles = { maxPerTarget: 10 } as const`; `dangerousPermissions: bigint` =
    OR of `Administrator, ManageGuild, ManageRoles, ManageChannels, BanMembers, KickMembers,
    ManageMessages, MentionEveryone, ManageWebhooks, ModerateMembers`.
  - `store.ts` additions:
    - `autoRoles(db: DbOrTx, guildId: string, target: AutoRoleTarget): string[]` (by `createdAt`, then `roleId`)
    - `addAutoRole(db, guildId, roleId, target, now): 'added' | 'exists' | 'full'`
    - `removeAutoRole(db, guildId, roleId, target): boolean`
    - `removeRoleEverywhere(db, guildId, roleId): AutoRoleTarget[]`
  - `autorole.ts`:
    - `interface RoleFacts { id: string; guildId: string; position: number; managed: boolean; permissions: bigint }`
    - `interface BotFacts { highest: number; canManageRoles: boolean }`
    - `interface InvokerFacts { highest: number; isOwner: boolean }`
    - `botCannotAssign(role: RoleFacts, bot: BotFacts): string | undefined` — in order:
      `id === guildId` → ``'`@everyone` can't be an auto-role.'``; `managed` →
      `'That role is managed by an integration.'`; `!canManageRoles` →
      `'I need the Manage Roles permission.'`; `position >= highest` →
      `'That role is at or above my highest role.'`
    - `validateAutoRole(role: RoleFacts, bot: BotFacts, invoker: InvokerFacts): string | undefined`
      — `botCannotAssign`, then `!isOwner && position >= invoker.highest` →
      `'That role is at or above your highest role.'`, then
      `(permissions & dangerousPermissions) !== 0n` →
      `'That role has moderator permissions, so it can't be an auto-role.'`
    - `roleFacts(role: Role): RoleFacts`, `botFacts(guild: Guild): BotFacts` (from `guild.members.me`; none → `{ highest: -1, canManageRoles: false }`)
  - `assign.ts`: `assignAutoRoles(member: GuildMember): Promise<void>` — target from
    `member.user.bot`; empty list returns; partition IDs into assignable (exists in
    `member.guild.roles.cache` and `botCannotAssign` is undefined) and failures (`'role no longer exists'` or the reason);
    one `member.roles.add(ids, 'auto-role')` if any; a rejected add turns every ID into a failure
    with the error message; any failures → `logger.warn` and
    `void logMod(guildId, { type: 'autorole_failed', userId, failures })`. Never throws.
  - Listeners: `MemberJoinListener` (`Events.GuildMemberAdd`): `if (!member.pending) await assignAutoRoles(member)`.
    `MemberScreeningListener` (`Events.GuildMemberUpdate`): `if (old.pending && !member.pending) await assignAutoRoles(member)`.
    `RoleDeleteListener` (`Events.GuildRoleDelete`): `removeRoleEverywhere`; if any target was
    removed, one `logMod(… { type: 'setting_auto_cleared', setting: 'autorole', id, detail: 'role was deleted (removed from <members/bots/members and bots>)' })`.
    All catch and log their own errors.
  - `src/client.ts`: add `GatewayIntentBits.GuildMembers` with the comment
    `// Privileged: enable in the Developer Portal (Bot -> Server Members Intent). Needed for joins, leaves and member fetches.`
    Also add `partials: [Partials.GuildMember]`, so `guildMemberRemove` fires for members that
    were not cached (for example after a restart, before the first member fetch).

- [ ] **Step 1: Write the failing validation tests** (`test/settings-autorole.test.ts`): one
  example per rejection string above; owner bypasses the invoker check but not the bot or
  dangerous checks; a plain low role passes. fast-check: for any non-empty subset of the dangerous
  flags OR'd with arbitrary other bits, `validateAutoRole` returns the moderator-permissions text
  (with role otherwise valid).
- [ ] **Step 2: Write the failing store tests**: `'added'` then `'exists'`; the 11th distinct role
  is `'full'`; the same role may be in `member` and `bot` lists; `removeRoleEverywhere` returns
  both targets.
- [ ] **Step 3: Write the failing assignment tests** (`test/settings-assign.test.ts`) with a stub
  member (`guild.roles.cache` Map of `{ id, position, managed }`, `guild.members.me` with
  `roles.highest.position` and `permissions.has`, `roles.add` mock): humans get the `member` list
  and bots the `bot` list; a missing role and a role above the bot are skipped and reported to the
  mod log (spy on `sendLog` via a fake mod channel); a rejecting `roles.add` resolves and reports
  every role; an empty list never calls `roles.add`.
- [ ] **Step 4: Write the failing listener tests** (`test/member-listeners.test.ts`): join of a
  non-pending member calls `roles.add`; join of a pending member does not; update `pending: true →
  false` calls it; update `false → false` does not. **Review Focus:** role `5` in both lists →
  emit `Events.GuildRoleDelete` with `{ id: '5', guild: { id: '2' } }` → both lists empty and the
  mod channel `send` called exactly once.
- [ ] **Step 5: Add to `test/client.test.ts`:** `requests the Server Members intent` —
  `expect(client.options.intents.has(GatewayIntentBits.GuildMembers)).toBe(true)` and
  `expect(client.options.partials).toContain(Partials.GuildMember)`.
- [ ] **Step 6: Run** the five test files — FAIL.
- [ ] **Step 7: Implement** the files listed in Interfaces.
- [ ] **Step 8: Run** the five test files — PASS; then the full check suite.
- [ ] **Step 9: Commit** `feat(settings): validate and assign auto-roles`.

---

### Task 6: `/settings autorole` and the full `show`

**Files:**
- Modify: `src/commands/admin/settings.ts`
- Test: `test/settings-command.test.ts`

**Interfaces:**
- Consumes: store, `validateAutoRole`, `botCannotAssign`, `roleFacts`, `botFacts` (Task 5), `settingsCard` (Task 4).
- Produces: `autorole` group with `add` and `remove`, each `role` (required) and `target`
  (choices `members`→`member`, `bots`→`bot`; default `member`).
  - `add`: `validateAutoRole(roleFacts(role), botFacts(guild), { highest: interaction.member.roles.highest.position, isOwner: guild.ownerId === user.id })`
    → error reply; else `addAutoRole`: `'exists'` → `'<@&id> is already an auto-role for <members|bots>.'`;
    `'full'` → `'You can have at most 10 auto-roles for <members|bots>.'`; `'added'` →
    `'New <members|bots> will get <@&id>.'` and `void logMod(…'autorole_added')`.
  - `remove`: false → `'<@&id> isn't an auto-role for <members|bots>.'`; true →
    `'<@&id> is no longer given to new <members|bots>.'` and `void logMod(…'autorole_removed')`.
  - `show`: each role's problem is `'role no longer exists'` or `botCannotAssign(...)`.

- [ ] **Step 1: Write the failing tests**: add success (stored, mod channel `send` once); each
  validation error surfaces its text and stores nothing; `exists`; `full`; remove both branches;
  `show` lists `<@&5>` under members and `<@&6> ⚠️ That role is at or above my highest role.`
  under bots.
- [ ] **Step 2: Run** `pnpm vitest run test/settings-command.test.ts` — FAIL.
- [ ] **Step 3: Implement** the `autorole` group and the full `show`.
- [ ] **Step 4: Run** the test file — PASS; then the full check suite.
- [ ] **Step 5: Commit** `feat(settings): add /settings autorole`.

---

### Task 7: Departed members hidden; live leave/rejoin

**Files:**
- Create: `src/features/members/departures.ts`, `src/features/members/index.ts`,
  `src/listeners/member-leave.ts`
- Modify: `src/features/members/config.ts` (from Task 3), `src/listeners/member-join.ts`,
  `src/features/stats/leaderboard.ts`, `src/features/economy/wallets.ts` (`coinsRank`),
  `src/features/presence/snapshot.ts`, `src/commands/economy/eco.ts`,
  `src/features/economy/cards.ts`
- Test: `test/members-departures.test.ts`, `test/stats-leaderboard.test.ts`,
  `test/member-listeners.test.ts`, `test/eco-command.test.ts`, `test/presence-statuses.test.ts`
  (or a new `test/presence-snapshot.test.ts`)

**Interfaces:**
- Consumes: `logEconomy` (Task 3), `assignAutoRoles` (Task 5).
- Produces:
  - `markDeparted(db: DbOrTx, guildId: string, userId: string, now: number): Wallet | undefined`
    — sets `departedAt = now` only where currently null; returns the updated wallet or undefined.
  - `markPresent(db: DbOrTx, guildId: string, userId: string): Wallet | undefined` — clears it
    only where set; returns the updated wallet or undefined.
  - Leaderboard: the `coins` source adds `isNull(wallets.departedAt)`; the `player_stats` sources
    inner join `wallets` on guild and user with the same condition (both `leaderboardPage` and
    `leaderboardRank`).
  - `coinsRank`: undefined for a departed wallet; counts only present wallets ahead.
  - `readPotRow`: `lastWinnerId` and `lastWonAt` undefined when the winner's wallet is missing or departed.
  - `ecoNotAMember = (id: string) => \`<@${id}> is not in this server.\``; `/eco`checks
   `interaction.options.getMember('user') === null` after the bot check.
  - `MemberLeaveListener` (`Events.GuildMemberRemove`): skip bots; `markDeparted` → if a wallet,
    `void logEconomy(guildId, { type: 'member_departed', userId, balance, purgeAt: now + members.graceMs })`.
  - `MemberJoinListener`: for non-bots first `markPresent` → if a wallet,
    `void logEconomy(… 'member_restored')`; then the pending check from Task 5.

- [ ] **Step 1: Write the failing tests:**
  - departures: mark twice keeps the first `departedAt`; `markPresent` on a present wallet returns undefined.
  - leaderboard: for all six categories, a departed user with the top value is absent from
    `leaderboardPage` and `leaderboardRank` is undefined; ranks of the rest close up; `coinsRank`
    undefined for the departed and unaffected by them.
  - listeners: leave marks and posts to the economy channel; leave of a user without a wallet
    posts nothing; rejoin clears and posts `member_restored`. **Review Focus:** rejoin with
    `pending: true` clears `departedAt` and does not call `roles.add`.
  - eco: `refuses a member who left` — `absentMembers: ['1']`, reply contains `ecoNotAMember('1')`, no wallet.
  - presence: a departed last winner yields no `lastWinnerId`.
- [ ] **Step 2: Run** the listed test files — FAIL.
- [ ] **Step 3: Implement** the changes listed in Interfaces.
- [ ] **Step 4: Run** the listed test files — PASS; then the full check suite (the fuzz
  `hostile ids` test must still pass).
- [ ] **Step 5: Commit** `feat(members): hide departed members from boards and ranks`.

---

### Task 8: Purge and daily reconcile

**Files:**
- Create: `src/features/economy/prune.ts`, `src/features/members/reconcile.ts`,
  `src/features/members/job.ts`
- Modify: `src/features/economy/index.ts`, `src/features/members/index.ts`, `src/listeners/ready.ts`
- Test: `test/economy-prune.test.ts`, `test/members-reconcile.test.ts`, `test/members-job.test.ts`

**Interfaces:**
- Consumes: `Job`, `startJobs` (Task 2); `markDeparted`, `markPresent` (Task 7); `logEconomy`.
- Produces:
  - `purgeWallet(tx: DbOrTx, guildId: string, userId: string, now: number): number` — in a nested
    transaction: if balance > 0, `debit` it with reason `'pruned'`; delete `wallets` and
    `player_stats` rows; returns coins removed (0 when no wallet).
  - `interface ReconcileWallet { userId: string; departedAt: number | null }`
  - `interface ReconcilePlan { depart: string[]; restore: string[]; purge: string[] }`
  - `planReconcile(wallets: readonly ReconcileWallet[], memberIds: ReadonlySet<string>, now: number): ReconcilePlan`
    — `purge` only from wallets already departed (`departedAt !== null`) with
    `now - departedAt >= members.graceMs`.
  - `interface ReconcileGuild { id: string; memberCount: number; members: { fetch(): Promise<{ size: number; keys(): IterableIterator<string> }> } }`
  - `interface ReconcileResult { departed: number; restored: number; purged: string[]; coinsRemoved: number }`
  - `reconcileGuild(db: Db, guild: ReconcileGuild, now: number): Promise<ReconcileResult | undefined>`
    — undefined (with `logger.warn`, no writes) when `fetch` throws or `size < members.minFetchRatio * memberCount`;
    otherwise one transaction applying depart/restore/purge; then
    `void logEconomy(guild.id, { type: 'reconcile_summary', … })` only when any count is non-zero.
  - `createMemberReconcileJob(guildId?: string): Job` — `name: 'member-reconcile'`,
    `everyMs: 86_400_000`; `run` reconciles `guildId` only, or every guild in
    `client.guilds.cache`; each guild in its own `try`; resolves `true` only when every guild
    returned a result.
  - `ready.ts`: parse env once, `startPresence(client, env.GUILD_ID)` and
    `startJobs(client, [createMemberReconcileJob(env.GUILD_ID)])`.

- [ ] **Step 1: Write the failing prune tests:** wallet with 700 coins and stats → returns 700,
  a `pruned` row with `delta: -700, balanceAfter: 0`, wallet and stats gone,
  `expectLedgerConsistent` passes; `getOrCreateWallet` afterwards → `startingBalance`, ledger sum
  for the user equals it; zero balance writes no ledger row.
- [ ] **Step 2: Write the failing plan tests:** examples (present missing → depart; departed
  present → restore; departed missing at exactly `graceMs` → purge, at `graceMs - 1` → nothing;
  a present wallet just missing is departed, not purged). fast-check over arbitrary wallet lists
  and member sets: `depart ∪ purge` never intersects `memberIds`; `restore ⊆ memberIds`; every
  purged wallet had `departedAt <= now - graceMs`; the three lists are disjoint.
- [ ] **Step 3: Write the failing job tests** (stub guilds with a `Collection` or `Map` from
  `fetch`): applies a mixed plan and returns the counts; `fetch` rejecting → undefined and no
  wallet changed; `size` 94 of `memberCount` 100 → undefined and no change; nothing to do → no
  economy log `send`. **Review Focus:** `createMemberReconcileJob()` over two cached guilds where
  the first `fetch` rejects → the second still reconciles and `run` resolves `false`.
- [ ] **Step 4: Run** the three test files — FAIL.
- [ ] **Step 5: Implement** `prune.ts`, `reconcile.ts`, `job.ts` and the ready listener change.
- [ ] **Step 6: Run** the three test files — PASS; then the full check suite.
- [ ] **Step 7: Commit** `feat(members): reconcile and purge departed members daily`.

---

### Task 9: Economy log wiring

**Files:**
- Create: `src/features/logs/economy.ts`
- Modify: `src/features/logs/index.ts`, `src/commands/economy/eco.ts`,
  `src/features/gamba/spin.ts`, `src/commands/misc/coinflip.ts`,
  `src/interaction-handlers/coinflip-buttons.ts`
- Test: `test/logs-economy.test.ts`, plus one wiring assertion each in `test/eco-command.test.ts`,
  `test/gamba-spin.test.ts`, `test/coinflip-command.test.ts`, `test/coinflip-buttons.test.ts`

**Interfaces:**
- Consumes: `WagerSpin` (`bet`, `payout`, `potWon`, `evaluation.result`), `BotFlip` (`bet`,
  `won`, `rake`), `ChallengeRequest` + `SettledChallenge` (`winnerId`, `rake`), `logThresholds`.
- Produces (pure):
  - `spinLogEvent(userId: string, played: WagerSpin, roleAssigned: boolean | undefined): EconomyEvent | undefined`
    — jackpot → `jackpot` (`roleAssigned ?? false`); else `bet >= bigSpin || payout >= bigSpin` →
    `big_spin`; else undefined.
  - `botFlipLogEvent(userId: string, flip: BotFlip): EconomyEvent | undefined` — `bet >= bigFlip`
    → `{ type: 'big_flip', mode: 'bot', playerIds: [userId], winnerId: flip.won ? userId : undefined, … }`.
  - `challengeLogEvent(request: ChallengeRequest, settled: SettledChallenge): EconomyEvent | undefined`
    — `bet >= bigFlip` → `playerIds: [challengerId, acceptorId]`, `winnerId: settled.winnerId`.
  - Wiring: `spin()` after `settleSpin` (`const event = spinLogEvent(...); if (event) void logEconomy(request.guildId, event)`);
    `/eco` after the reply → `admin_adjust`; coinflip `flipBot`, button `flipAgain` and `accept`
    after their reply/update.

- [ ] **Step 1: Write the failing pure tests:** jackpot with a 10,000 bet yields only `jackpot`;
  bet 4,999 / payout 4,999 → undefined; bet 5,000 → `big_spin`; payout 5,000 on a 100 bet →
  `big_spin`; flips at 4,999 and 5,000; bot loss → `winnerId` undefined.
- [ ] **Step 2: Write the failing wiring tests:** with the economy channel set to a fake channel,
  `/eco give user:1 amount:500 reason:event` → `send` called once, payload text contains `'<@1>'`,
  `'500'` and `'event'`;
  a forced jackpot spin → one `send`; a 5,000 bot flip → one `send`; an accepted 5,000 challenge →
  one `send`; a 10-coin spin → none.
- [ ] **Step 3: Run** the listed test files — FAIL.
- [ ] **Step 4: Implement** `economy.ts` and the four call sites.
- [ ] **Step 5: Run** the listed test files — PASS; then the full check suite.
- [ ] **Step 6: Commit** `feat(logs): log admin adjustments, jackpots and big wins`.

---

### Task 10: Fuzz departures in the economy model run

**Files:**
- Modify: `test/fuzz-economy.test.ts`

**Interfaces:**
- Consumes: `markDeparted`, `markPresent` (Task 7), `purgeWallet` (Task 8), `members.graceMs`.

- [ ] **Step 1: Extend the model:** ops `{ kind: 'leave', who }`, `{ kind: 'rejoin', who }`,
  `{ kind: 'purge' }` (purges every departed wallet with `now - departedAt >= members.graceMs`, in
  one transaction, as `reconcileGuild` would); add `members.graceMs` to the `wait` constants.
  Track `removed` (sum of returned coins). New invariants in `expectInvariants`:
  - sum of all wallet balances equals the sum of all ledger deltas (purges included);
  - the sum of `pruned` ledger deltas equals `-removed`;
  - no departed wallet appears in `leaderboardPage(db, g, 'coins', 0).rows`, and
    `leaderboardRank`/`coinsRank` are undefined for every departed wallet.
- [ ] **Step 2: Run** `pnpm vitest run test/fuzz-economy.test.ts` — PASS within the existing
  30 s timeout (if a real failure appears, fix the code in the owning task's files, not the model).
- [ ] **Step 3: Commit** `test: fuzz member departures in the economy model run`.

---

### Task 11: Docs

**Files:**
- Modify: `AGENTS.md`, `README.md`

- [ ] **Step 1: AGENTS.md** — layout entries: `commands/admin/` (`/settings`), `features/logs/`,
  `features/members/`, `features/scheduler/`, `features/settings/`, and the new listeners. Discord
  notes: the **Server Members** privileged intent (joins, leaves, member fetch; without it the
  reconcile always skips and auto-roles never fire); auto-roles need Manage Roles with the bot's
  highest role above them. Conventions: a new way to move coins with user impact should consider
  an economy log event; logging is fire-and-forget after commit.
- [ ] **Step 2: README.md** — enabling the Server Members intent and first-time setup
  (`/settings logs set`, `/settings autorole add`, `/settings show`).
- [ ] **Step 3: Run** `pnpm lint` — PASS.
- [ ] **Step 4: Commit** `docs: document members, settings and log channels`, then open the PR
  (`gh pr create`, body ending with the Claude Code attribution line).
