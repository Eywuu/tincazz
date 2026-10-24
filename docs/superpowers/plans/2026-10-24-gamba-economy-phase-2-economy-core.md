# Gamba Economy Phase 2 (Economy Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every member a coin wallet backed by an append-only ledger, with `/balance`,
`/daily`, `/bailout`, chat rewards and moderator `/eco give|take`, and make free `?gamba` triples
pay coin prizes recorded in `spins` and `player_stats`.

**Architecture:** `src/features/economy/` is the only code that changes balances. Every operation
is a synchronous `db.transaction(...)` that updates `wallets` and appends to `ledger` through
`credit` / `debit`. `src/features/gamba/` gains outcome keys, a pure `evaluate(reels)` and
`playFree`, which settles a free spin in one transaction. `src/features/ui/` holds the shared
Components V2 card helpers; commands stay thin (parse, call a feature function, render a card).

**Tech Stack:** TypeScript (NodeNext ESM), Sapphire 5.5 / discord.js 14.27 (Components V2
builders), better-sqlite3 + drizzle-orm 0.45, drizzle-kit, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-10-24-gamba-economy-design.md` (sections "Outcomes",
"Free spin", "Coin income", "Data model", "Economy API", "UI > Style", "Error handling",
"Testing", "Delivery" item 2)

## Global Constraints

- Branch `feat/gamba-economy-core` from `main` **after PR #5 (phase 1) merges**. This phase is one
  PR. Commit this plan as the branch's first commit (`docs: add gamba economy phase 2 plan`).
- Every commit: Conventional Commits, and `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
  passes. End each commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Relative imports use `.js`; type-only imports use `import type`. Log via `container.logger`.
- Coin amounts and timestamps are integers; timestamps are epoch ms (UTC). Feature functions take
  `now: number`; only commands and listeners call `Date.now()`.
- Storage uses outcome keys (`head`, `cry`, `grr`, `nails`, `raa`, `spooked`, `python`, `cpp`);
  emoji strings are display only.
- Invariant: for every wallet, `balance` equals the sum of its ledger `delta`s, and its newest
  ledger row's `balance_after` equals `balance`.
- Coins never move between players. No transfers.
- New slash commands are guild-only (`setContexts(InteractionContextType.Guild)`) and reply with
  Components V2 (`MessageFlags.IsComponentsV2`). Errors reply ephemerally.
- Mentions in cards never ping: rely on the client default (`parse: []`), do not opt in.
- Schema changes: edit `src/db/schema.ts`, run `pnpm db:generate --name <change>`, commit both.
- `?gamba` keeps today's text reply and follow-up (no cards until phase 3). `?gamba <text>` still
  ignores the text in this phase.
- Out of scope here: wagers, pot, `/gamba`, buttons, announcements cards, `/stats`, `/leaderboard`.

## Review Focus

1. The Discord reply (or the jackpot role) fails after a free spin commits: the prize, spin row and
   stats must stand, and the error is logged. Task 7.
2. A bot is passed as `user` to `/balance` or `/eco`: reply "Bots don't have wallets." and create
   nothing. Tasks 3 and 6.
3. Two wallets tie on balance and their user IDs differ in length (`'9'` vs `'10'`): rank must
   order by numeric snowflake, not text. Task 2.
4. A user's very first interaction is `/daily`: the wallet is created with its `start` row, then
   the daily is credited (balance 1,250), and the ledger still sums. Task 4.
5. `/eco take` from a user with no wallet for more than the starting balance: the take fails and
   no wallet or ledger row is left behind (creation rolls back too). Task 6.

---

## File Structure

