# Games expansion: dice, prefix coinflip, animations, rematch, help, history

Date: 2026-10-28. Status: approved in brainstorming, pending spec review.

## Intent

Make the bot's games more fun to play in chat without breaking the economy's rules:
- `?coinflip` (aliases `?cf`, `?flip`) with full parity with `/coinflip`.
- A new dice game: two dice against the bot, betting on the roll.
- Creative, staged animations for coinflip and dice that stay inside Discord rate limits.
- Extras: a shared animation engine, `/help`, a coinflip rematch button, recent history on `/stats`.

Success means: every game is reachable by slash and `?` prefix, dice keeps the ~1% house edge and
low volatility the economy depends on, animations never pile up 429s or delay a result, and every
new way to move coins is covered by the existing test conventions (single-transaction settle,
ledger reasons, fuzz-economy op, fast-check on parsers).

## Constraints carried from AGENTS.md

- Coins move in one transaction before any animation; a failed frame never loses a result.
- Feature logic in `src/features/<name>/` behind `index.ts`; pieces stay thin.
- Button state lives in custom IDs; handlers ignore IDs they cannot decode.
- Mentions suppressed by default; only challenges ping the opponent.
- Schema change → `pnpm db:generate --name <change>`, migration committed.
- Each PR passes `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

## Architecture

Approach chosen: feature folders plus a shared animation engine. Each game owns its rules, settle
function, cards, frames and custom IDs; only animation plumbing is shared. A generic "bot game"
framework was rejected as premature with two games.

```
src/features/animation/   play(), display adapters, channel frame budget, user busy lock
src/features/coinflip/    + staged frames, prefix arg parser, rematch ID
src/features/dice/        rules, payouts, settle, cards, frames, dc:* IDs, arg parser
src/features/help/        help card
src/features/stats/       + dice profile/leaderboard, recent history query
src/commands/misc/        coinflip.ts (+messageRun), dice.ts (new)
src/commands/general/     help.ts (new)
src/interaction-handlers/ coinflip-buttons.ts (+rematch), dice-buttons.ts (new)
```

## 1. Animation engine (`src/features/animation/`)

Replaces `src/features/coinflip/animation.ts`.
- `play(display, frames, result, { channelId, userId })`: shows `frames` one edit at a time, then
  `result`. Same guarantees as today's `animate`: a failed intermediate frame logs a warning and
  skips to the result; errors from the first card or result propagate to the caller.
- Display adapters:
  - `replyDisplay(interaction)`: `reply` then `editReply` (slash commands).
  - `updateDisplay(button)`: `update` then `editReply`; if either fails, falls back to
    `button.message.edit(result)` (moved from `coinflip-buttons.ts::flipOnCard`).
  - `messageDisplay(message)`: `message.reply` then `sent.edit` (prefix commands). Returns the sent
    message so callers can arm challenge expiry on it.
- Channel frame budget: in-memory token bucket per channel, capacity 5, refilling 5 tokens per
  5,000 ms. Each intermediate frame spends one token; when none is left the remaining frames are
  skipped and the result is shown immediately. The first card and the result never spend a token
  and are never skipped.
- Spacing: `animation.frameMs = 700` between edits; tests override to 0 through the container (as
  `setFrameDelay` does today).
- User busy lock: `tryBegin(userId)` / `end(userId)` around a play for coinflip and dice (bot
  flips, accepts, Roll again, Flip again). A second play while one is animating is rejected before
  anything settles: ephemeral `"Still rolling… wait for your last one to land."` for interactions,
  a plain reply for prefix commands. The lock is released in `finally`.
- Cosmetic randomness (tumbling faces, spin glyphs, frame flavour) uses `Math.random`; outcomes
  always come from `crypto.randomInt` and are settled before the first frame.
- Config (`src/features/animation/config.ts`): `frameMs`, `budget: { capacity: 5, refillMs: 5000 }`.

## 2. Coinflip frames

Four frames then the result, replacing the current three alternating frames:
1. Toss: the coin rises (`🪙` with a rising caption).
2. Spin high: cycling `◐ ◓ ◑ ◒`.
3. Falling.
4. Teetering on its edge: gold accent, shows the _losing_ face briefly for suspense.
5. Result card (unchanged content).

Frames take the settled result so frame 4 can show the opposite face. Purely cosmetic; tests assert
the result card always matches the settled flip and that frame 4 never claims a result.

## 3. Prefix coinflip (`?coinflip`, `?cf`, `?flip`)

`CoinflipCommand` gains `aliases: ['cf', 'flip']`, `runIn: GuildAny` and `messageRun`.

`parseFlipArgs(tokens)` (pure, in `features/coinflip/args.ts`), tokens in any order:

| Token                                         | Meaning                            |
| --------------------------------------------- | ---------------------------------- |
| `<@id>`, `<@!id>`, bare snowflake             | challenge that member              |
| `open`                                        | open challenge                     |
| `bot`                                         | against the bot (also the default) |
| `h`, `heads`, `t`, `tails` (case-insensitive) | side                               |
| anything else                                 | bet text, passed to `parseBet`     |

Returns `{ mode, opponentId?, side, bet? }` or an error for: two bets, two targets, a target plus
`open`/`bot`, two sides. Errors reply with a usage line:
`` Usage: `?cf [bet] [heads|tails]`, `?cf @member [bet] [side]`, `?cf open [bet] [side]` ``.

Behaviour matches the slash subcommands: same `settleBotFlip`, same cards and buttons, same
self/bot-target checks (bots detected via the resolved member/user), same expiry, which edits the
sent message. Challenge replies opt in to pinging only the opponent.

## 4. Rematch

- Challenge result cards get a **Rematch** button:
  `cf:rematch:<challengerId>:<acceptorId>:<bet>:<challengerSide>` (≤ 100 chars).
- Only the two players may press it (others get `notYourChallenge`). The presser becomes the new
  challenger, keeps the side they held in the finished flip (acceptor held the other side), and
  targets the other player.
- Single use per result message: `tryClose('rematch:<messageId>')`. On success the old card is
  updated without the button and a new challenge card is sent as a reply to it, with expiry armed,
  pinging only the target. Stakes are checked at accept time, as for every challenge.
- `decodeCoinflipId` learns the `rematch` kind; fuzz tests cover round-trips and rejection.

## 5. Dice (`src/features/dice/`)

### Rules

- Two dice, each `crypto.randomInt(6) + 1`, against the bot.
- Bets: `parseBet` with `wager` limits (10 to 10,000; `all`, `half`, `2.5k`). Default 10 on `high`.
- Calls: `high` (8–12), `low` (2–6), `seven` (7), `doubles`, `exact` with target 2–12 except 7
  (7 is `seven`).
- Payout in basis points of the bet, exact integers giving 99.00% before flooring:

| Call           | Ways /36 | bps     |
| -------------- | -------- | ------- |
| high, low      | 15       | 23,760  |
| seven, doubles | 6        | 59,400  |
| exact 2 / 12   | 1        | 356,400 |
| exact 3 / 11   | 2        | 178,200 |
| exact 4 / 10   | 3        | 118,800 |
| exact 5 / 9    | 4        | 89,100  |
| exact 6 / 8    | 5        | 71,280  |

Exact is computed as `356_400 / ways`. `payout = floor(bet × bps / 10_000)` on a win, 0 on a loss.
- Edge to the gamba pot: `max(1, floor(bet / 100))` per roll, win or lose.
- `test/dice-evaluate.test.ts` enumerates all 36 outcomes for every call and fails outside a
  98.5–99.5% return.

### Data

- `rolls` table: `id`, `guild_id`, `user_id`, `bet`, `call` (enum `high|low|seven|doubles|exact`),
  `target` (nullable, set only for exact), `die1`, `die2`, `won` (0/1), `payout`, `edge`,
  `created_at`; index `rolls_user_idx (guild_id, user_id, created_at)`.
- Ledger reasons `dice_bet`, `dice_win`, both added to `gamblingReasons` in `economy/cashback.ts` so dice losses earn daily cashback like gamba and coinflip.
- `player_stats`: `rolls`, `roll_wins`, `roll_wagered`, `roll_won` (default 0).
- Also in this migration (for §8): indexes `flips_challenger_idx (guild_id, challenger_id)` and
  `flips_opponent_idx (guild_id, opponent_id)`.
- Members purge: unchanged. `prune.ts` deletes the wallet and `player_stats` (which now holds the
  dice counters) and keeps history rows, so `rolls` stays like `spins` and `flips` do.

### Settle

`settleRoll(db, { guildId, userId, bet?, call }, now, randomInt?)` → `{ bet, call, die1, die2,
total, won, payout, edge, balance, pot, rollId }`. One transaction: insert roll, debit `dice_bet`,
credit `dice_win` if won, add edge to pot, record stats. Bet/funds errors propagate before anything
but the wallet is written (same as `settleBotFlip`).

### Commands and buttons

- `/dice bet:<string> on:<choice>`; `on` choices (14): High, Low, Seven, Doubles, Exact 2–6, 8–12.
- `?dice` / `?roll`, args in any order, parsed by `parseDiceArgs` (pure, fast-checked):
  `high|hi|h`, `low|lo|l`, `seven|7`, `doubles|dbl|d`, `exact <n>` or `=<n>`; any other token is
  the bet. A bare number is always the bet. `exact 7` / `=7` means `seven`. Errors give a usage line.
- Result card: `🎲 ⚅ ⚁ = 8 · HIGH ✓`, net, balance, pot, **Roll again** button
  `dc:again:<userId>:<bet>:<callCode>` (call codes `h`, `l`, `7`, `d`, `e<n>`). Only the player may
  press it; undecodable IDs are ignored. `dice-buttons.ts` handles it with `updateDisplay`.

### Frames

Four frames then the result:
1. Tumbling (random faces).
2. Tumbling (random faces).
3. First die locks, second still tumbling.
4. "Needs" line from the call and the first die, e.g. `⚅ … any 2+ wins`, `⚀ … needs ⚀ for doubles`,
   `⚃ … can't make 12 now`. Computed by a pure `needsText(call, die1)` with example tests.
