# Gamba Economy Phase 3 (Gamba v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add wagered spins with a progressive pot to `?gamba` and a new `/gamba`, render every
spin as a Components V2 card with Spin again / Double buttons, and announce triples in a separate
gold card.

**Architecture:** `src/features/gamba/` gains pure payout, bet and pot logic, `playWager` (one
transaction like `playFree`), cards, custom IDs and a shared `spin()` flow that returns
`{ card, announcement? }`. `?gamba`, `/gamba` and the new `interaction-handlers/gamba-buttons.ts`
only deliver those messages and pass a jackpot role callback.

**Tech Stack:** TypeScript (NodeNext ESM), Sapphire 5.5 / discord.js 14.27 (Components V2
builders, `InteractionHandler`), better-sqlite3 + drizzle-orm 0.45, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-10-24-gamba-economy-design.md` (sections "Outcomes",
"Wagered spin", "Progressive pot", "Data model", "Economy API", "UI", "Architecture", "Error
handling", "Testing", "Delivery" item 3)

## Global Constraints

- Branch `feat/gamba-v2` (already created, holds the spec update). One PR. This plan is committed
  as `docs: add gamba economy phase 3 plan`.
- Every commit: Conventional Commits, and `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
  passes. End each commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Relative imports use `.js`; type-only imports use `import type`. Log via `container.logger`.
- Coin amounts and timestamps are integers (epoch ms, UTC). Feature functions take `now: number`;
  only commands and handlers call `Date.now()`.
- `src/features/economy/` stays the only code that changes balances: gamba uses `credit`, `debit`
  and `getOrCreateWallet`, never writes `wallets` or `ledger` itself.
- Bet range 10 to 10,000. Payout `floor(bet * bps / 10_000)`, stake included. Pot seed 10,000,
  contribution `max(1, floor(bet * 3 / 100))`, full pot share at bet >= 500.
- No schema change: `spins`, `pots` and the `player_stats` wager columns exist since phase 1.
  `pnpm db:generate` must leave `drizzle/` unchanged.
- Result cards never ping. Only the announcement opts in, with `allowedMentions: { users: [winnerId] }`.
- No win gif anywhere; `gambaWinGif` is deleted.
- Slash command and button errors are ephemeral; `?gamba` errors are a normal red card reply.
- Out of scope: `/stats`, `/leaderboard`, `lb:*` components (phase 4).

## Review Focus

1. A stale button (balance dropped below the bet since the card was drawn, or two fast clicks):
   ephemeral insufficient-funds reply, card not updated, no new `spins`/`ledger` rows. Task 7.
2. `?gamba all` with a balance above 10,000 bets exactly 10,000; any bet with a balance under 10
   says "You have 5 coins. `/bailout` is available." Tasks 2 and 6.
3. A wagered cpp x3 with a small bet and a big pot pays the proportional share and the pot never
   drops below 10,000. Task 3.
4. The announcement reply fails (message deleted, missing permission) after the spin committed:
   the result card was already sent, coins/spin/stats stand, the error reaches the logger. Task 6.
5. A tampered or foreign custom ID (`gamba:again:1:999999`, `gamba:again:abc:10`,
   `gamba:double:1:0`, `other:thing`) is ignored: no reply, no database change. Tasks 5 and 7.

---

## File Structure