| File                                                   | Responsibility                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| `src/features/gamba/outcomes.ts` (modify)              | Outcome keys, `GambaOutcome`, emoji lookup                         |
| `src/features/gamba/config.ts` (create)                | `freePrizes`                                                       |
| `src/features/gamba/evaluate.ts` (create)              | Pure `evaluate(reels)`                                             |
| `src/features/gamba/play.ts` (create)                  | `playFree`: roll, spin row, prize, stats in one transaction        |
| `src/features/gamba/stats.ts` (create)                 | `recordFreeSpinStats` upsert into `player_stats`                   |
| `src/features/gamba/index.ts` (modify)                 | Public surface; reels become keys; follow-up shows prize/balance   |
| `src/db/schema.ts` (modify), `drizzle/0001_*` (gen)    | `ledger.note` column                                               |
| `src/db/index.ts` (modify)                             | `Tx`, `DbOrTx` types                                               |
| `src/features/economy/config.ts` (create)              | All economy constants                                              |
| `src/features/economy/errors.ts` (create)              | Typed errors                                                       |
| `src/features/economy/wallets.ts` (create)             | `getOrCreateWallet`, `findWallet`, `coinsRank`                     |
| `src/features/economy/ledger.ts` (create)              | `credit`, `debit`                                                  |
| `src/features/economy/daily.ts`, `bailout.ts` (create) | `claimDaily`, `claimBailout`                                       |
| `src/features/economy/chat.ts` (create)                | `isChatRewardable`, `rewardChat`                                   |
| `src/features/economy/admin.ts` (create)               | `adminAdjust`                                                      |
| `src/features/economy/cards.ts` (create)               | Economy cards and error copy                                       |
| `src/features/economy/index.ts` (create)               | Public surface                                                     |
| `src/features/ui/index.ts` (create)                    | Accents, `card`, `cardReply`, `errorReply`, `coins`, `discordTime` |
| `src/commands/economy/{balance,daily,bailout,eco}.ts`  | Thin slash commands                                                |
| `src/listeners/chat-reward.ts` (create)                | `messageCreate` -> `rewardChat`                                    |
| `src/commands/misc/gamba.ts` (modify)                  | Use `playFree`; role after commit                                  |
| `test/support/interaction.ts` (create)                 | `makeChatInput` stub for slash command tests                       |
| `test/support/ledger.ts` (create)                      | `expectLedgerConsistent(db)`                                       |
| `README.md`, `AGENTS.md` (modify)                      | Commands and layout                                                |

---

### Task 1: Outcome keys and spin evaluation

Pure refactor plus `evaluate`. The bot's visible behaviour is unchanged.

**Files:**
- Modify: `src/features/gamba/outcomes.ts`, `src/features/gamba/index.ts`
- Create: `src/features/gamba/config.ts`, `src/features/gamba/evaluate.ts`
- Test: `test/gamba.test.ts`, new `test/gamba-evaluate.test.ts`

**Interfaces:**
- Produces:
  - `outcomeKeys` (const tuple, order as above), `type OutcomeKey`,
    `interface GambaOutcome { key: OutcomeKey; emoji: string; weight: number }`,
    `gambaOutcomes: readonly GambaOutcome[]` (same emojis and weights as today),
    `outcomeEmoji(key: OutcomeKey): string`. `cppEmoji` / `pythonEmoji` constants go away.
  - `type Reels = readonly [OutcomeKey, OutcomeKey, OutcomeKey]`; `spinGamba(randomInt?)` returns
    keys; `isJackpot` / `threeOfAKindOdds` take keys; `formatGambaReply(reels)` still returns the
    three emojis joined by spaces.
  - `freePrizes = { yt: 50, python: 500, cpp: 2_500 } as const` in `config.ts`.
  - `interface Evaluation { result: SpinResult; freePrize: number; odds: number | undefined }`
    (`SpinResult` from `src/db/schema.ts`), `evaluate(reels: Reels): Evaluation`. `result` is
    `jackpot` for cpp x3, `triple` for other triples, `pair` for exactly two equal reels, else
    `none`. `odds` is `threeOfAKindOdds(reels)`.

- [ ] **Step 1: Update `test/gamba.test.ts`** so `spinGamba` expectations use keys
  (`['head', 'cpp', 'python']` for draws `[0, 20, 18]`), and add: outcome keys are unique and equal
  `outcomeKeys`; `formatGambaReply(['head', 'cpp', 'python'])` is the three emojis.
