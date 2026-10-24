# Coinflip and Paid-Only Gamba Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every gamba spin a wager (default 10 coins, no free spins) and add `/coinflip` (vs bot, targeted challenge, open challenge) with a 3% rake into the gamba pot, flip history, stats and a leaderboard.

**Architecture:** Gamba loses its free-spin path; `settleSpin` falls back to `wager.defaultBet`. Coinflip is a new feature folder `src/features/coinflip/` with pure modules (rake, flip, custom IDs), one transactional settle module, an in-memory challenge registry for exactly-once settlement (backed by a UNIQUE `flips.message_id`), and cards; `/coinflip` and one button handler stay thin. Stats gain four `player_stats` columns and a `coinflip` board.

**Tech Stack:** TypeScript (strict, ESM, NodeNext), discord.js Components V2, Sapphire, Drizzle + better-sqlite3, Vitest, fast-check, Biome.

**Spec:** `docs/superpowers/specs/2026-10-24-coinflip-economy-design.md`

## Global Constraints

- Before each commit: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass.
- Conventional Commits, imperative lower-case summary, ≤ ~72 chars, body ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Relative imports use `.js`; type-only imports use `import type`.
- No TypeScript parameter properties or enums in anything a piece imports (Node's strip-only loader rejects them; see `src/features/gamba/bet.ts:109`).
- All coin movement goes through `credit` / `debit` in `src/features/economy/ledger.ts`. Coin amounts and timestamps are integers (epoch ms).
- Log via `this.container.logger`, never `console`.
- Mentions suppressed by default; only the targeted challenge card opts in with `allowedMentions: { users: [opponentId] }`.
- Randomness uses `randomInt` from `node:crypto` as the default, injectable as `RandomInt` (`src/features/gamba/roll.ts`), so command tests can patch it via `syncBuiltinESMExports` like `test/gamba-buttons.test.ts`.
- Bet limits are gamba's: 10 to 10,000; default bet 10. Rake: `max(1, floor(2 × bet × 3 / 100))`. Expiry: targeted 60,000 ms, open 120,000 ms.
- Custom IDs stay under 100 characters; handlers return `none()` for IDs they can't decode.

## Review Focus

1. A player who has never used the bot accepts a targeted challenge → their wallet is created with the starting balance and the flip settles normally (test in Task 4).
2. A deploy leaves old free-spin cards around; clicking `gamba:again:<id>:0` → ignored, no spin, no error reply (test in Task 1).
3. The bot restarts between a settle and a second Accept click on the same card → the UNIQUE `message_id` backstop answers "already taken" and moves no coins (tests in Tasks 4 and 8).
4. The expiry timer fires after the challenge was already accepted → the result card is not overwritten with "expired" (test in Task 5).
5. **Flip again** clicked after the balance fell below the bet → ephemeral funds error, card unchanged, no flip row (test in Task 8).

---

### Task 1: Paid-only gamba (default bet 10, remove free spins)

**Files:**
- Modify: `src/features/gamba/config.ts` (add `defaultBet: 10` to `wager`)
- Modify: `src/features/gamba/spin.ts`, `play.ts`, `stats.ts`, `cards.ts`, `text.ts`, `index.ts`, `custom-ids.ts`
- Modify: `src/commands/misc/gamba.ts` (option description), `src/interaction-handlers/gamba-buttons.ts` (`bet: String(id.bet)`)
- Modify: `src/db/schema.ts` (comment `'free'` and `'free_prize'` as legacy, history only)
- Modify: `README.md` (gamba section: no free spins, default 10)
- Test: `test/gamba-play.test.ts`, `gamba-spin.test.ts`, `gamba-cards.test.ts`, `gamba-text.test.ts`, `gamba-command.test.ts`, `gamba-buttons.test.ts`, `gamba-custom-ids.test.ts`, `fuzz-custom-ids.test.ts`, `stats-profile.test.ts`, `fuzz-economy.test.ts`

**Interfaces:**
- Produces: `wager.defaultBet` (10); `Spin = WagerSpin` (exported type kept for callers); `SpinRequest.bet?: string` where absent/blank means `wager.defaultBet`; `decodeSpinId` rejects `bet === 0`. Removed: `playFree`, `FreeSpin`, `freeSpinCard`, `recordFreeSpinStats`.

- [ ] **Step 1: Write the failing tests**

```ts
// test/gamba-spin.test.ts
it('plays a 10-coin wager when no bet is given', async () => {
  const { played } = await settleSpin(db, { guildId: 'g', userId: 'u' }, 10, {
    assignJackpotRole: async () => true,
    randomInt: roll(0, 3, 6),
  });
  expect(played.bet).toBe(10);
  expect(findWallet(db, 'g', 'u')?.balance).toBe(startingBalance - 10);
});
it('rejects a no-bet spin under 10 coins with a funds error', async () => {
  // drain the wallet to 9 with debit(), then:
  await expect(settleSpin(db, { guildId: 'g', userId: 'u' }, 10, opts)).rejects.toBeInstanceOf(
    InsufficientFundsError,
  );
});

// test/gamba-custom-ids.test.ts
it('no longer decodes a free-spin id', () => {
  expect(decodeSpinId('gamba:again:1:0')).toBeUndefined();
});

// test/gamba-buttons.test.ts — replaces 'plays a free spin again'
it('ignores an old free-spin button', async () => {
  const interaction = makeButton(client, { customId: 'gamba:again:1:0', userId: '1' });
  client.emit(Events.InteractionCreate, interaction as never);
  await wait(50);
  expect(interaction.reply).not.toHaveBeenCalled();
  expect(interaction.update).not.toHaveBeenCalled();
  expect(spinCount()).toBe(0);
});

// test/gamba-command.test.ts — replaces 'announces a free triple…'
it('treats ?gamba with no bet as a 10-coin bet', async () => {
  /* reply text contains 'bet 10' */
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run test/gamba-spin.test.ts test/gamba-custom-ids.test.ts test/gamba-buttons.test.ts test/gamba-command.test.ts`
Expected: FAIL (`played.bet` is undefined on a free spin; `gamba:again:1:0` decodes).
- [ ] **Step 3: Implement**

`settleSpin` uses `request.bet?.trim() || String(wager.defaultBet)` and always calls `playWager`. Delete the free-spin functions and every `mode === 'free'` branch. `/gamba` option description becomes `'Coins to bet: 10 to 10,000, all, half or 2.5k (default: 10)'`. `decodeSpinId`: any bet outside `[minBet, maxBet]` (including 0) is `undefined`. Delete or convert the remaining free-spin tests (`gamba-play` `playFree` block, `gamba-cards` `freeSpinCard` block and free announcement, `gamba-text` free cases, `gamba-spin` free cases, `stats-profile` `playFree` call → `playWager`), drop the `free` op from `fuzz-economy.test.ts`, and drop `fc.constant(0)` from the `again` arbitrary and the `bet === 0` branch in `fuzz-custom-ids.test.ts`. `test/db.test.ts` keeps its `mode: 'free'` rows (legacy values stay valid).
- [ ] **Step 4: Run the full suite**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all pass; `grep -rn "playFree\|FreeSpin\|freeSpinCard\|recordFreeSpinStats" src test` prints nothing.
- [ ] **Step 5: Commit**

```bash
git add -A src test README.md
git commit -m "feat(gamba)!: make every spin a wager with a 10-coin default

BREAKING CHANGE: free spins are gone; ?gamba and /gamba without a bet
wager 10 coins."
```

---

### Task 2: Coinflip schema and migration

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0002_coinflip.sql` (+ `drizzle/meta/*`, generated)
- Test: `test/db.test.ts`

**Interfaces:**
- Produces in `src/db/schema.ts`:
  - `flipModes = ['bot', 'challenge', 'open'] as const`, `type FlipMode`
  - `flipSides = ['heads', 'tails'] as const`, `type FlipSide`
  - `ledgerReasons` gains `'flip_bet'`, `'flip_win'`
  - table `flips`: `id` (pk autoincrement), `guildId`, `mode` (enum flipModes), `challengerId`, `opponentId` (nullable), `bet`, `challengerSide` (enum flipSides), `resultSide` (enum flipSides), `winnerId` (nullable), `rake`, `messageId` (nullable, `.unique()`), `createdAt`; index `flips_guild_created_idx` on `(guildId, createdAt)`. Column SQL names snake_case as in the spec.
  - `playerStats` gains `flips`, `flipWins`, `flipWagered`, `flipWon` (`integer not null default 0`, SQL `flips`, `flip_wins`, `flip_wagered`, `flip_won`).

- [ ] **Step 1: Write the failing tests**

```ts
it('stores a flip and rejects a second flip for the same message', () => {
  const row = {
    guildId: '2',
    mode: 'open' as const,
    challengerId: '1',
    opponentId: '3',
    bet: 100,
    challengerSide: 'heads' as const,
    resultSide: 'tails' as const,
    winnerId: '3',
    rake: 6,
    messageId: 'm1',
    createdAt: 1,
  };
  db.insert(flips).values(row).run();
  expect(() => db.insert(flips).values(row).run()).toThrow(/UNIQUE/);
  db.insert(flips)
    .values({ ...row, mode: 'bot', opponentId: null, messageId: null })
    .run();
  db.insert(flips)
    .values({ ...row, mode: 'bot', opponentId: null, messageId: null })
    .run(); // NULLs don't collide
});
it('defaults the coinflip stats columns to zero', () => {
  db.insert(playerStats).values({ guildId: '2', userId: '1' }).run();
  expect(db.select().from(playerStats).get()).toMatchObject({
    flips: 0,
    flipWins: 0,
    flipWagered: 0,
    flipWon: 0,
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run test/db.test.ts` — Expected: FAIL (`flips` not exported).
- [ ] **Step 3: Edit the schema, then generate**

Run: `pnpm db:generate --name coinflip`
Expected: `drizzle/0002_coinflip.sql` with `CREATE TABLE flips`, a unique index on `message_id`, the guild/created index and four `ALTER TABLE player_stats ADD` statements.
- [ ] **Step 4: Verify**

Run: `pnpm vitest run test/db.test.ts && pnpm db:generate` — Expected: tests PASS; the second generate reports no changes (`git status drizzle` clean after the new files are added).
- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts drizzle test/db.test.ts
git commit -m "feat(db): add flips table and coinflip stats columns"
```

---

### Task 3: Coinflip rules (config, rake, flip, custom IDs)

**Files:**
- Create: `src/features/coinflip/config.ts`, `rake.ts`, `flip.ts`, `custom-ids.ts`, `index.ts`
- Test: `test/coinflip-rake.test.ts`, `test/coinflip-custom-ids.test.ts`, `test/fuzz-coinflip.test.ts`

**Interfaces:**
- Consumes: `FlipSide`, `flipSides` from schema; `RandomInt` from `src/features/gamba/roll.ts`; `wager` from `src/features/gamba/config.ts`.
- Produces:
  - `coinflip = { rakePercent: 3, expiryMs: { challenge: 60_000, open: 120_000 } } as const`
  - `flipRake(bet: number): number`
  - `flipCoin(randomInt: RandomInt = cryptoRandomInt): FlipSide` (draw `randomInt(2)`: 0 heads, 1 tails); `otherSide(side: FlipSide): FlipSide`
  - `type ChallengeAction = 'accept' | 'decline' | 'cancel'`
  - `interface FlipAgainId { kind: 'again'; userId: string; bet: number; side: FlipSide }`
  - `interface ChallengeId { kind: 'challenge'; action: ChallengeAction; challengerId: string; opponentId: string | undefined; bet: number; side: FlipSide; expiresAt: number }` (`expiresAt` in ms, a whole number of seconds; `opponentId` undefined = open)
  - `type CoinflipId = FlipAgainId | ChallengeId`
  - `encodeFlipAgainId(id: Omit<FlipAgainId, 'kind'>): string` → `cf:again:<userId>:<bet>:<side>`
  - `encodeChallengeId(id: Omit<ChallengeId, 'kind'>): string` → `cf:<action>:<challengerId>:<opponentId|0>:<bet>:<side>:<ceil(expiresAt/1000) base36>`
  - `decodeCoinflipId(customId: string): CoinflipId | undefined`

- [ ] **Step 1: Write the failing tests**

```ts
// coinflip-rake.test.ts
it.each([
  [10, 1],
  [16, 1],
  [17, 1],
  [34, 2],
  [100, 6],
  [10_000, 600],
])('rake for %i is %i', (bet, rake) => expect(flipRake(bet)).toBe(rake));
it('flips heads on 0 and tails on 1', () => {
  expect(flipCoin(() => 0)).toBe('heads');
  expect(flipCoin(() => 1)).toBe('tails');
});

// coinflip-custom-ids.test.ts
it('round-trips an open challenge', () => {
  const id = {
    action: 'accept',
    challengerId: '123456789012345678',
    opponentId: undefined,
    bet: 250,
    side: 'tails',
    expiresAt: 1_800_000_000_000,
  } as const;
  expect(decodeCoinflipId(encodeChallengeId(id))).toEqual({ kind: 'challenge', ...id });
});
it('rounds expiry up to the second', () => {
  const encoded = encodeChallengeId({
    action: 'cancel',
    challengerId: '1',
    opponentId: '2',
    bet: 10,
    side: 'heads',
    expiresAt: 1_500,
  });
  expect(decodeCoinflipId(encoded)).toMatchObject({ expiresAt: 2_000 });
});
it.each([
  'cf:again:1:9:heads',
  'cf:again:1:10001:heads',
  'cf:again:1:10:edge',
  'cf:decline:1:0:10:heads:z',
  'cf:accept:1:2:10:heads:',
  'gamba:again:1:10',
  'cf:accept:1:2:10:heads:z:extra',
])('rejects %s', (id) => expect(decodeCoinflipId(id)).toBeUndefined());
// decline needs a named opponent, hence 'cf:decline:1:0:…' is rejected.

// fuzz-coinflip.test.ts (fast-check)
// 1. decodeCoinflipId never throws on fc.string({ unit: 'binary', maxLength: 120 }) and on mutated valid IDs.
// 2. every valid FlipAgainId / ChallengeId (snowflakes /^[0-9]{1,20}$/, bet 10..10_000, side, expiresAt
//    = seconds*1000 up to 10^13) round-trips and encodes to ≤ 100 chars.
// 3. for bet in 10..10_000: 1 <= flipRake(bet) <= bet, and (2*bet - flipRake(bet)) + flipRake(bet) === 2*bet.
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run test/coinflip-rake.test.ts test/coinflip-custom-ids.test.ts test/fuzz-coinflip.test.ts` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement**

Decode validates: prefix `cf`, exact part count (5 for `again`, 7 for challenges), snowflakes `/^\d{1,20}$/`, opponent `0` or a snowflake (`0` not allowed for `decline`), bet `/^\d{1,5}$/` within `[wager.minBet, wager.maxBet]`, side in `flipSides`, expiry `/^[0-9a-z]{1,9}$/`. `index.ts` re-exports these modules (it grows in later tasks).
- [ ] **Step 4: Verify**

Run: `pnpm vitest run test/coinflip-rake.test.ts test/coinflip-custom-ids.test.ts test/fuzz-coinflip.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/features/coinflip test/coinflip-rake.test.ts test/coinflip-custom-ids.test.ts test/fuzz-coinflip.test.ts
git commit -m "feat(coinflip): add rake, coin flip and button ids"
```

---

### Task 4: Coinflip settlement (pot, stats, transactions)

**Files:**
- Modify: `src/features/gamba/pot.ts`, `src/features/gamba/index.ts` (export `addToPot`)
- Create: `src/features/coinflip/errors.ts`, `stats.ts`, `play.ts`; extend `index.ts`
- Test: `test/gamba-pot.test.ts`, `test/coinflip-play.test.ts`

**Interfaces:**
- Consumes: Task 2 schema, Task 3 `flipRake`, `flipCoin`, `otherSide`; `parseBet`, `wager` from gamba; `credit`, `debit`, `getOrCreateWallet`, `EconomyError` from economy.
- Produces:
  - `addToPot(tx: DbOrTx, guildId: string, amount: number): number` — creates the pot at `pot.seed` if missing, adds `amount`, returns the new amount.
  - `class CoinflipError extends EconomyError {}`; `class ShortStakeError extends CoinflipError { who: 'challenger' | 'acceptor'; userId: string; balance: number; needed: number }`; `class ChallengeTakenError extends CoinflipError {}` (no parameter properties).
  - `recordFlipStats(tx: DbOrTx, guildId: string, userId: string, flip: { bet: number; won: boolean; credited: number }): void` — `flips +1`, `flipWins +won`, `flipWagered +bet`, `flipWon +credited`.
  - `interface BotFlip { bet: number; side: FlipSide; result: FlipSide; won: boolean; rake: number; credited: number; balance: number; pot: number; flipId: number }`
  - `interface BotFlipRequest { guildId: string; userId: string; bet?: string; side: FlipSide }` (blank bet = `wager.defaultBet`)
  - `settleBotFlip(db: Db, request: BotFlipRequest, now: number, randomInt?: RandomInt): BotFlip` — opens the wallet, `parseBet`, then one transaction.
  - `interface ChallengeRequest { guildId: string; messageId: string; mode: 'challenge' | 'open'; challengerId: string; acceptorId: string; bet: number; challengerSide: FlipSide }`
  - `interface SettledChallenge { result: FlipSide; winnerId: string; loserId: string; rake: number; credited: number; challengerBalance: number; acceptorBalance: number; pot: number; flipId: number }`
  - `settleChallenge(db: Db, request: ChallengeRequest, now: number, randomInt?: RandomInt): SettledChallenge` — everything (wallet creation included) inside one transaction, so any throw leaves the database unchanged. Throws `ShortStakeError` (challenger checked first) or `ChallengeTakenError` (UNIQUE `message_id` violation, `SqliteError` code `SQLITE_CONSTRAINT_UNIQUE`).

Order inside both transactions: insert the `flips` row (for `ref`), debit stake(s) with `flip_bet`, credit the winner `2 × bet − rake` with `flip_win`, `addToPot(rake)`, `recordFlipStats` for each human player. `opponentId` in the row is the acceptor; `winnerId` null when the bot wins.
- [ ] **Step 1: Write the failing tests**

```ts
// gamba-pot.test.ts
it('addToPot seeds a missing pot and adds', () => {
  expect(addToPot(db, 'g', 6)).toBe(pot.seed + 6);
  expect(addToPot(db, 'g', 1)).toBe(pot.seed + 7);
});

// coinflip-play.test.ts — db = openDatabase(':memory:') per test
it('pays a won bot flip 2B minus rake and feeds the pot', () => {
  const flip = settleBotFlip(
    db,
    { guildId: 'g', userId: 'u', bet: '100', side: 'heads' },
    5,
    () => 0,
  );
  expect(flip).toMatchObject({
    won: true,
    result: 'heads',
    rake: 6,
    credited: 194,
    balance: startingBalance + 94,
    pot: pot.seed + 6,
  });
  expect(ledgerReasonsFor('u')).toEqual(['start', 'flip_bet', 'flip_win']); // both with ref = flip.flipId
  expect(statsFor('u')).toMatchObject({ flips: 1, flipWins: 1, flipWagered: 100, flipWon: 194 });
});
it('burns a lost bot flip except the rake', () => {
  const flip = settleBotFlip(
    db,
    { guildId: 'g', userId: 'u', bet: '100', side: 'heads' },
    5,
    () => 1,
  );
  expect(flip).toMatchObject({
    won: false,
    credited: 0,
    balance: startingBalance - 100,
    pot: pot.seed + 6,
  });
  expect(flipRow(flip.flipId)).toMatchObject({
    mode: 'bot',
    winnerId: null,
    opponentId: null,
    messageId: null,
  });
});
it('defaults a bot flip to 10 coins', () => {
  /* bet undefined → flip.bet === 10, rake 1 */
});
it('settles a challenge: winner +B-rake, loser -B, pot +rake, both stats', () => {
  /* challengerSide heads, draw 1 → acceptor wins */
});
it('creates the wallet of an acceptor who never played', () => {
  /* acceptor has no wallet; settles from startingBalance */
});
it('throws ShortStakeError for a short challenger and changes nothing', () => {
  /* snapshot wallets/ledger/flips/pots equal before/after */
});
it('throws ShortStakeError for a short acceptor and changes nothing', () => {
  /* who === 'acceptor', needed === bet */
});
it('settles a message at most once', () => {
  settleChallenge(db, req, 5, () => 0);
  expect(() => settleChallenge(db, req, 6, () => 0)).toThrow(ChallengeTakenError);
  // balances and pot equal to after the first settle
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run test/gamba-pot.test.ts test/coinflip-play.test.ts` — Expected: FAIL (missing exports).
- [ ] **Step 3: Implement** the signatures above in the listed files.

- [ ] **Step 4: Verify**

Run: `pnpm vitest run test/gamba-pot.test.ts test/coinflip-play.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/features/gamba/pot.ts src/features/gamba/index.ts src/features/coinflip test/gamba-pot.test.ts test/coinflip-play.test.ts
git commit -m "feat(coinflip): settle bot flips and challenges with a pot rake"
```

---

### Task 5: Challenge registry (exactly-once and expiry timers)

**Files:**
- Create: `src/features/coinflip/challenges.ts`; extend `index.ts`
- Test: `test/coinflip-challenges.test.ts`

**Interfaces:**
- Produces (state on the Sapphire container, declared via `declare module '@sapphire/pieces'` like `src/features/gamba/active-card.ts`: `coinflipChallenges?: { closed: Set<string>; timers: Map<string, NodeJS.Timeout> }`):
  - `tryClose(messageId: string): boolean` — true only for the first caller; also clears that message's timer.
  - `reopen(messageId: string): void` — removes it from `closed` (acceptor-short path only; does not reschedule).
  - `scheduleExpiry(messageId: string, delayMs: number, onExpire: () => Promise<unknown>): void` — `setTimeout(...).unref()`; on fire, runs `onExpire` only if `tryClose` succeeds; a rejection is logged via `container.logger.warn`, never thrown.
  - `clearChallenges(): void` — clears both and cancels timers (tests).

- [ ] **Step 1: Write the failing tests** (`vi.useFakeTimers()`)

```ts
it('closes once', () => {
  expect(tryClose('m')).toBe(true);
  expect(tryClose('m')).toBe(false);
});
it('reopens after a short acceptor', () => {
  tryClose('m');
  reopen('m');
  expect(tryClose('m')).toBe(true);
});
it('expires an open challenge', async () => {
  const onExpire = vi.fn(async () => undefined);
  scheduleExpiry('m', 60_000, onExpire);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(onExpire).toHaveBeenCalledTimes(1);
  expect(tryClose('m')).toBe(false);
});
it('does not expire a challenge that was already accepted', async () => {
  const onExpire = vi.fn(async () => undefined);
  scheduleExpiry('m', 60_000, onExpire);
  tryClose('m');
  await vi.advanceTimersByTimeAsync(60_000);
  expect(onExpire).not.toHaveBeenCalled();
});
it('logs and swallows a failed expiry edit', async () => {
  /* onExpire rejects; logger.warn called */
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run test/coinflip-challenges.test.ts`, Expected: FAIL.
- [ ] **Step 3: Implement** the signatures above.
- [ ] **Step 4: Verify** — same command, Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/features/coinflip test/coinflip-challenges.test.ts
git commit -m "feat(coinflip): track open challenges and expire them"
```

---

### Task 6: Coinflip cards and error texts

**Files:**
- Create: `src/features/coinflip/cards.ts`; extend `index.ts`
- Test: `test/coinflip-cards.test.ts`

**Interfaces:**
- Consumes: `card`, `cardReply`, `accents`, `coins`, `discordTime` from `src/features/ui/index.ts`; `spinErrorText` from gamba; Tasks 3–4 types.
- Produces:
  - `type ChallengeView = Omit<ChallengeId, 'kind' | 'action'>`
  - `botFlipCard(userId: string, flip: BotFlip): ContainerBuilder` — heading `# 🪙 Heads` / `# 🪙 Tails`; line with the called side and `+net` / `-bet`; footer `-# <@user> · balance N · pot N`; button **Flip again** (`encodeFlipAgainId({ userId, bet, side })`, Primary). Accent `win` / `loss`.
  - `challengeCard(view: ChallengeView): ContainerBuilder` — `## Coinflip challenge`, `<@challenger> bets **N** on heads/tails`, who may accept (`<@opponent>` or `Anyone with N coins`), `Expires <t:…:R>`. Buttons: targeted → Accept (Success), Decline (Danger), Cancel (Secondary); open → Accept, Cancel. Each button's ID is `encodeChallengeId({ ...view, action })`. Accent `brand`.
  - `challengeResultCard(view: ChallengeView, settled: SettledChallenge): ContainerBuilder` — result side, `<@winner> wins N` (credited), `-# rake N to the pot · pot N`, no buttons. Accent `gold`.
  - `challengeClosedCard(view: ChallengeView, reason: 'expired' | 'declined' | 'cancelled' | 'challenger-short'): ContainerBuilder` — no buttons; texts `Challenge expired.`, `<@opponent> declined.`, `<@challenger> cancelled.`, `<@challenger> can't cover the bet anymore.`. Accent `loss`.
  - Constants: `notYourFlip = "This isn't your flip. Use \`/coinflip bot\` to flip your own."`, `notYourChallenge = "This challenge isn't for you."`, `challengeTaken = 'Someone already took this challenge.'`, `cannotChallengeSelf = "You can't challenge yourself."`, `cannotChallengeBot = "Bots don't flip coins. Use \`/coinflip bot\`."`.
  - `flipErrorText(error: unknown): string | undefined` — `ShortStakeError` acceptor → `` `You need ${coins(needed)} coins to accept. You have ${coins(balance)}.` ``; `ChallengeTakenError` → `challengeTaken`; otherwise `spinErrorText(error)`.

- [ ] **Step 1: Write the failing tests** — assert on `JSON.stringify(card.toJSON())` like `test/gamba-cards.test.ts`:
  - bot win card contains `Heads`, `+94`, `cf:again:1:100:heads`, accent `accents.win`; loss card contains `-100` and accent `accents.loss`.
  - targeted challenge card has three buttons with IDs `cf:accept:1:2:…`, `cf:decline:1:2:…`, `cf:cancel:1:2:…`; open card has two buttons, opponent `0`, text `Anyone`.
  - result and closed cards have no action rows; closed texts match the four reasons.
  - `flipErrorText(new ShortStakeError('acceptor', '3', 5, 100))` → `'You need 100 coins to accept. You have 5.'`; `flipErrorText(new InvalidBetError('range', '5'))` equals `spinErrorText` of the same error; unknown error → `undefined`.
- [ ] **Step 2: Run to verify failure** — `pnpm vitest run test/coinflip-cards.test.ts`, Expected: FAIL.
- [ ] **Step 3: Implement** (constructor argument order for `ShortStakeError`: `(who, userId, balance, needed)`; keep it consistent with Task 4).
- [ ] **Step 4: Verify** — same command, Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/features/coinflip test/coinflip-cards.test.ts
git commit -m "feat(coinflip): add flip and challenge cards"
```

---

### Task 7: `/coinflip` command

**Files:**
- Create: `src/commands/misc/coinflip.ts`
- Test: `test/coinflip-command.test.ts`

**Interfaces:**
- Consumes: `settleBotFlip`, `challengeCard`, `challengeClosedCard`, `scheduleExpiry`, `coinflip`, `flipErrorText`, `cannotChallengeSelf`, `cannotChallengeBot`, `parseBet`, `getOrCreateWallet`, `cardReply`, `errorReply`.
- Produces: slash command `coinflip` (guild context only) with subcommands `bot`, `challenge`, `open`. Every subcommand has `bet` (string, optional, description `'Coins to bet: 10 to 10,000, all, half or 2.5k (default: 10)'`) and `side` (string choices `heads` / `tails`, optional, default heads); `challenge` also has required user option `opponent`.

Behavior:
- `bot`: `settleBotFlip` → `interaction.reply(cardReply(botFlipCard(...)))`; errors through `flipErrorText` → `errorReply`, unknown errors rethrown.
- `challenge` / `open`: reject self / bot opponent (ephemeral). Parse the bet against the challenger's wallet (`parseBet(bet ?? String(wager.defaultBet), wallet.balance)`), nothing debited. `expiresAt = now + coinflip.expiryMs[mode]`. Reply with `challengeCard` and `withResponse: true`; targeted adds `allowedMentions: { users: [opponentId] }`. With the message ID, `scheduleExpiry(messageId, expiresAt - now, () => interaction.editReply(cardReply(challengeClosedCard(view, 'expired'))))`.

- [ ] **Step 1: Write the failing tests** using `makeChatInput(client, { commandName: 'coinflip', subcommand, userId: '1', options })` and `mockRandomInt` as in `test/gamba-buttons.test.ts`:
  - `bot` with `{ bet: '100', side: 'heads' }` and draw 0 → reply contains `Heads` and `+94`; wallet `startingBalance + 94`; one `flips` row.
  - `bot` with no options → bet 10.
  - `bot` with `{ bet: 'lots' }` → ephemeral error, no flip row.
  - `challenge` with `opponent: makeUser('3')` → reply has `allowedMentions.users === ['3']`, three buttons, no ledger rows besides `start`.
  - `challenge` with `opponent: makeUser('1')` → `cannotChallengeSelf`; with `makeUser('9', true)` → `cannotChallengeBot`.
  - `challenge` with a bet above the balance → funds error, no reply card.
  - `open` → two buttons, no `allowedMentions.users`; after `vi.advanceTimersByTimeAsync(120_000)` (fake timers), `editReply` called with text `Challenge expired.`
- [ ] **Step 2: Run to verify failure** — `pnpm vitest run test/coinflip-command.test.ts`, Expected: FAIL.
- [ ] **Step 3: Implement** the command.
- [ ] **Step 4: Verify** — same command, Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/commands/misc/coinflip.ts test/coinflip-command.test.ts
git commit -m "feat(coinflip): add /coinflip bot, challenge and open"
```

---

### Task 8: Coinflip buttons

**Files:**
- Create: `src/interaction-handlers/coinflip-buttons.ts`
- Test: `test/coinflip-buttons.test.ts`

**Interfaces:**
- Consumes: `decodeCoinflipId`, `settleBotFlip`, `settleChallenge`, `tryClose`, `reopen`, `ShortStakeError`, cards and texts from Task 6.
- Produces: a Button `InteractionHandler` whose `parse` returns `some(id)` for `decodeCoinflipId` hits, `none()` otherwise.

Behavior per kind (all replies to errors are `errorReply`, ephemeral; the card stays unchanged):
- `again`: clicker ≠ `userId` → `notYourFlip`. Else `settleBotFlip({ bet: String(id.bet), side: id.side })` → `interaction.update(cardReply(botFlipCard(...)))`.
- `accept`: clicker allowed = `opponentId === undefined ? clicker !== challengerId : clicker === opponentId`, else `notYourChallenge`. `tryClose(message.id)` false → `challengeTaken`. `Date.now() > expiresAt` → update `challengeClosedCard(view, 'expired')`. Else `settleChallenge({ messageId: message.id, mode: opponentId ? 'challenge' : 'open', acceptorId: clicker, ... })` → update `challengeResultCard`. `ShortStakeError` challenger → update `challengeClosedCard(view, 'challenger-short')`; acceptor → `reopen` + ephemeral `flipErrorText`; `ChallengeTakenError` → ephemeral `challengeTaken`.
- `decline`: only `opponentId`; `tryClose` → update `'declined'`, else `challengeTaken`.
- `cancel`: only `challengerId`; `tryClose` → update `'cancelled'`, else `challengeTaken`.

- [ ] **Step 1: Write the failing tests** with `makeButton` and a `click` helper as in `test/gamba-buttons.test.ts`; build IDs with `encodeChallengeId` and `expiresAt = Date.now() + 60_000`; `beforeEach` calls `clearChallenges()` and opens a fresh DB:
  - `again` by the owner flips and updates; by someone else → `notYourFlip`, no row.
  - `again` after draining the owner below the bet → ephemeral funds error, `update` not called, no flip row.
  - targeted accept by the opponent → update with the result; balances: winner `+B − rake`, loser `−B`; pot `+rake`.
  - targeted accept by a third user → `notYourChallenge`; open accept by the challenger → `notYourChallenge`.
  - open accept by `'3'` then by `'4'` on the same message → second gets `challengeTaken`; exactly one `flips` row.
  - after a settle, `clearChallenges()` (simulated restart) and accept again → `challengeTaken`, balances unchanged.
  - accept past `expiresAt` → update contains `Challenge expired.`, no row.
  - acceptor short → ephemeral `You need …`, then a funded user accepts the same open challenge successfully.
  - challenger short (drain them first) → update contains `can't cover the bet`.
  - decline by the opponent → `declined`; cancel by the challenger → `cancelled`; then accept → `challengeTaken`.
  - `cf:accept:garbage` → no reply, no update.
- [ ] **Step 2: Run to verify failure** — `pnpm vitest run test/coinflip-buttons.test.ts`, Expected: FAIL.
- [ ] **Step 3: Implement** the handler.
- [ ] **Step 4: Verify** — same command, Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/interaction-handlers/coinflip-buttons.ts test/coinflip-buttons.test.ts
git commit -m "feat(coinflip): handle flip again, accept, decline and cancel"
```

---

### Task 9: Coinflip in /stats and /leaderboard

**Files:**
- Modify: `src/features/stats/profile.ts`, `cards.ts`, `config.ts`, `leaderboard.ts`
- Test: `test/stats-profile.test.ts`, `test/stats-cards.test.ts`, `test/stats-leaderboard.test.ts`, `test/leaderboard-command.test.ts`

**Interfaces:**
- Consumes: Task 2 `playerStats` columns.
- Produces: `PlayerProfile` gains `flips`, `flipWins`, `flipWagered`, `flipWon` (missing row → 0); `leaderboardCategories` gains `'coinflip'` (last), `categoryLabels.coinflip = 'Coinflip net'`; leaderboard value `flipWon − flipWagered`, formatted signed like `profit`.

- [ ] **Step 1: Write the failing tests**
  - profile after `settleBotFlip` win with bet 100 → `{ flips: 1, flipWins: 1, flipWagered: 100, flipWon: 194 }`.
  - `profileCard` contains `Coinflips **1** · won **1** · net **+94**`; a loss-only profile shows `net **-100**`.
  - `leaderboardPage(db, '2', 'coinflip', 0)` orders by net, hides zero/negative; `leaderboardRank` matches; `isLeaderboardCategory('coinflip')` is true.
  - `leaderboardCard` for `coinflip` formats `+94`.
- [ ] **Step 2: Run to verify failure** — `pnpm vitest run test/stats-profile.test.ts test/stats-cards.test.ts test/stats-leaderboard.test.ts`, Expected: FAIL.
- [ ] **Step 3: Implement**; in `leaderboardCard` the signed formatter applies to `profit` and `coinflip`. The profile line goes after the net profit line.
- [ ] **Step 4: Verify** — `pnpm test`, Expected: PASS (leaderboard command and component tests still pass with the extra select option).
- [ ] **Step 5: Commit**

```bash
git add src/features/stats test
git commit -m "feat(stats): show coinflips in /stats and add a coinflip board"
```

---

### Task 10: Coinflip in the economy fuzz run

**Files:**
- Modify: `test/fuzz-economy.test.ts`

**Interfaces:**
- Consumes: `settleBotFlip`, `settleChallenge`, `CoinflipError`, `flips` table, `flipSides`.

- [ ] **Step 1: Add ops**
  - `flipBot`: `{ who, bet: betText, side: fc.constantFrom(...flipSides), draw: fc.constantFrom(0, 1) }` → `settleBotFlip(db, { ...who, bet, side }, now, () => draw)`.
  - `flipChallenge`: `{ guildId, challengerId, acceptorId (distinct users via fc.constantFrom(...users) pairs filtered), mode: 'challenge'|'open', bet: fc.integer({ min: 10, max: 10_000 }), side, draw, message: fc.nat({ max: 5 }) }` → `settleChallenge` with `messageId: \`m${message}\``(small range so repeats exercise`ChallengeTakenError`).
  - `snapshot` includes `flips`. `isExpectedFailure` already accepts `EconomyError` (which `CoinflipError` extends). A failed `flipBot` may leave a fresh wallet exactly like `wager`; extend that branch to `step.kind === 'wager' || step.kind === 'flipBot'`.
  - `expectInvariants`: every `flips` row has `1 <= rake <= bet` and a `flip_bet` ledger row with `ref = id`.
- [ ] **Step 2: Run** — `pnpm vitest run test/fuzz-economy.test.ts`, Expected: PASS. If it fails, the counterexample is a real bug: fix it in the owning module with a regression test before continuing.
- [ ] **Step 3: Commit**

```bash
git add test/fuzz-economy.test.ts
git commit -m "test: fuzz coinflips in the economy model run"
```

---

### Task 11: Docs

**Files:**
- Modify: `AGENTS.md` (layout: `features/coinflip/` line, `coinflip-buttons` under interaction-handlers, gamba line drops "free"; the Manage Roles note is unchanged)
- Modify: `README.md` (command list: `/coinflip bot|challenge|open` with the rake rule and expiry times)
- Modify: `docs/superpowers/specs/2026-10-24-gamba-economy-design.md` (one line under "Free spin": superseded by the coinflip spec)

- [ ] **Step 1: Edit the three files.**
- [ ] **Step 2: Verify** — `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, Expected: all pass.
- [ ] **Step 3: Commit**

```bash
git add AGENTS.md README.md docs/superpowers/specs/2026-10-24-gamba-economy-design.md
git commit -m "docs: document coinflip and paid-only gamba"
```