| File                                                 | Responsibility                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `src/features/gamba/config.ts` (modify)              | `wager`, `payoutTiers`, `payoutBps`, `pot` constants           |
| `src/features/gamba/evaluate.ts` (modify)            | `Evaluation` gains `tier` and `payoutBps`                      |
| `src/features/gamba/bet.ts` (create)                 | `parseBet`, `InvalidBetError`                                  |
| `src/features/gamba/pot.ts` (create)                 | `potContribution`, `potShare`, `settlePot`                     |
| `src/features/gamba/play.ts` (modify)                | `playWager`; `FreeSpin` gains `mode`                           |
| `src/features/gamba/stats.ts` (modify)               | `recordWagerSpinStats`                                         |
| `src/features/gamba/custom-ids.ts` (create)          | Encode/decode spin button IDs                                  |
| `src/features/gamba/cards.ts` (create)               | Result cards, announcement, buttons, `spinErrorText`           |
| `src/features/gamba/jackpot.ts` (create)             | `assignJackpotRole`                                            |
| `src/features/gamba/spin.ts` (create)                | `spin()` flow shared by every entry point                      |
| `src/features/gamba/index.ts` (modify)               | Public surface; text formatters removed                        |
| `src/features/gamba/outcomes.ts` (modify)            | Drop `gambaWinGif`                                             |
| `src/commands/misc/gamba.ts` (modify)                | `?gamba [bet]` and `/gamba [bet]`                              |
| `src/interaction-handlers/gamba-buttons.ts` (create) | Spin again / Double                                            |
| `test/support/interaction.ts` (modify)               | `makeButton`; `makeChatInput` reply returns a message          |
| `README.md`, `AGENTS.md` (modify)                    | Wagers, pot, `/gamba`, buttons, `interaction-handlers/` layout |

---

### Task 1: Wager payouts in spin evaluation

**Files:**
- Modify: `src/features/gamba/config.ts`, `src/features/gamba/evaluate.ts`
- Test: `test/gamba-evaluate.test.ts`

**Interfaces:**
- Produces (in `config.ts`):
  - `wager = { minBet: 10, maxBet: 10_000 } as const`
  - `payoutTiers = ['none', 'ytPair', 'pythonPair', 'cppPair', 'ytTriple', 'pythonTriple',
    'cppTriple'] as const`, `type PayoutTier = (typeof payoutTiers)[number]`
  - `payoutBps = { none: 0, ytPair: 12_000, pythonPair: 40_000, cppPair: 100_000,
    ytTriple: 150_000, pythonTriple: 1_000_000, cppTriple: 3_000_000 } as const satisfies
    Record<PayoutTier, number>`
  - `pot = { seed: 10_000, contributionPercent: 3, fullShareBet: 500 } as const`
- Produces (in `evaluate.ts`): `Evaluation` adds `tier: PayoutTier` and `payoutBps: number`. A
  pair's tier comes from the key that appears twice (python → `pythonPair`, cpp → `cppPair`,
  else `ytPair`). `result` and `freePrize` are unchanged.

- [ ] **Step 1: Extend `test/gamba-evaluate.test.ts`.** In the existing 21³ enumeration also count
  tiers and sum `payoutBps`:

  ```ts
  expect(tierCounts).toEqual({ none: 5886, ytPair: 2916, pythonPair: 228, cppPair: 60,
    ytTriple: 162, pythonTriple: 8, cppTriple: 1 });
  expect(totalBps).toBe(85_412_000); // RTP 85,412,000 / (9,261 * 10,000) = 92.23%
  ```

  Plus: `evaluate(['python','head','python'])` → `{ tier: 'pythonPair', payoutBps: 40_000 }`;
  `['cpp','cpp','head']` → `cppPair`, 100,000; `['head','cry','grr']` → `none`, 0;
  `['cpp','cpp','cpp']` → `cppTriple`, 3,000,000.