- [ ] **Step 2: Write `test/gamba-evaluate.test.ts`.** Enumerate all 21^3 draws through
  `spinGamba` and assert: result counts `{ none: 5886, pair: 3204, triple: 170, jackpot: 1 }`;
  total `freePrize` = 14,600; `evaluate(['cpp','cpp','cpp'])` is
  `{ result: 'jackpot', freePrize: 2500, odds: 9261 }`; python x3 → `triple`, 500, 1158;
  head x3 → `triple`, 50, 343; `['head','head','cpp']` → `pair`, 0, `undefined`.
- [ ] **Step 3: Run** `pnpm vitest run test/gamba.test.ts test/gamba-evaluate.test.ts`.
  Expected: FAIL.
- [ ] **Step 4: Implement** the interfaces above. `formatGambaFollowUp` checks python/cpp by key.
- [ ] **Step 5: Run** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. Expected: PASS,
  including the unchanged `test/gamba-command.test.ts`.
- [ ] **Step 6: Commit** `refactor(gamba): key outcomes by name and evaluate spin results`

---

### Task 2: Wallets and ledger

**Files:**
- Modify: `src/db/schema.ts`, `src/db/index.ts`; generate `drizzle/0001_ledger_note.sql`
- Create: `src/features/economy/{config,errors,wallets,ledger,index}.ts`,
  `test/support/ledger.ts`
- Test: `test/economy-ledger.test.ts`

**Interfaces:**
- Produces:
  - `ledger.note: text('note')` (nullable): the moderator's free-text reason for admin rows.
  - `type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]`, `type DbOrTx = Db | Tx` in
    `src/db/index.ts`.
  - `config.ts`: `startingBalance = 1_000`; `daily = { base: 200, perStreakDay: 50, streakCap: 7 }`;
    `bailout = { amount: 200, belowBalance: 10, cooldownMs: 3_600_000 }`;
    `chatReward = { amount: 5, cooldownMs: 60_000 }`;
    `admin = { maxAmount: 1_000_000, reasonMaxLength: 200 }`.
  - `errors.ts`: `EconomyError extends Error`; subclasses
    `InsufficientFundsError(balance: number, needed: number)`,
    `AlreadyClaimedError(nextAt: number)`, `NotEligibleError(balance: number)`,
    `CooldownError(availableAt: number)`, each exposing its arguments as readonly fields.
  - `type Wallet = typeof wallets.$inferSelect`.
  - `getOrCreateWallet(db: DbOrTx, guildId: string, userId: string, now: number): Wallet`: inserts
    the wallet at balance 0 and `credit`s `startingBalance` with reason `start`, inside
    `db.transaction` (a savepoint when `db` is already a transaction).
  - `findWallet(db: DbOrTx, guildId, userId): Wallet | undefined` (never creates).
  - `coinsRank(db: DbOrTx, guildId, userId): number | undefined`: 1 + wallets in the guild with a
    higher balance, or an equal balance and a smaller `cast(user_id as integer)`.
  - `interface LedgerEntry { guildId; userId; amount: number; reason: LedgerReason; now: number;
    ref?: number; actorId?: string; note?: string }`.
  - `credit(tx: DbOrTx, entry: LedgerEntry): number` and `debit(tx: DbOrTx, entry): number`
    return the new balance. Both throw `RangeError` unless `amount` is a positive integer and
    `Error` if the wallet does not exist. `debit` throws `InsufficientFundsError` instead of going
    negative. Ledger `delta` is `+amount` / `-amount`.
  - `test/support/ledger.ts`: `expectLedgerConsistent(db: Db): void` asserts the invariant for
    every wallet.

- [ ] **Step 1: Schema.** Add `note` to `ledger`, then `pnpm db:generate --name ledger_note`.
- [ ] **Step 2: Write `test/economy-ledger.test.ts`** (fresh `openDatabase(':memory:')` per test):
  - `getOrCreateWallet` creates balance 1,000 with one `start` ledger row; a second call returns
    the same wallet and adds no row.
  - `credit` then `debit` return the running balance and write `balance_after`, `ref`, `actorId`,
    `note`.
  - `debit` above the balance throws `InsufficientFundsError` with `balance` 1,000 and `needed`,
    and both tables are unchanged.
  - `credit` with 0, -5 or 1.5 throws `RangeError`.
  - Random sequence: a seeded LCG drives 500 credits/debits over 5 users (catching insufficient
    funds), then `expectLedgerConsistent`.
  - `coinsRank`: three users at 1,500 / 1,000 / 1,000 rank 1, 2, 3; users `'9'` and `'10'` at
    equal balance rank `'9'` first; unknown user → `undefined`.