5. Result card.

### Logs and fuzz

- `big_roll` economy event when `bet ≥ 5,000` or `payout ≥ 5,000` (`logThresholds.bigRoll`).
- `diceRoll` op in `test/fuzz-economy.test.ts`; the conservation model counts the edge into the pot.

## 6. Stats

- Profile: `Dice **n** · won **w** · net **±x**` line.
- Leaderboard category `dice` ("Dice net", signed, `roll_won − roll_wagered`).

## 7. Help (`/help`, `?help`)

`features/help/` builds one static card:
- Games: gamba, coinflip, dice, each with slash and `?` forms and a one-line example.
- Coins: daily, cashback, collect, bailout, chat, with amounts and cooldowns read from the economy
  config so the card can't drift.
- Bets: `10–10k`, `all`, `half`, `2.5k`.

A test loads the stores and asserts every game command name appears on the card.

## 8. Recent history on `/stats`

- `recentPlays(db, guildId, userId, limit = 5)` in `features/stats/`: last flips (as challenger or
  opponent) and rolls merged by `created_at` desc.
- Rendered as a "Recent" block, e.g. `🪙 Tails vs <@bob> · +970 · <t:…:R>`,
  `🎲 ⚅⚁ 8 high · -100 · <t:…:R>`. Net per flip: bot win `credited − bet`, loss `−bet`; challenge
  winner `credited − bet`, loser `−bet`. Mentions in the block stay suppressed.