- [ ] **Step 2: Run** `pnpm vitest run test/gamba-evaluate.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the interfaces above.
- [ ] **Step 4: Run** the full check. Expected: PASS.
- [ ] **Step 5: Commit** `feat(gamba): add wager payouts to spin evaluation`

---

### Task 2: Bet parsing

**Files:**
- Create: `src/features/gamba/bet.ts`
- Modify: `src/features/gamba/index.ts` (export)
- Test: `test/gamba-bet.test.ts`

**Interfaces:**
- Consumes: Task 1 `wager`; `InsufficientFundsError` from `src/features/economy/errors.ts`.
- Produces:
  - `class InvalidBetError extends Error` with readonly `kind: 'format' | 'range'` and
    `input: string`. Assign fields in the constructor body (no parameter properties, see the note
    in `economy/errors.ts`).
  - `parseBet(input: string, balance: number): number`. Checks in this order:
    1. Trim and lowercase. Accept `^\d+$`, `all`, `half`, or `^\d+(\.\d+)?k$`; anything else
       throws `InvalidBetError('format')`. For `k`, compute from the string (integer part × 1000
       plus the fraction right-padded to 3 digits); more than 3 fraction digits is `format`, so
       the result is always an integer without float maths.
    2. `balance < 10` → throw `InsufficientFundsError(balance, 10)`.
    3. Value: `all` = `min(balance, 10_000)`, `half` = `floor(balance / 2)`, else the number.
    4. Outside 10..10,000 → `InvalidBetError('range')`.
    5. Above `balance` → `InsufficientFundsError(balance, value)`.

- [ ] **Step 1: Write `test/gamba-bet.test.ts`** (balance 5,000 unless stated):
  - `'100'` → 100; `' 250 '` → 250; `'2.5k'` → 2,500; `'2.5K'` → 2,500; `'1k'` → 1,000;
    `'10'` → 10; `'10000'` with balance 20,000 → 10,000.
  - `'all'` → 5,000; `'all'` with balance 50,000 → 10,000; `'half'` → 2,500.
  - `InvalidBetError` kind `format`: `'lol'`, `''`, `'-5'`, `'1.5'`, `'1,000'`, `'1.2345k'`, `'k'`.
  - Kind `range`: `'9'`, `'0'`, `'10001'`, `'11k'`, `'half'` with balance 15 (7),
    `'half'` with balance 30,000 (15,000).
  - `InsufficientFundsError`: `'6000'` (balance 5,000, needed 6,000); `'all'` with balance 5
    (balance 5, needed 10); `'10'` with balance 0.
- [ ] **Step 2: Run** `pnpm vitest run test/gamba-bet.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `bet.ts`.
- [ ] **Step 4: Run** the full check. Expected: PASS.
- [ ] **Step 5: Commit** `feat(gamba): parse bets`

---

### Task 3: Progressive pot

**Files:**
- Create: `src/features/gamba/pot.ts`
- Test: `test/gamba-pot.test.ts`

**Interfaces:**
- Consumes: Task 1 `pot`; `pots` table; `DbOrTx`.
- Produces:
  - `potContribution(bet: number): number` = `max(1, floor(bet * 3 / 100))`.
  - `potShare(amount: number, bet: number): number` = `bet >= 500 ? amount :
    floor(amount * bet / 500)` (integer maths, no `bet / 500` float).
  - `settlePot(tx: DbOrTx, guildId: string, bet: number, jackpot: boolean, userId: string,
    now: number): { potWon: number; pot: number }`. Inserts the row at the seed if missing, adds
    the contribution, then on `jackpot` computes `potWon = potShare(afterContribution, bet)`, sets
    `amount = max(10_000, afterContribution - potWon)`, `lastWinnerId = userId`,
    `lastWonAt = now`. `pot` is the amount after settling. Does not touch wallets.

- [ ] **Step 1: Write `test/gamba-pot.test.ts`:**
  - `potContribution`: 10 → 1, 33 → 1, 100 → 3, 10,000 → 300.
  - `potShare`: (10,000, 100) → 2,000; (10,000, 500) → 10,000; (10,000, 9,000) → 10,000;
    (10,001, 10) → 200.
  - `settlePot` no jackpot, bet 100, fresh db → `{ potWon: 0, pot: 10_003 }`, row created with
    `lastWinnerId` null.
  - Jackpot bet 500 on a fresh pot → `{ potWon: 10_015, pot: 10_000 }`, row has
    `lastWinnerId: 'u'`, `lastWonAt: now`.
  - Jackpot bet 100 on a fresh pot → `{ potWon: 2_000, pot: 10_000 }` (10,003 − 2,000 = 8,003,
    topped up to the seed).
  - Pot at 100,000 (set the row directly), jackpot bet 10 → `potWon` 2,000 (100,001 × 10 / 500,
    floored), `pot` 98,001.
  - Two guilds keep separate pots.