- [ ] **Step 3: Run** `pnpm vitest run test/economy-ledger.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** the interfaces above.
- [ ] **Step 5: Run** the full check. Expected: PASS (CI drift check: `pnpm db:generate` leaves
  `drizzle/` unchanged).
- [ ] **Step 6: Commit** `feat(economy): add wallets and an append-only ledger`

---

### Task 3: Card helpers and `/balance`

**Files:**
- Create: `src/features/ui/index.ts`, `src/features/economy/cards.ts`,
  `src/commands/economy/balance.ts`, `test/support/interaction.ts`
- Test: `test/ui-cards.test.ts`, `test/balance-command.test.ts`

**Interfaces:**
- Consumes: Task 2 `getOrCreateWallet`, `findWallet`, `coinsRank`.
- Produces:
  - `accents = { loss: 0x95a5a6, win: 0x2ecc71, gold: 0xf1c40f, error: 0xe74c3c,
    brand: 0x5865f2 }`.
  - `card(accent: number, ...texts: string[]): ContainerBuilder`, with one `TextDisplay` per text.
  - `cardReply(container, options?: { ephemeral?: boolean })` returns `{ components: [container],
    flags }`, where `flags` is `IsComponentsV2`, plus `Ephemeral` when requested.
  - `errorReply(text: string)` = `cardReply(card(accents.error, text), { ephemeral: true })`.
  - `coins(n: number): string` (`en-US` grouping), `discordTime(ms: number): string`
    (`<t:${Math.floor(ms / 1000)}:R>`).
  - `balanceCard(userId: string, wallet: { balance: number; rank: number } | undefined)`:
    brand accent; texts `## Balance`, `<@id> has **1,050** coins`, `-# Rank #2 by coins`. Without
    a wallet: `## Balance`, `<@id> hasn't played yet.`
  - `botsHaveNoWallets = "Bots don't have wallets."`
  - `makeChatInput(client, { commandName, userId, guildId, options?, subcommand? })`: an
    interaction stub like `test/ping.test.ts`, with `options.getUser/getInteger/getString/
    getSubcommand` backed by the record, and `reply` / `editReply` as `vi.fn`.
- `/balance [user]`: no `user`, or `user` is the caller → `getOrCreateWallet`, then show it.
  Another human → `findWallet` (no creation). A bot → `errorReply(botsHaveNoWallets)`.

- [ ] **Step 1: Write `test/ui-cards.test.ts`:** `card(...).toJSON()` has the accent and the text
  displays in order; `cardReply` flags with and without `ephemeral`; `coins(1234567)` is
  `'1,234,567'`; `discordTime(1_700_000_000_999)` is `'<t:1700000000:R>'`; both `balanceCard`
  variants.
- [ ] **Step 2: Write `test/balance-command.test.ts`** (one client per file, `container.db` set
  fresh in `beforeEach`):
  - `/balance` with no user creates the caller's wallet and replies 1,000, rank 1.
  - `/balance user:<other human>` without a wallet replies "hasn't played yet" and
    `findWallet` stays `undefined`.
  - `/balance user:<bot>` replies ephemerally with `botsHaveNoWallets`, and no wallet is created.
- [ ] **Step 3: Run** both tests. Expected: FAIL.
- [ ] **Step 4: Implement** the helpers, the card and the command (slash only, guild-only).
- [ ] **Step 5: Run** the full check. Expected: PASS.
- [ ] **Step 6: Commit** `feat(economy): add /balance with a components v2 card`

---

### Task 4: `/daily` and `/bailout`

**Files:**
- Create: `src/features/economy/daily.ts`, `src/features/economy/bailout.ts`,
  `src/commands/economy/daily.ts`, `src/commands/economy/bailout.ts`
