# Games Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dice game, `?coinflip`/`?cf`/`?flip`, staged rate-limit-aware animations, a coinflip rematch button, `/help`, and recent plays on `/stats`.

**Architecture:** A new shared `src/features/animation/` module (frame playback, per-channel frame budget, per-user busy lock, display adapters) replaces `coinflip/animation.ts`. Dice is its own feature folder mirroring coinflip (rules, single-transaction settle, cards, frames, `dc:*` IDs). Pieces stay thin; pure parsers and rules are unit- and property-tested.

**Tech Stack:** TypeScript (strict, ESM, NodeNext), discord.js Components V2, Sapphire, Drizzle + better-sqlite3, Vitest, fast-check, Biome.

**Spec:** `docs/superpowers/specs/2026-10-28-games-expansion-design.md`

## Global Constraints

- Before each commit: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` passes.
- Conventional commits, imperative lower case, ≤ ~72 chars, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `.js` extensions on relative imports; `import type` for type-only imports.
- Log via `this.container.logger` / `container.logger`, never `console`.
- Coins move in one transaction before the first animation frame.
- Mentions suppressed by default; only challenge cards opt in, for the opponent only.
- Custom IDs ≤ 100 chars; handlers return `this.none()` for IDs they cannot decode.
- Schema changes: edit `src/db/schema.ts`, then `pnpm db:generate --name <change>`; commit both.
- Animation: `frameMs = 700`; budget capacity 5, refill 5 tokens / 5,000 ms per channel.
- Busy text (exact): `Still rolling… wait for your last one to land.`
- Dice: return 99.00% (`returnBps = 9_900`); payout bps = `356_400 / ways`; edge `max(1, floor(bet / 100))` to the gamba pot.
- Module-level state lives on the Sapphire `container` (as `challenges.ts` / `active-card.ts` do) so every loaded copy shares it.
- Delivery: 7 stacked PRs. Branch PR 1 from `docs/games-expansion-spec` (so the spec and plan ship with it); each later branch from the previous one. PR titles = the task group headers below.

## Review Focus

1. A player clicks Flip again / Roll again repeatedly while an animation runs: the extra clicks must not settle a second bet or queue edits; they get the busy text. (Task 2, Task 11 tests.)
2. `?cf @everyone`, `?cf <@&role>` or a mention of someone not in the guild: never pings, never challenges; a usage or not-found reply. (Task 4, Task 5 tests.)
3. `?dice 12`: a bet of 12 on high, never an exact-12 call; `?dice =12 12` is exact 12 for 12 coins. (Task 9 test.)
4. Rematch pressed by a third party, twice by the same player, or by both players at once: at most one new challenge, others get a private error. (Task 6 test.)
5. Many games animating in one channel: later plays skip intermediate frames but always show their result; another channel is unaffected. (Task 1 test.)

---

## PR 1 — `refactor(animation): share frame playback across games`

### Task 1: Animation engine

**Files:**
- Create: `src/features/animation/{config,budget,busy,play,displays,index}.ts`
- Delete: `src/features/coinflip/animation.ts` (and its exports from `src/features/coinflip/index.ts`)
- Test: `test/animation-play.test.ts` (move cases from `test/coinflip-animation.test.ts`), `test/animation-budget.test.ts`, `test/animation-busy.test.ts`

**Interfaces:**
- Produces:
  - `animation = { frameMs: 700, budget: { capacity: 5, refillMs: 5_000 } } as const` (`config.ts`)
  - `takeFrame(channelId: string, now?: number): boolean`, `clearBudgets(): void` (`budget.ts`; state `container.animationBudgets?: Map<string, { tokens: number; at: number }>`, continuous refill `capacity × elapsed / refillMs`, capped at capacity)
  - `tryBegin(userId: string): boolean`, `end(userId: string): void`, `clearBusy(): void`, `stillRolling` (`busy.ts`; state `container.animationBusy?: Set<string>`)
  - `type CardReply = ReturnType<typeof cardReply>`; `interface Display { first(reply: CardReply): Promise<unknown>; next(reply: CardReply): Promise<unknown>; fallback?(reply: CardReply): Promise<unknown> }`
  - `play(display: Display, frames: readonly ContainerBuilder[], result: ContainerBuilder, options: { channelId: string }): Promise<unknown>`
  - `setFrameDelay(ms: number | undefined): void` (state `container.animationFrameMs`, replaces `coinflipFrameMs`)
  - `replyDisplay(interaction: RepliableInteraction): Display` — `reply` then `editReply`
  - `updateDisplay(interaction: ButtonInteraction): Display` — `update` then `editReply`; `fallback` = `interaction.message.edit`
  - `messageDisplay(message: Message): Display & { sent(): Message | undefined }` — `message.reply` then `sent.edit`

- [ ] **Step 1: Write failing tests.**
  - `animation-budget.test.ts`: `takes 5 frames then refuses the 6th in the same instant`; `refills one token after 1,000 ms`; `never exceeds capacity after a long idle`; `channels have separate buckets`.
  - `animation-busy.test.ts`: `tryBegin is true once, false while held, true again after end`; `different users do not block each other`.
  - `animation-play.test.ts`: the three existing `animate` cases rewritten for `play(..., { channelId: 'c' })`; plus `skips remaining frames once the channel budget is spent but still shows the result` (pre-spend 5 tokens with `takeFrame('c')`, play 3 frames → `first` once with frame 1, `next` once with the result); plus `uses fallback with the result when first or the result edit throws` (display with `fallback` spy; `next` rejects on the result → `fallback` called with a reply containing the result text, `play` resolves).
- [ ] **Step 2: Run** `pnpm vitest run test/animation-` — expect FAIL (modules missing).
- [ ] **Step 3: Implement** the files above. `play`: show `frames[0]` via `first` (no token); for each later frame, `if (!takeFrame(channelId)) break;` then sleep `frameDelay()` and `next` (log `animation: cutting a frame short: …` at warn and break on error); sleep, then `next(result)`. If `first` or the result `next` throws and `display.fallback` exists, log at error and `return display.fallback(cardReply(result))`; otherwise rethrow. No frames → `first(result)`.
- [ ] **Step 4: Run** `pnpm vitest run test/animation-` — PASS.
- [ ] **Step 5:** Delete `test/coinflip-animation.test.ts` cases that moved; keep frame-shape cases (they move to Task 3).

### Task 2: Move coinflip onto the engine, with the busy lock

**Files:**
- Modify: `src/commands/misc/coinflip.ts`, `src/interaction-handlers/coinflip-buttons.ts` (drop `flipOnCard`, use `updateDisplay`)
- Modify: `test/coinflip-command.test.ts`, `test/coinflip-buttons.test.ts` (import `setFrameDelay`, `clearBusy`, `clearBudgets` from `src/features/animation/index.js`; call `clearBusy(); clearBudgets();` in `beforeEach`)

**Interfaces:**
- Consumes: Task 1 (`play`, `replyDisplay`, `updateDisplay`, `tryBegin`, `end`, `stillRolling`).

- [ ] **Step 1: Failing tests.** In `coinflip-buttons.test.ts`: `a Flip again click while the same user is animating gets the busy text and settles nothing` — `tryBegin('u1')` first, click → ephemeral reply containing `Still rolling`, `flips` table empty, wallet unchanged. Same for `/coinflip bot` in `coinflip-command.test.ts`, and for an Accept click by a busy acceptor (challenge card stays live: a later Accept after `end` settles).
- [ ] **Step 2: Run** the two files — FAIL.
- [ ] **Step 3: Implement.** Before settling: `if (!tryBegin(userId)) return reply(errorReply(stillRolling))`; wrap settle + `play` in `try { … } finally { end(userId) }`. Bot flip, Flip again and Accept (acceptor's ID) take the lock; Decline/Cancel/challenge creation do not. Pass `{ channelId: interaction.channelId }`.
- [ ] **Step 4: Run** `pnpm test` — PASS (existing coinflip tests unchanged in behaviour).
- [ ] **Step 5: Docs + commit.** AGENTS.md layout: add `animation/` line ("shared frame playback: per-channel frame budget, per-user busy lock, display adapters for slash, button and prefix"); coinflip line drops "the flip animation". Commit `refactor(animation): share frame playback across games`. Open PR 1.

## PR 2 — `feat(coinflip): stage the flip as toss, spin, fall and wobble`

### Task 3: Staged coinflip frames

**Files:**
- Modify: `src/features/coinflip/{cards,config,index}.ts`, both coinflip pieces (pass the result)
- Test: `test/coinflip-cards.test.ts` (frame cases; move any remaining from `coinflip-animation.test.ts`, then delete that file)

**Interfaces:**
- Produces: `type FlipStage = 'toss' | 'spin' | 'fall' | 'edge'`; `flipAnimation = { stages: ['toss', 'spin', 'fall', 'edge'] } as const`; `flipFrame(stage: FlipStage, caption: string, result: FlipSide): ContainerBuilder`; `botFlipFrames(userId, flip: Pick<BotFlip, 'bet' | 'side' | 'result'>)`; `challengeFlipFrames(view, acceptorId, result: FlipSide)`. `flippingCard` is removed.

- [ ] **Step 1: Failing tests:** `botFlipFrames returns 4 frames in stage order`; `the spin frame shows one of ◐ ◓ ◑ ◒`; `the edge frame shows the losing side with the gold accent` (result `tails` → contains `Heads`, accent `accents.gold`); `no frame contains the result card's net or "wins"`; `frames carry the caption` (bet and mention).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Copy per stage (brand accent unless noted): toss `# 🪙 ⤴`, footer `-# tossed`; spin `# <glyph>` (random of `◐◓◑◒`, `Math.random`), footer `-# spinning`; fall `# 🪙 ⤵`, footer `-# falling`; edge `# 🪙 <Losing side>…?` gold, footer `-# teetering on its edge`. Caption is the second text in every frame.
- [ ] **Step 4: Run** `pnpm test` — PASS.
- [ ] **Step 5: Commit** `feat(coinflip): stage the flip as toss, spin, fall and wobble`. Open PR 2.