- [ ] **Step 2: Run** `pnpm vitest run test/gamba-pot.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `pot.ts`.
- [ ] **Step 4: Run** the full check. Expected: PASS.
- [ ] **Step 5: Commit** `feat(gamba): add the progressive pot`

---

### Task 4: Settle wagered spins

**Files:**
- Modify: `src/features/gamba/play.ts`, `src/features/gamba/stats.ts`,
  `src/features/gamba/index.ts`
- Test: `test/gamba-play.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 3; `credit`, `debit`, `getOrCreateWallet`.
- Produces:
  - `FreeSpin` gains `mode: 'free'`.
  - `interface WagerSpin { mode: 'wager'; reels: Reels; evaluation: Evaluation; bet: number;
    payout: number; potWon: number; balance: number; pot: number; spinId: number }`.
  - `type Spin = FreeSpin | WagerSpin` (exported from `index.ts`).
  - `playWager(db: Db, guildId: string, userId: string, bet: number, now: number,
    randomInt?: RandomInt): WagerSpin`. Rolls outside, then in one `db.transaction`:
    `getOrCreateWallet` → `settlePot` → insert the `spins` row (`mode: 'wager'`, `payout`,
    `potWon`) → `debit` the bet (reason `bet`, `ref` spin id) → `credit` the payout (`payout`)
    when > 0 → `credit` `potWon` (`pot_win`) when > 0 → `recordWagerSpinStats`. A throw rolls all
    of it back. `bet` is assumed already validated by `parseBet`.
  - `recordWagerSpinStats(tx: DbOrTx, guildId: string, userId: string,
    spin: { evaluation: Evaluation; bet: number; payout: number; potWon: number }): void`.
    Upsert like `recordFreeSpinStats`: `spins + 1`, `wins + (payout + potWon > 0)`,
    `jackpots + (result === 'jackpot')`, `wagered + bet`, `won + payout + potWon`,
    `biggestWin = max(biggestWin, payout + potWon)`, `bestOdds = max(bestOdds, odds ?? 0)`.

- [ ] **Step 1: Add a `playWager` describe block to `test/gamba-play.test.ts`** (draws: 0 head,
  3 cry, 6 grr, 18 python, 20 cpp):
  - Loss, bet 100, `roll(0, 3, 6)`: `balance` 900, `payout` 0, `pot` 10,003; ledger reasons
    `['start', 'bet']` with the bet row's `ref` = `spinId`; spin row `{ mode: 'wager', bet: 100,
    payout: 0, potWon: 0, result: 'none' }`; stats `{ spins: 1, wins: 0, wagered: 100, won: 0 }`.
  - yt pair, bet 100, `roll(0, 0, 3)`: `payout` 120, `balance` 1,020, reasons
    `['start', 'bet', 'payout']`, both refs = `spinId`.
  - Jackpot, bet 500, `roll(20, 20, 20)`: `payout` 150,000, `potWon` 10,015, `pot` 10,000,
    `balance` 160,515; reasons `['start', 'bet', 'payout', 'pot_win']`; stats `{ jackpots: 1,
    wins: 1, wagered: 500, won: 160_015, biggestWin: 160_015, bestOdds: 9_261 }`.
  - Insufficient funds: create the wallet first, then bet 2,000 throws `InsufficientFundsError`;
    `spins`, `pots`, `player_stats` are empty and the ledger still has only the `start` row.
  - A free spin then a wager keep both sets of stats columns: `spins` 2, `wagered` = the bet.
  - 200 spins with a seeded LCG for draws and bets in 10..200 (skip the spin when the balance is
    under the bet), then `expectLedgerConsistent(db)`.
- [ ] **Step 2: Run** `pnpm vitest run test/gamba-play.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the interfaces above.
- [ ] **Step 4: Run** the full check. Expected: PASS.
- [ ] **Step 5: Commit** `feat(gamba): settle wagered spins`

---

### Task 5: Spin cards and button IDs