- Modify: `src/features/economy/cards.ts`, `src/features/economy/index.ts`
- Test: `test/economy-claims.test.ts`, `test/claims-command.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 3.
- Produces:
  - `utcDay(now: number): number` = `Math.floor(now / 86_400_000)`.
  - `dailyAmount(streak: number): number` = `200 + 50 * min(streak, 7)`.
  - `claimDaily(db: Db, guildId, userId, now): { amount; balance; streak; nextAt }`. A claim on the
    same UTC day as `lastDailyAt` throws `AlreadyClaimedError(nextAt)`. A claim on the next day
    continues the streak, and any gap resets it to 1. `nextAt` is the start of the next UTC day.
    The stored streak is not capped.
  - `claimBailout(db: Db, guildId, userId, now): { amount; balance }`. It throws
    `NotEligibleError(balance)` when the balance is >= 10 (checked first), then
    `CooldownError(lastBailoutAt + 3_600_000)` when inside the hour. Exactly one hour later is
    allowed.
  - `dailyCard(result)`: win accent; `## Daily claimed`, `+250 coins · streak 1 day` (`days` when
    the streak is more than 1), `-# Balance: 1,250 · next claim <t:…:R>`.
  - `bailoutCard(result)`: win accent; `## Bailout`, `+200 coins`, `-# Balance: 205`.
  - `claimErrorText(error: unknown): string | undefined` returns:
    - `You already claimed today's daily. Next claim <t:…:R>.`
    - `Bailout is only for balances under 10 coins. You have 1,050.`
    - `You already took a bailout. Next one <t:…:R>.`
    - `undefined` for anything else. Commands rethrow those errors so the generic error listener
      handles them.

- [ ] **Step 1: Write `test/economy-claims.test.ts`.** Each case calls `expectLedgerConsistent` at
  the end:
  - Daily: day 1 pays 250, streak 1. Consecutive days pay 300, 350, and so on. Day 7 pays 550 and
    day 9 still pays 550 with streak 9. A gap of 2 days resets the streak to 1 (250). A second
    claim on the same UTC day throws with `nextAt` at the next midnight.
  - Midnight: a claim at `D*86_400_000 - 1` followed by one at `D*86_400_000` both succeed, and
    the streak is 2.
  - First interaction: on a fresh database, `claimDaily` leaves balance 1,250 and ledger rows
    `start`, `daily`.
  - Bailout: a balance of 1,000 throws `NotEligibleError(1000)`. After a debit to 5 it pays 200.
    A claim after another debit to 5 within the hour throws `CooldownError` (`availableAt` =
    first claim + 3,600,000). Exactly one hour later it succeeds.
- [ ] **Step 2: Write `test/claims-command.test.ts`.** `/daily` replies with a V2 card containing
  `+250 coins`. A second `/daily` replies ephemerally with the already-claimed text. `/bailout` at
  1,000 replies ephemerally with the not-eligible text.
- [ ] **Step 3: Run** both tests. Expected: FAIL.
- [ ] **Step 4: Implement.** Each claim reads and writes the wallet inside one `db.transaction`.
- [ ] **Step 5: Run** the full check. Expected: PASS.
- [ ] **Step 6: Commit** `feat(economy): add /daily and /bailout`

---

### Task 5: Chat rewards