## PR 3 — `feat(coinflip): add ?coinflip, ?cf and ?flip`

### Task 4: Prefix argument parser

**Files:**
- Create: `src/features/coinflip/args.ts` (export from `index.ts`)
- Test: `test/coinflip-args.test.ts`, `test/fuzz-coinflip-args.test.ts`

**Interfaces:**
- Produces: `interface FlipArgs { mode: FlipMode; opponentId?: string; side: FlipSide; bet?: string }`; `parseFlipArgs(tokens: readonly string[]): FlipArgs | undefined` (undefined = usage error); `flipUsage` = ``Usage: `?cf [bet] [heads|tails]`, `?cf @member [bet] [side]`, `?cf open [bet] [side]` ``.

- [ ] **Step 1: Failing tests.** Examples: `[]` → `{ mode: 'bot', side: 'heads' }`; `['500','tails']` and `['tails','500']` equal `{ mode:'bot', side:'tails', bet:'500' }`; `['t','all']` → tails, bet `all`; `['<@123456789012345678>','1k']` and `['<@!123456789012345678>','1k']` → challenge, that ID, heads; bare `123456789012345678` → challenge; `['open','250','T']` → open, tails; `['bot','10']` → bot. Undefined for: `['10','20']`, two mentions, mention + `open`, `open` + `bot`, `['heads','tails']`, `['@everyone']`, `['<@&123456789012345678>']`. Fuzz: never throws on `fc.array(fc.string())`; result is invariant under shuffling the tokens (`fc.shuffledSubarray` of a valid token set).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Keywords case-insensitive: `bot`, `open`, `h|heads`, `t|tails`. Target: `/^<@!?(\d{17,20})>$/` or `/^\d{17,20}$/`. A token starting with `@` or `<@&` → undefined. Any other token is the bet; more than one bet token → undefined.
- [ ] **Step 4: Run** — PASS.