**Files:**
- Create: `src/features/gamba/custom-ids.ts`, `src/features/gamba/cards.ts`
- Modify: `src/features/gamba/index.ts` (exports)
- Test: `test/gamba-custom-ids.test.ts`, `test/gamba-cards.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 4; `accents`, `card`, `coins` from `features/ui`; `outcomeEmoji`;
  `InsufficientFundsError`.
- Produces (`custom-ids.ts`):
  - `type SpinAction = 'again' | 'double'`; `interface SpinButtonId { action: SpinAction;
    userId: string; bet: number }`.
  - `encodeSpinId({ action, userId, bet }): string` → `gamba:<action>:<userId>:<bet>`. `bet` is the
    bet the click will play (0 = free; a Double ID already holds twice the bet).
  - `decodeSpinId(customId: string): SpinButtonId | undefined`. Valid only when there are exactly
    four parts, the prefix is `gamba`, the action is known, `userId` matches `^\d{1,20}$`, and
    `bet` is `^\d+$` with `bet === 0 || 10 <= bet <= 10_000`. A `double` with bet 0 is invalid.
- Produces (`cards.ts`), all returning `ContainerBuilder`:
  - `tierLabels: Record<PayoutTier, string>` = `{ none: 'No match', ytPair: 'Pair',
    pythonPair: 'Python pair', cppPair: 'C++ pair', ytTriple: 'Triple!', pythonTriple:
    'Python x3!', cppTriple: 'JACKPOT' }`.
  - `freeSpinCard(userId: string, spin: FreeSpin)`. Accent gold for a jackpot, win when
    `prize > 0`, else loss. Texts: `# <emoji> <emoji> <emoji>`; `**Triple!** +50 coins` (label
    from the tier) or `No prize this time`; `-# <@u> · free spin · balance 1,050`. Action row:
    primary `Spin again` with `encodeSpinId({ action: 'again', userId, bet: 0 })`.
  - `wagerCard(userId: string, spin: WagerSpin)`. Accent gold when `potWon > 0`, win when
    `payout > 0`, else loss. Texts: reels heading; `**Python pair** · 4x` (multiplier
    `${bps / 10_000}x`, so `1.2x` and `300x`; `**No match**` alone for none);
    `Bet 100 → 400 (+300)` / `Bet 100 → 0 (-100)` using `coins()`; `+12,345 from the pot` only
    when `potWon > 0`; `-# <@u> · balance 1,300 · pot 10,003`. Action row: primary `Spin again`
    (`again`, same bet) and, only when `2 * bet <= 10_000 && 2 * bet <= balance`, success
    `Double (200)` (`double`, `2 * bet`).
  - `announcementCard(userId: string, spin: Spin, roleAssigned?: boolean)`. Gold. Texts:
    `## <@u> hit <emoji> x3!`; free `+500 coins` / wager `Won 10,000 on a 100 bet`;
    `+12,345 from the pot` when `potWon > 0`; on a jackpot
    `You are a pro! You just won <@&roleId>` plus ` (couldn't assign the role, tell a mod)` when
    `roleAssigned` is false; `-# Odds: 1 in 1,158`. No action row.
  - `notYourSpin = "This isn't your spin. Use \`/gamba\` to get your own."`
  - `spinErrorText(error: unknown): string | undefined`:
    - `InvalidBetError` `format`: `` `lol` isn't a bet. Use a number from 10 to 10,000, `all`, `half` or `2.5k`. ``
      (the trimmed input, cut to 20 characters, inside backticks with backticks removed).
    - `InvalidBetError` `range`: `Bets go from 10 to 10,000.`
    - `InsufficientFundsError`: `You have 40 coins. ` + (`` `/bailout` is available.`` when
      `balance < 10`, else `Try a smaller bet.`).
    - Anything else: `undefined`.

- [ ] **Step 1: Write `test/gamba-custom-ids.test.ts`:** round trips for `again` bet 0, `again`
  bet 100, `double` bet 10,000; `decodeSpinId` returns `undefined` for `gamba:again:1:999999`,
  `gamba:again:abc:10`, `gamba:double:1:0`, `gamba:again:1:5`, `gamba:again:1:10:x`,
  `gamba:spin:1:10`, `lb:page:1:coins:0`, `''`.