**Files:**
- Create: `src/features/economy/chat.ts`, `src/listeners/chat-reward.ts`
- Modify: `src/features/economy/index.ts`, `test/gamba-command.test.ts` (set `container.db`)
- Test: `test/economy-chat.test.ts`, `test/chat-reward.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `interface ChatMessageLike { author: { bot: boolean }; webhookId: string | null;
    system: boolean; guildId: string | null; content: string }`.
  - `isChatRewardable(message: ChatMessageLike, prefixes: readonly string[]): boolean` returns
    false for bots, webhooks, system messages, DMs (`guildId === null`), and content starting with
    any prefix.
  - `rewardChat(db: Db, guildId, userId, now): { amount: number; balance: number } | null` returns
    `null` (writing nothing) when less than 60,000 ms have passed since `lastChatRewardAt`.
    Otherwise it credits 5 (`chat`) and sets `lastChatRewardAt`.
  - Listener `ChatReward` on `Events.MessageCreate`. It reads the prefixes from
    `this.container.client.options.defaultPrefix`, normalised from string, array or null.

- [ ] **Step 1: Write `test/economy-chat.test.ts`:**
  - `isChatRewardable` for each ignored kind and for a normal message.
  - `rewardChat` pays 5 at `t`, returns `null` at `t + 59_999`, and pays again at `t + 60_000`.
  - `expectLedgerConsistent` passes.
- [ ] **Step 2: Write `test/chat-reward.test.ts`.** Emit `MessageCreate` with a plain `hello`
  message and wait until the wallet balance is 1,005. Emit `?ping` and a bot message, and check
  that neither creates a wallet.
- [ ] **Step 3: Run** both tests. Expected: FAIL.
- [ ] **Step 4: Implement.** Also set `container.db = openDatabase(':memory:')` in
  `test/gamba-command.test.ts`'s `beforeAll`, since the listener now runs on every message.
- [ ] **Step 5: Run** the full check. Expected: PASS.
- [ ] **Step 6: Commit** `feat(economy): reward chat activity`

---

### Task 6: `/eco give|take`

**Files:**
- Create: `src/features/economy/admin.ts`, `src/commands/economy/eco.ts`
- Modify: `src/features/economy/cards.ts`, `src/features/economy/index.ts`
- Test: `test/economy-admin.test.ts`, `test/eco-command.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 3.
- Produces:
  - `adminAdjust(db: Db, input: { guildId; userId; actorId: string; action: 'give' | 'take';
    amount: number; reason: string; now: number }): { amount: number; balance: number }`.
    - It throws `RangeError` unless `amount` is an integer from 1 to 1,000,000 and the trimmed
      `reason` is 1 to 200 characters long.
    - It runs `getOrCreateWallet`, then `credit` (`admin_grant`) or `debit` (`admin_take`) with
      `actorId` and `note` = the trimmed reason, all in one transaction.
    - A take larger than the balance throws `InsufficientFundsError`.
  - `adminCard(action, userId, result, reason)`:
    - brand accent;
    - `Gave **500** coins to <@id>. New balance: 1,500.` or `Took **500** coins from <@id>. New
      balance: 500.`;
    - `-# Reason: <reason>`.
  - `/eco`:
    - subcommands `give` and `take`, each with options `user` (required), `amount` (integer,
      required, min 1, max 1,000,000) and `reason` (string, required, max length 200);
    - `setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)`;
    - every reply is ephemeral;
    - a bot target gets `botsHaveNoWallets`;
    - insufficient funds gets `<@id> only has 300 coins.`

- [ ] **Step 1: Write `test/economy-admin.test.ts`:**
  - Give 500 leaves balance 1,500. The ledger row has `admin_grant`, `actorId` and `note`.
  - Take 200 leaves balance 1,300 (`admin_take`).
  - Take 5,000 throws `InsufficientFundsError` and changes nothing.
  - Take 1,500 from a user with no wallet throws, and the `wallets` and `ledger` tables stay
    empty.
  - Amounts 0, 1,000,001 and 2.5, and the reasons `'   '` and a 201-character string, each throw
    `RangeError`.
  - `expectLedgerConsistent` passes.
- [ ] **Step 2: Write `test/eco-command.test.ts`:**
  - `/eco give` replies ephemerally with the give text.
  - `/eco take` above the balance replies ephemerally with the "only has" text.
  - A bot target replies with `botsHaveNoWallets` and creates no wallet.
  - The registered command data has `default_member_permissions` equal to the Manage Server bit.
- [ ] **Step 3: Run** both tests. Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** the full check. Expected: PASS.
- [ ] **Step 6: Commit** `feat(economy): add /eco give and take for moderators`

---

### Task 7: Free spin prizes, spin records and stats