### Task 5: `messageRun` on `/coinflip`

**Files:**
- Modify: `src/commands/misc/coinflip.ts` (`aliases: ['cf', 'flip']`, `runIn: CommandOptionsRunTypeEnum.GuildAny`, `messageRun`)
- Modify: `src/features/coinflip/cards.ts` (`memberNotFound = "I can't find that member here."`)
- Test: `test/coinflip-prefix.test.ts`

**Interfaces:**
- Consumes: Task 1 `messageDisplay`, Task 4 `parseFlipArgs`, existing `settleBotFlip`, `challengeCard`, `scheduleExpiry`.
- Refactor inside the command: the bot-flip and challenge paths take a small surface `{ channelId, userId, guildId, reply(card, mentions?: string[]): Promise<Message | undefined>, display: Display, error(text): Promise<unknown> }` so slash and prefix share one body. Prefix errors reply with plain text (as `?gamba` does).

- [ ] **Step 1: Failing tests** (stub message like `test/ping.test.ts`, `guild.members.fetch` stubbed, `crypto.randomInt` mocked as in `coinflip-command.test.ts`, `setFrameDelay(0)`): `?cf 100 tails` settles a bot flip and edits the sent card to the result card; `?flip` with no args flips 10 on heads; `?coinflip @bob 50` replies with a challenge card, `allowedMentions.users` = `[bob]`, and expiry edits the sent message; `?cf open 50` has no allowedMentions users; `?cf @self` → `cannotChallengeSelf`; `?cf @botUser` → `cannotChallengeBot`; `?cf <@id-not-in-guild>` (fetch rejects) → `memberNotFound`; `?cf 10 20` → `flipUsage`; `?cf all` while busy → busy text, nothing settled.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** as described. Opponent lookup: `await message.guild.members.fetch(id).catch(() => null)`; bot check via `member.user.bot`.
- [ ] **Step 4: Run** `pnpm test` — PASS.
- [ ] **Step 5: Docs + commit.** AGENTS.md commands line `misc/` → "games: `?gamba` / `/gamba`, `?coinflip` / `/coinflip` (aliases `?cf`, `?flip`)"; README command list. Commit `feat(coinflip): add ?coinflip, ?cf and ?flip`. Open PR 3.