- Omitted when the player has no flips or rolls.

## Delivery

Stacked PRs, each green on CI, conventional commits, docs (AGENTS.md layout and notes,
CONTRIBUTING.md where conventions change, README command list) updated in the PR that changes
behaviour:
1. `refactor(animation)`: engine, budget, busy lock, adapters; coinflip moved onto it, frames
   unchanged.
2. `feat(coinflip)`: staged toss/spin/wobble/land frames.
3. `feat(coinflip)`: `?coinflip`, `?cf`, `?flip`.
4. `feat(coinflip)`: rematch button.
5. `feat(dice)`: schema + migration, rules, settle, `/dice` + `?dice`, Roll again, frames, logs,
   fuzz op.
6. `feat(stats)`: dice profile line and leaderboard category, recent history.
7. `feat(help)`: `/help` and `?help`.

This spec file is removed once all seven ship.

## Testing

- Dice payout enumeration (98.5–99.5%); exact bps table.
- `settleRoll` and rematch flows: balances, ledger rows, pot, stats, single-transaction rollback on
  failure.
- Custom IDs (`cf:rematch`, `dc:again`): example + fast-check round-trip and rejection.
- `parseFlipArgs`, `parseDiceArgs`: examples + fast-check (never throws, order-independent).
- Animation: budget skips frames under load but always shows the result; busy lock rejects before
  settle and releases on error; failed frame cuts short. Fake timers, `frameMs = 0`.
- End to end: prefix runs via `createClient` + `Events.MessageCreate` stubs (as `test/ping.test.ts`)
  for `?cf`, `?dice`, `?help`; slash and button handlers with `test/support/interaction.ts`.
- Fuzz economy: `diceRoll` op.

## Out of scope

- Animated custom emojis (considered; staged Unicode chosen).
- Dice PvP duels.
- Per-user animation opt-out.