- [ ] **Step 2: Write `test/gamba-cards.test.ts`** asserting on `JSON.stringify(card.toJSON())`
  and the accent:
  - Free win (head x3, prize 50, balance 1,050): win accent; contains
    `**Triple!** +50 coins`, `free spin · balance 1,050`, custom ID `gamba:again:1:0`.
  - Free loss: loss accent, `No prize this time`. Free jackpot: gold accent.
  - Wager yt pair bet 100 payout 120 balance 1,020 pot 10,003: `**Pair** · 1.2x`,
    `Bet 100 → 120 (+20)`, `balance 1,020 · pot 10,003`, IDs `gamba:again:1:100` and
    `gamba:double:1:200`, label `Double (200)`.
  - Wager loss: `Bet 100 → 0 (-100)`, `**No match**`, loss accent.
  - Double hidden at bet 6,000 (12,000 > max) and at bet 600 with balance 1,000.
  - Wager jackpot with `potWon` 10,015: gold, `300x`, `+10,015 from the pot`.
  - Announcement: free python x3 (`+500 coins`, `Odds: 1 in 1,158`, no role line); wager cpp x3
    with role assigned (`Won 150,000 on a 500 bet`, pot line, `You are a pro!`); role failed adds
    `(couldn't assign the role, tell a mod)`.
  - `spinErrorText` for each case above, including the bailout and smaller-bet hints, and
    `undefined` for `new Error('x')`.
- [ ] **Step 3: Run** both test files. Expected: FAIL.
- [ ] **Step 4: Implement** `custom-ids.ts` and `cards.ts`. Buttons go in an `ActionRowBuilder`
  added to the container with `addActionRowComponents`.
- [ ] **Step 5: Run** the full check. Expected: PASS.
- [ ] **Step 6: Commit** `feat(gamba): add spin cards and button ids`

---

### Task 6: Shared spin flow, `?gamba [bet]` and `/gamba [bet]`

**Files:**
- Create: `src/features/gamba/jackpot.ts`, `src/features/gamba/spin.ts`
- Modify: `src/commands/misc/gamba.ts`, `src/features/gamba/index.ts`,
  `src/features/gamba/outcomes.ts`, `test/support/interaction.ts`
- Test: `test/gamba-spin.test.ts`, `test/gamba-command.test.ts` (rewrite), `test/gamba.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 4, 5.
- Produces:
  - `interface JackpotMember { roles: { add(roleId: string, reason?: string): Promise<unknown> } }`
  - `assignJackpotRole(member: JackpotMember | null | undefined, userId: string):
    Promise<boolean>`. Moved from the command: adds `gambaJackpotRoleId` with reason
    `gamba jackpot`; on a missing member or a throw it logs the same warning through
    `container.logger.warn` and returns false.
  - `interface SpinRequest { guildId: string; userId: string; bet?: string }` (absent or empty
    bet = free spin).
  - `interface SpinMessages { card: ContainerBuilder; announcement?: ContainerBuilder }`
  - `spin(db: Db, request: SpinRequest, now: number, options: { assignJackpotRole: () =>
    Promise<boolean>; randomInt?: RandomInt }): Promise<SpinMessages>`. Free: `playFree`. Wager:
    `getOrCreateWallet` for the balance, `parseBet`, `playWager`. After the commit, on a jackpot
    awaits `assignJackpotRole` once. `announcement` is set for `result` `triple` or `jackpot`.
    Errors from `parseBet` / `playWager` propagate.
  - Removed from `index.ts` / `outcomes.ts`: `formatGambaReply`, `formatGambaFollowUp`,
    `JackpotResult`, `gambaWinGif`. Their tests in `test/gamba.test.ts` go too.
- Command (`src/commands/misc/gamba.ts`):
  - `messageRun(message, args)`: bet = `(await args.restResult('string')).unwrapOr(undefined)`.
    `spin(...)` with `assignJackpotRole: () => assignJackpotRole(message.member, author.id)`.
    Reply `message.reply(cardReply(card))` (no `allowedMentions` override, so no ping). If there
    is an announcement: `result.reply({ ...cardReply(announcement), allowedMentions: { users:
    [author.id] } })`. On an error with `spinErrorText` text: `message.reply(cardReply(
    card(accents.error, text)))`; otherwise rethrow.
  - `registerApplicationCommands`: `/gamba`, description `Spin the gamba slot machine`, guild
    context, optional string option `bet` described `Coins to bet: 10 to 10,000, all, half or
    2.5k (default: free spin)`.
  - `chatInputRun(interaction)`: same flow with `bet = interaction.options.getString('bet') ??
    undefined` and the member from `interaction.inCachedGuild() ? interaction.member : null`.
    Reply `interaction.reply({ ...cardReply(card), withResponse: true })` and send the
    announcement with `resource?.message?.reply(...)`. Errors: `interaction.reply(errorReply(text))`.
  - The announcement is sent in its own `try`; a failure is logged with `container.logger.error`
    and not rethrown, so the committed spin and the sent card stand.
- `test/support/interaction.ts`: `makeChatInput` gains `inCachedGuild: () => true`,
  `member: { roles: { add: vi.fn(async () => undefined) } }`, and `reply` resolves to
  `{ resource: { message: { reply: announce } } }` where `announce` is a `vi.fn` returned on the
  stub as `announce`.

- [ ] **Step 1: Write `test/gamba-spin.test.ts`** (`:memory:` db, `randomInt` from a queue):
  - Free head x3: `card` JSON contains `free spin`; `announcement` defined; role callback not
    called.
  - Free loss: no `announcement`.
  - Wager `'100'` yt pair: card contains `Bet 100 → 120`; no announcement (pair).
  - Wager `'500'` cpp x3: role callback called once; announcement contains `You are a pro!`;
    with the callback resolving false it contains `couldn't assign the role`.
  - `'lol'` rejects with `InvalidBetError`; `spins` and `pots` are empty.
  - `'5000'` for a new wallet rejects with `InsufficientFundsError`; spins table empty.