## PR 4 — `feat(coinflip): add a rematch button to challenge results`

### Task 6: Rematch

**Files:**
- Modify: `src/features/coinflip/{custom-ids,cards,index}.ts`, `src/interaction-handlers/coinflip-buttons.ts`
- Create: `withoutActionRows(container: APIContainerComponent): ContainerBuilder` in `src/features/ui/index.ts`
- Test: `test/coinflip-custom-ids.test.ts`, `test/fuzz-custom-ids.test.ts`, `test/coinflip-buttons.test.ts`, `test/ui-cards.test.ts`

**Interfaces:**
- Produces: `interface RematchId { kind: 'rematch'; challengerId: string; acceptorId: string; bet: number; challengerSide: FlipSide }`; `encodeRematchId(id: Omit<RematchId, 'kind'>): string` → `cf:rematch:<challengerId>:<acceptorId>:<bet>:<challengerSide>`; `CoinflipId` gains `RematchId`; `rematchTaken = 'A rematch is already on.'`. `challengeResultCard(view, settled)` now ends with a Rematch button (secondary style); acceptor = whichever of `winnerId`/`loserId` is not `view.challengerId`.

- [ ] **Step 1: Failing tests.** IDs: round-trip; rejects wrong part count, equal challenger/acceptor, bad bet, bad side; fuzz round-trip with 20-digit snowflakes stays ≤ 100 chars. UI: `withoutActionRows` keeps text displays, drops action rows. Handler: `a stranger pressing Rematch gets notYourChallenge`; `the loser pressing Rematch strips the button from the result and replies with a challenge from them to the winner, keeping their side, pinging only the winner`; `a second press (either player) gets rematchTaken and sends nothing`; `the rematch challenge expires by editing the new message`; `accepting the rematch settles as a normal challenge`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Handler order: check clicker ∈ {challenger, acceptor}; `tryClose(\`rematch:${messageId}\`)`else`rematchTaken`; `interaction.update({ ...cardReply(withoutActionRows(interaction.message.components[0].toJSON())) })`; new view `{ challengerId: clicker, opponentId: other, bet, side: clicker === challengerId ? challengerSide : otherSide(challengerSide), expiresAt: now + coinflip.expiryMs.challenge }`; `interaction.message.reply({ ...cardReply(challengeCard(view)), allowedMentions: { users: [other] } })`; `scheduleExpiry(sent.id, …, () => sent.edit(cardReply(challengeClosedCard(view, 'expired'))))`. A failed reply is logged at error; the card is already stripped.
- [ ] **Step 4: Run** `pnpm test` — PASS.
- [ ] **Step 5: Commit** `feat(coinflip): add a rematch button to challenge results`. Open PR 4.