**Files:**
- Create: `src/features/gamba/play.ts`, `src/features/gamba/stats.ts`
- Modify: `src/features/gamba/index.ts`, `src/commands/misc/gamba.ts`, `README.md`, `AGENTS.md`
- Test: `test/gamba-play.test.ts`, `test/gamba-command.test.ts`

**Interfaces:**
- Consumes: Task 1 `spinGamba`, `evaluate`; Task 2 `getOrCreateWallet`, `credit`.
- Produces:
  - `playFree(db: Db, guildId, userId, now, randomInt?: RandomInt): { reels: Reels;
    evaluation: Evaluation; prize: number; balance: number; spinId: number }`. In one transaction
    it:
    1. creates the wallet if needed;
    2. inserts a `spins` row: `mode 'free'`, `reels` = keys joined by `,`, `result`, `bet 0`,
       `payout` = the prize, `pot_won 0`;
    3. credits the prize (`free_prize`, `ref` = spin ID) when it is above 0;
    4. calls `recordFreeSpinStats`.
  - `recordFreeSpinStats(tx: DbOrTx, guildId, userId, evaluation: Evaluation): void` upserts
    `player_stats`:
    - `spins` +1;
    - `wins` +1 if the prize is above 0;
    - `jackpots` +1 on `jackpot`;
    - `biggest_win` = `max(biggest_win, prize)`;
    - `best_odds` = `max(best_odds, odds)` for triples;
    - `wagered` and `won` stay untouched.
  - `formatGambaFollowUp(userMention, reels, prize: { amount: number; balance: number },
    jackpot?)` inserts the line `+50 coins (balance: 1,050)` after the jackpot line and before
    the odds line.
  - `?gamba` order:
    1. `playFree` (committed);
    2. the jackpot role, when won;
    3. the reels reply;
    4. the follow-up.
       A failure after step 1 never undoes it.

- [ ] **Step 1: Write `test/gamba-play.test.ts`:**
  - A head x3 roll (draws `0,0,0`) gives prize 50 and balance 1,050. The spin row is
    `head,head,head` / `triple` / payout 50. Stats are spins 1, wins 1, biggest_win 50,
    best_odds 343.
  - A losing roll writes a `none` row with payout 0, no `free_prize` row, spins 1 and wins 0.
  - cpp x3 gives jackpots 1, biggest_win 2,500 and best_odds 9,261.
  - After a later head x3, best_odds stays 9,261.
  - `expectLedgerConsistent` passes.
- [ ] **Step 2: Update `test/gamba-command.test.ts`:**
  - Use a fresh `container.db` per test.
  - Expected follow-ups gain the prize line, for example
    ``'<@1> won!\n+50 coins (balance: 1,050)\n`Odds: 1 in 343`'``. Jackpot:
    `+2,500 coins (balance: 3,500)` after the role line.
  - New test: when `message.reply` rejects, the wallet still shows 1,050 and one `spins` row
    exists.
  - New test: when the jackpot role fails, the balance is still 3,500.
- [ ] **Step 3: Run** both tests. Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Docs.**
  - README: replace the "Currently implemented" line with a short list: `?ping` / `/ping`,
    `?gamba` (free spins with coin prizes), `/balance`, `/daily`, `/bailout`, chat rewards,
    `/eco` (Manage Server).
  - AGENTS.md layout: add `features/economy/` (the only code that changes balances),
    `features/ui/` (shared card helpers) and `commands/economy/`.
- [ ] **Step 6: Run** the full check. Expected: PASS.
- [ ] **Step 7: Commit**
  - `feat(gamba): pay free spin prizes and record spins and stats` (code and tests)
  - `docs: document economy commands and layout` (README and AGENTS.md)

---

## Done when

- Every task is committed on `feat/gamba-economy-core`, and the full check passes on each commit.
- CI is green, including the migration drift check. The PR is opened against `main`, titled
  `feat(economy): add wallets, daily, bailout, chat rewards and /eco (phase 2)`.
- Manual smoke test on the dev guild:
  - `/balance`, `/daily` twice, `/bailout`;
  - a chat message, then `/balance` shows +5;
  - `/eco give` from a moderator, and `/eco` is hidden from non-moderators;
  - `?gamba` until a triple shows the prize line.