- [ ] **Step 2: Rewrite `test/gamba-command.test.ts`** keeping its client and `mockRandomInt`
  setup:
  - `?gamba` with draws `0,3,6`: one reply, flags include `IsComponentsV2`, JSON contains
    `No prize this time`, no `allowedMentions` key, no announcement.
  - `?gamba` with draw `0` (head x3): the card reply, then an announcement reply on the returned
    message with `allowedMentions: { users: ['1'] }`, called after the card (invocation order).
  - `?gamba 100` loss with draws `0,3,6`: card contains `Bet 100 → 0 (-100)`; wallet 900.
  - `?gamba lol`: a red card reply containing `isn't a bet`; `spins` empty.
  - `?gamba 5000`: `You have 1,000 coins. Try a smaller bet.`
  - `?gamba` jackpot (draw `20`): role added with `('1561827731400822845', 'gamba jackpot')`;
    role rejection → announcement contains `couldn't assign the role`; `member: null` → same.
  - Announcement reply rejects: the card was sent, the wallet holds the prize, no throw escapes.
  - DMs: nothing happens (existing test).
  - `/gamba bet:all` with draws `0,3,6`: replies with `withResponse: true`, card contains
    `Bet 1,000 → 0 (-1,000)`; wallet 0.
  - `/gamba bet:lol`: ephemeral reply containing `isn't a bet`.
  - `/gamba` with draw `0`: `announce` called with `allowedMentions: { users: ['1'] }`.
- [ ] **Step 3: Run** `pnpm vitest run test/gamba-spin.test.ts test/gamba-command.test.ts`.
  Expected: FAIL.
- [ ] **Step 4: Implement** `jackpot.ts`, `spin.ts`, the command, the stub changes and the
  removals.
- [ ] **Step 5: Run** the full check. Expected: PASS.
- [ ] **Step 6: Commit** `feat(gamba): add wagers and /gamba to the gamba command`

---

### Task 7: Spin again and Double buttons

**Files:**
- Create: `src/interaction-handlers/gamba-buttons.ts`
- Modify: `test/support/interaction.ts`
- Test: `test/gamba-buttons.test.ts`