## PR 5 — `feat(dice): add dice, a 2d6 game against the bot`

### Task 7: Dice rules

**Files:**
- Create: `src/features/dice/{config,calls,rules,index}.ts`
- Test: `test/dice-rules.test.ts`, `test/dice-evaluate.test.ts`

**Interfaces:**
- Produces:
  - `dice = { returnBps: 9_900, edgePercent: 1 } as const`
  - `type DiceCall = { kind: 'high' | 'low' | 'seven' | 'doubles' } | { kind: 'exact'; target: number }` (exact target ∈ 2–12 \ {7})
  - `defaultCall: DiceCall = { kind: 'high' }`
  - `encodeCall(call): string` (`h`, `l`, `7`, `d`, `e<n>`); `decodeCall(code: string): DiceCall | undefined`; `callLabel(call): string` (`High`, `Low`, `Seven`, `Doubles`, `Exact 9`); `dieFace(n: number): string` (`⚀`–`⚅`)
  - `rollDice(randomInt?: RandomInt): [number, number]` (each `randomInt(6) + 1`, default `crypto.randomInt`)
  - `wins(call, die1, die2): boolean`; `ways(call): number`; `payoutBps(call): number` (`36 × returnBps / ways`); `payoutFor(call, bet): number` (`floor(bet × bps / 10_000)`); `diceEdge(bet): number` (`max(1, floor(bet × edgePercent / 100))`)
  - `needsText(call, die1): string`

- [ ] **Step 1: Failing tests.** `payoutBps`: high/low 23,760; seven/doubles 59,400; exact 2 and 12 356,400; exact 6 and 8 71,280. `dice-evaluate.test.ts`: for every call, `Σ over 36 draws of (wins ? payoutBps : 0) / 36 / 10_000` is in [0.985, 0.995] (and exactly 0.99 before flooring). `decodeCall(encodeCall(c))` round-trips every call; rejects `e7`, `e1`, `e13`, `x`, ``. `needsText` exact copy: high die 6 → `⚅ … any roll wins`, high die 3 → `⚂ … needs 5+`, high die 1 → `⚀ … can't make high now`; low die 1 → `⚀ … needs 5 or less`, low die 6 → `⚅ … can't make low now`; seven die 4 → `⚃ … needs a ⚂`; doubles die 2 → `⚁ … needs a ⚁ for doubles`; exact 12 die 4 → `⚃ … can't make 12 now`; exact 9 die 4 → `⚃ … needs a ⚄`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** High: needed = `8 − die1`; ≤ 1 → any roll wins, > 6 → can't. Low: max = `6 − die1`; < 1 → can't, otherwise `needs <max> or less` (max 5 at most, so never "any"). Seven: `needs a <face(7 − die1)>`. Doubles: `needs a <face(die1)> for doubles`. Exact: `n − die1` in 1–6 → `needs a <face>`, else `can't make <n> now`.
- [ ] **Step 4: Run** — PASS.

### Task 8: Schema, migration and `settleRoll`

**Files:**
- Modify: `src/db/schema.ts`, `src/features/economy/cashback.ts` (`gamblingReasons` += `'dice_bet', 'dice_win'`)
- Create: `drizzle/0005_dice.sql` + snapshot (via `pnpm db:generate --name dice`), `src/features/dice/{play,stats}.ts`
- Test: `test/dice-play.test.ts`, `test/economy-cashback.test.ts`, `test/db.test.ts` (migration applies)

**Interfaces:**
- Produces:
  - schema: `diceCallKinds = ['high','low','seven','doubles','exact'] as const`, `type DiceCallKind`; ledger reasons `'dice_bet'`, `'dice_win'`; `rolls` table (`id`, `guild_id`, `user_id`, `bet`, `call` enum, `target` nullable, `die1`, `die2`, `won` integer 0/1, `payout`, `edge`, `created_at`; index `rolls_user_idx (guild_id, user_id, created_at)`); `player_stats` += `rolls`, `roll_wins`, `roll_wagered`, `roll_won` (not null, default 0); `flips` indexes `flips_challenger_idx (guild_id, challenger_id)`, `flips_opponent_idx (guild_id, opponent_id)`
  - `interface RollRequest { guildId: string; userId: string; bet?: string; call: DiceCall }`
  - `interface Roll { bet: number; call: DiceCall; die1: number; die2: number; total: number; won: boolean; payout: number; edge: number; balance: number; pot: number; rollId: number }`
  - `settleRoll(db: Db, request: RollRequest, now: number, randomInt?: RandomInt): Roll`
  - `recordRollStats(tx: DbOrTx, guildId, userId, roll: { bet: number; won: boolean; payout: number }): void`

- [ ] **Step 1: Failing tests.** `a winning high roll debits the bet, credits the payout, adds the edge to the pot and writes one roll row` (draws `[5, 2]` → 6+3; bet 100 → payout 237, edge 1, ledger `dice_bet −100` and `dice_win +237` with `ref = rollId`); `a losing roll credits nothing but still feeds the pot`; `exact 12 on ⚅⚅ pays floor(bet × 35.64)`; `stats count rolls, wins, wagered and won`; `an invalid bet (InvalidBetError) or short balance (InsufficientFundsError) throws and leaves no roll or dice ledger rows`. Cashback: `dice losses count toward yesterday's net`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** schema, run `pnpm db:generate --name dice`, then `settleRoll` mirroring `settleBotFlip` (wallet + `parseBet(request.bet?.trim() || String(wager.defaultBet), balance)` outside; inside one `db.transaction`: roll, insert row, debit, credit if won, `addToPot(tx, guildId, edge)`, stats).
- [ ] **Step 4: Run** `pnpm test` and `pnpm db:generate` (must report no changes) — PASS.

### Task 9: Dice custom IDs and prefix parser

**Files:**
- Create: `src/features/dice/{custom-ids,args}.ts`
- Test: `test/dice-custom-ids.test.ts`, `test/dice-args.test.ts`, extend `test/fuzz-custom-ids.test.ts`, new `test/fuzz-dice-args.test.ts`

**Interfaces:**
- Produces: `interface RollAgainId { kind: 'again'; userId: string; bet: number; call: DiceCall }`; `encodeRollAgainId(id: Omit<RollAgainId,'kind'>): string` → `dc:again:<userId>:<bet>:<callCode>`; `decodeDiceId(customId: string): RollAgainId | undefined` (bet within `wager` limits, as `coinflip/custom-ids.ts` does); `parseDiceArgs(tokens: readonly string[]): { bet?: string; call: DiceCall } | undefined`; `diceUsage` = ``Usage: `?dice [bet] [high|low|seven|doubles|=2…12]` ``.

- [ ] **Step 1: Failing tests.** Parser: `[]` → high, no bet; `['100','high']` = `['high','100']`; `['lo','2.5k']` → low; `['7']` → seven, no bet; `['=12','all']` and `['exact','12','all']` → exact 12, bet `all`; `['12']` → high, bet `12`; `['=12','12']` → exact 12, bet 12; `['=7']` → seven; `['dbl']`, `['d']` → doubles. Undefined: `['=13']`, `['=1']`, `['high','low']`, `['10','20']`, `['exact']`, `['exact','x']`. Fuzz: never throws; order-independent for valid sets. IDs: round-trip every call code; reject other prefixes, bad call codes, bets out of range; ≤ 100 chars.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Keywords case-insensitive: `high|hi|h`, `low|lo|l`, `seven|7`, `doubles|dbl|d`, `=<n>`, `exact <n>` (consumes the next token). One call and one bet at most.
- [ ] **Step 4: Run** — PASS.

### Task 10: Dice cards and frames

**Files:**
- Create: `src/features/dice/cards.ts`
- Test: `test/dice-cards.test.ts`

**Interfaces:**
- Produces: `rollCard(userId: string, roll: Roll): ContainerBuilder`; `rollFrames(userId: string, roll: Roll): ContainerBuilder[]`; `notYourRoll = "This isn't your roll. Use \`/dice\` to roll your own."`; `diceErrorText(error: unknown): string | undefined`(=`spinErrorText`).