**Interfaces:**
- Consumes: Task 5 `decodeSpinId`, `notYourSpin`, `spinErrorText`; Task 6 `spin`,
  `assignJackpotRole`.
- Produces:
  - `GambaButtonsHandler extends InteractionHandler` with
    `interactionHandlerType: InteractionHandlerTypes.Button`.
    - `parse(interaction)`: `decodeSpinId(interaction.customId)`; `this.some(id)` or
      `this.none()`.
    - `run(interaction, id)`: if `interaction.user.id !== id.userId` →
      `interaction.reply(errorReply(notYourSpin))` and stop. Else `spin(db, { guildId, userId,
      bet: id.bet === 0 ? undefined : String(id.bet) }, Date.now(), { assignJackpotRole: () =>
      assignJackpotRole(interaction.inCachedGuild() ? interaction.member : null, userId) })`.
      Success → `interaction.update(cardReply(card))`, then the announcement with
      `interaction.message.reply({ ...cardReply(announcement), allowedMentions: { users:
      [userId] } })` in its own logged `try`. Expected error → `interaction.reply(errorReply(text))`
      (card untouched); other errors rethrow to `InteractionHandlerErrorListener`.
  - `makeButton(client, { customId, userId, guildId? })` in `test/support/interaction.ts`:
    `isChatInputCommand/isContextMenuCommand/isAutocomplete/isModalSubmit/isStringSelectMenu`
    false, `isMessageComponent/isButton/isRepliable` true, `inCachedGuild: () => true`, `customId`,
    `user: makeUser(userId)`, `guildId`, `member` with a `roles.add` mock, `replied`/`deferred`
    false, and `reply`, `update`, `followUp`, `message.reply` as `vi.fn`s.

- [ ] **Step 1: Write `test/gamba-buttons.test.ts`** (shared client, `mockRandomInt` as in the
  command test):
  - Owner clicks `gamba:again:1:0` with draws `0,3,6`: `update` called once with a card containing
    `No prize this time`; `reply` not called; one `spins` row.
  - Owner clicks `gamba:again:1:100` with draw `0` (head x3, 15x): `update` card contains
    `Bet 100 → 1,500`; `message.reply` called with `allowedMentions: { users: ['1'] }`.
  - Owner clicks `gamba:double:1:200` with draws `0,3,6`: card contains `Bet 200 → 0 (-200)`.
  - Another user (`'5'`) clicks `gamba:again:1:100`: ephemeral reply with `notYourSpin`;
    `update` not called; no wallet for `'5'`, `spins` empty.
  - Stale button: user `'1'` with balance 50 (wallet created, then debited by direct `debit`)
    clicks `gamba:again:1:100`: ephemeral `You have 50 coins. Try a smaller bet.`; `update` not
    called; `spins` empty.
  - Tampered `gamba:again:1:999999` and foreign `other:thing`: after 100 ms neither `reply` nor
    `update` called, `spins` empty.
- [ ] **Step 2: Run** `pnpm vitest run test/gamba-buttons.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the handler and `makeButton`. Sapphire loads
  `src/interaction-handlers/` automatically through the existing `registerPath`; do not register
  it by hand.
- [ ] **Step 4: Run** the full check. Expected: PASS.
- [ ] **Step 5: Commit** `feat(gamba): add spin again and double buttons`

---

### Task 8: Documentation

**Files:**
- Modify: `README.md`, `AGENTS.md`

- [ ] **Step 1: README:** document `?gamba [bet]` / `/gamba [bet]` (bet forms, range), the payout
  table, the pot rules in two lines, and the Spin again / Double buttons.
- [ ] **Step 2: AGENTS.md:** in Layout add `interaction-handlers/` (one file per component
  handler) and `features/gamba/` (spin logic, cards, the shared `spin()` flow); replace
  "`interaction-handlers/` arrives in phase 3 of the gamba economy." with a note that button state
  lives in the custom ID and handlers must ignore IDs they cannot decode.
- [ ] **Step 3: Run** `pnpm lint`. Expected: PASS.
- [ ] **Step 4: Commit** `docs: document wagers, the pot and gamba buttons`