- [ ] **Step 1: Failing tests.** `rollCard`: win accent `accents.win`, loss `accents.loss`; title `# 🎲 ⚅ ⚁ = 8 · HIGH ✓` (loss uses `✗`); line `Called **High** · +137` / `· -100`; footer `-# <@u> · balance … · pot …`; Roll again button with `encodeRollAgainId({ userId, bet, call })`. `rollFrames`: 4 frames; frames 1–2 have two faces and footer `-# tumbling`; frame 3 shows `dieFace(die1)` and `🎲`, footer `-# first die down`; frame 4 contains `needsText(call, die1)`; no frame contains `✓` or `✗`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** (tumbling faces via `Math.random`, caption `<@u> called **<label>** · <bet>` as every frame's second text).
- [ ] **Step 4: Run** — PASS.

### Task 11: `/dice`, `?dice`, `?roll` and Roll again

**Files:**
- Create: `src/commands/misc/dice.ts`, `src/interaction-handlers/dice-buttons.ts`
- Test: `test/dice-command.test.ts`, `test/dice-buttons.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 7–10.
- Produces: slash `/dice bet:<string> on:<string choice>`; choices (value = call code): High `h`, Low `l`, Seven `7`, Doubles `d`, Exact 2–6 `e2`–`e6`, Exact 8–12 `e8`–`e12` (14). Prefix aliases `['roll']`, `runIn: GuildAny`.

- [ ] **Step 1: Failing tests:** `/dice` with no options rolls 10 on high and animates to `rollCard`; `/dice on:e12 bet:50` settles exact 12; `?dice =12 50` same through `messageDisplay`; `?roll 10 20` → `diceUsage`; insufficient funds → `diceErrorText` (ephemeral for slash, plain for prefix); Roll again by owner settles again with the same bet and call via `updateDisplay`; by someone else → `notYourRoll`; while busy → busy text, nothing settled; an undecodable `dc:` ID is ignored by `parse`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** as thin pieces, following `coinflip.ts` and `coinflip-buttons.ts` (busy lock around settle + `play`).
- [ ] **Step 4: Run** `pnpm test` — PASS.

### Task 12: Dice logs and economy fuzzing

**Files:**
- Modify: `src/features/logs/{config,events,economy,cards}.ts`, `src/commands/misc/dice.ts`, `src/interaction-handlers/dice-buttons.ts`, `test/fuzz-economy.test.ts`
- Test: `test/logs-economy.test.ts`, `test/logs.test.ts`

**Interfaces:**
- Produces: `logThresholds.bigRoll = 5_000`; event `{ type: 'big_roll'; userId: string; bet: number; call: string; total: number; won: boolean; payout: number }`; `rollLogEvent(userId: string, roll: Roll): EconomyEvent | undefined` (bet ≥ threshold or payout ≥ threshold); card title `Big dice roll`, lines `<@u> bet <bet> on <label>, rolled <total>` and `Payout: <payout>`, accent win/brand like `big_spin`.

- [ ] **Step 1: Failing tests:** thresholds (4,999 bet and payout → undefined; 5,000 bet → event; small bet with payout ≥ 5,000 on exact 12 → event); card text. Fuzz: add `diceRoll` op `{ kind: 'diceRoll', who, bet: betText, call: fc.constantFrom(...all 14 calls), draws: fc.tuple(fc.nat(5), fc.nat(5)) }` applied with `settleRoll(..., draws([d1, d2]))`; include `rolls` in `snapshot`; in `expectInvariants`, for every roll row: `1 ≤ edge ≤ bet`, ledger rows with `ref = id` are one `dice_bet −bet` and, iff won, one `dice_win +payout`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement;** fire `void logEconomy(guildId, event)` after settle in both pieces.
- [ ] **Step 4: Run** `pnpm test` — PASS.
- [ ] **Step 5: Docs + commit.** AGENTS.md: `features/dice/` layout line, `misc/` line adds `?dice` / `/dice` (alias `?roll`), a Conventions bullet "Dice payouts (`returnBps` in `src/features/dice/config.ts`) return 99%; `test/dice-evaluate.test.ts` fails outside 98.5–99.5%." Mirror the convention in CONTRIBUTING.md; README commands. Commit `feat(dice): add dice, a 2d6 game against the bot` (or split into `feat(dice): add rules and settlement` for Tasks 7–8 and `feat(dice): add /dice and ?dice` for 9–12 if the diff is large; each commit green). Open PR 5.

## PR 6 — `feat(stats): show dice and recent plays`

### Task 13: Dice on profile and leaderboard

**Files:**
- Modify: `src/features/stats/{config,profile,cards,leaderboard}.ts`
- Test: `test/stats-profile.test.ts`, `test/stats-cards.test.ts`, `test/stats-leaderboard.test.ts`

**Interfaces:**
- Produces: `PlayerProfile` += `rolls`, `rollWins`, `rollWagered`, `rollWon`; leaderboard category `'dice'` labelled `Dice net`, value `roll_won − roll_wagered`, signed format.

- [ ] **Step 1: Failing tests:** profile reads the new columns (zeros without a row); card line `Dice **n** · won **w** · net **±x**` after the coinflip line; `dice` category ranks by net and formats signed; departed players excluded (as other categories).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.

### Task 14: Recent plays

**Files:**
- Create: `src/features/stats/recent.ts` (export from `index.ts`)
- Modify: `src/features/stats/cards.ts`, `src/commands/stats/stats.ts`
- Test: `test/stats-recent.test.ts`, `test/stats-command.test.ts`

**Interfaces:**
- Produces: `type RecentPlay = { kind: 'flip'; at: number; net: number; result: FlipSide; opponentId?: string } | { kind: 'roll'; at: number; net: number; die1: number; die2: number; call: DiceCall }`; `recentPlays(db: DbOrTx, guildId: string, userId: string, limit = 5): RecentPlay[]` (newest first); `profileCard(userId, avatarUrl, profile, recent: RecentPlay[] = [])`.

- [ ] **Step 1: Failing tests:** merges flips (as challenger or opponent) and rolls by `created_at` desc, capped at 5; nets: bot win `2×bet − rake − bet`, bot loss `−bet`, challenge winner `credited − bet` where `credited = 2×bet − rake`, loser `−bet`; card lines `🪙 Tails vs <@bob> · +970 · <t:…:R>`, `🪙 Heads · -100 · <t:…:R>` (bot), `🎲 ⚅⚁ 8 high · -100 · <t:…:R>` (call label lower case, exact as `=9`); a "### Recent" block appears only when `recent` is non-empty; `/stats` reply has no `allowedMentions` users.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** two queries (flips where `challenger_id = u or opponent_id = u`, rolls where `user_id = u`, each `order by created_at desc limit 5`), merged in JS.
- [ ] **Step 4: Run** `pnpm test` — PASS.
- [ ] **Step 5: Docs + commit** (AGENTS.md `stats/` line mentions recent plays). Commit `feat(stats): show dice and recent plays`. Open PR 6.

## PR 7 — `feat(help): add /help and ?help`

### Task 15: Help card and command; remove the spec and plan

**Files:**
- Create: `src/features/help/{cards,index}.ts`, `src/commands/general/help.ts`
- Delete: `docs/superpowers/specs/2026-10-28-games-expansion-design.md`, `docs/superpowers/plans/2026-10-28-games-expansion.md`
- Test: `test/help.test.ts`

**Interfaces:**
- Produces: `helpCard(prefix: string): ContainerBuilder`; command `help` (slash + prefix, ephemeral for slash, normal reply for prefix).

- [ ] **Step 1: Failing tests:** card has `## Games`, `## Coins`, `## Bets` sections; games list `/gamba` `?gamba`, `/coinflip` `?cf`, `/dice` `?dice` each with one example; coins lines interpolate `daily.base`, `collect.perHour`/`collect.maxHours`, `bailout.cooldownMs` (as minutes), `chatReward.amount`, `cashback.percent`/`cashback.max` (test changes the expected strings from the config objects, not literals); bets line `10 to 10,000, all, half, 2.5k` from `wager`; after `client.stores.load()`, every command in the `misc` category appears on the card (`/<name>`); `?help` and `/help` reply with the card.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm test` — PASS.
- [ ] **Step 5: Docs + commit.** AGENTS.md `general/` → `?ping` / `/ping`, `?help` / `/help`; `features/help/` line; README. Delete the spec and plan. Commit `feat(help): add /help and ?help` and a separate `docs: remove the shipped games expansion spec and plan`. Open PR 7.
