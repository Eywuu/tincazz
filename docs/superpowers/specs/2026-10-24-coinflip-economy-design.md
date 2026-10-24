# Coinflip and paid-only gamba design

Date: 2026-10-24
Status: approved in conversation, pending written-spec review
Supersedes the "Free play" and "Free spin" parts of `2026-10-24-gamba-economy-design.md`.

## Goal

Tighten the economy now that coins matter: every gamba spin costs coins, and a second game,
coinflip, lets players bet against the bot or against each other. A small rake from every flip
feeds the gamba pot.

## Decisions

| Topic            | Decision                                                                        |
| ---------------- | ------------------------------------------------------------------------------- |
| Gamba default    | No bet means a 10-coin wager (the minimum bet, unchanged)                       |
| Free spins       | Removed entirely; historical rows stay untouched                                |
| Coinflip modes   | vs bot, targeted challenge, open challenge (anyone with funds can accept)       |
| Rake             | 3% of the flip pool (`2 × bet`), at least 1 coin, paid into the gamba pot       |
| Challenge escrow | None: affordability checked at creation, both stakes debited atomically on accept |
| Challenge expiry | 60 s targeted, 120 s open                                                       |
| Stats            | `flips` history table, coinflip columns in `player_stats`, `/stats` line, board |
| Surface          | Slash command only (`/coinflip`); buttons for flip again / accept / decline / cancel |

## Part 1: paid-only gamba

- `?gamba` and `/gamba` without a bet play a wager of `wager.defaultBet` (10, a new constant in
  `src/features/gamba/config.ts`). Bet limits stay 10 to 10,000. The `/gamba` option description
  becomes "Coins to bet: 10 to 10,000, all, half or 2.5k (default: 10)".
- A player whose balance is below 10 gets the existing insufficient-funds reply with the
  `/bailout` hint.
- Removed: `playFree`, `FreeSpin`, `freeSpinCard`, `recordFreeSpinStats`, every `mode === 'free'`
  branch in `text.ts`, `cards.ts` and `spin.ts`. `Spin` is `WagerSpin` only.
- Spin button custom IDs no longer accept `bet: 0`. A button on an old free-spin card fails to
  decode and is ignored, like any unknown ID.
- No migration. `'free'` stays in `spinModes` and `'free_prize'` in `ledgerReasons`, commented as
  legacy values that only appear in historical rows. Old free spins remain counted in
  `player_stats.spins`.

## Part 2: coinflip rules

### Commands

`/coinflip` with three subcommands. Every subcommand takes `bet` (string, same forms as gamba:
integer, `all`, `half`, `2.5k`; default 10) and `side` (choice `heads` / `tails`; default heads).
Bet limits are the gamba limits (10 to 10,000).

| Subcommand                                        | Meaning                                         |
| ------------------------------------------------- | ----------------------------------------------- |
| `/coinflip bot [bet] [side]`                      | Flip against the bot, settled immediately       |
| `/coinflip challenge opponent:<user> [bet] [side]` | Only `opponent` can accept, 60 s to accept      |
| `/coinflip open [bet] [side]`                     | Anyone but the challenger can accept, 120 s     |

No prefix command: prefix commands depend on the privileged Message Content intent and the
challenge flows need buttons anyway.

### Rake

For a bet `B` the pool is `2B` (in bot mode the bot matches the stake).
`rake = max(1, floor(2B × 3 / 100))`. The rake goes to the guild pot (created at its seed if
missing). The winner receives `pool − rake`.

| Mode               | Winner                                       | Loser                                              |
| ------------------ | -------------------------------------------- | -------------------------------------------------- |
| bot, player wins   | player credited `2B − rake` (net `B − rake`) | -                                                  |
| bot, bot wins      | -                                            | player loses `B`; `rake` to the pot, rest burned   |
| challenge / open   | credited `2B − rake` (net `B − rake`)        | loses `B`                                          |

Example, `B = 100`: pool 200, rake 6. A win nets +94, a loss costs 100. Against the bot the player
expects to lose `rake / 2`, about 3% of the bet, which makes bot flips a coin sink. In player
modes the rake is the only coins leaving the players. The pot is still only won by a gamba
jackpot.

Since `rake ≤ floor(0.06 × B) + 1 ≤ B` for every `B ≥ 10`, the rake never exceeds the loser's stake.

### Flip

`flipCoin(randomInt?)` returns `'heads'` or `'tails'` from `crypto.randomInt(2)` (injectable for
tests). The challenger's side wins if it matches the result. In challenge and open modes the
acceptor takes the other side.

### Vs bot

1. Parse the bet against the wallet balance (`parseBet`), creating the wallet if needed.
2. In one transaction: insert the `flips` row, debit `B` (`flip_bet`), on a win credit `2B − rake`
   (`flip_win`), add `rake` to the pot, update stats.
3. Reply with a result card: coin result, the side called, net change, balance, pot, and a
   **Flip again** button (same bet and side, only the owner can use it; others get an ephemeral
   "not your flip"). The button custom ID is `cf:again:<userId>:<bet>:<side>`.

### Challenges (targeted and open)

1. **Create.** Parse the bet against the challenger's balance (insufficient funds is an
   ephemeral error). For a targeted challenge the opponent must not be the challenger and must
   not be a bot. Nothing is debited.
2. **Card.** Shows challenger, bet, the challenger's side, who can accept, and the expiry as a
   Discord relative timestamp. Buttons:
   - targeted: **Accept** and **Decline** (opponent only), **Cancel** (challenger only). The
     message pings the opponent through an explicit `allowedMentions: { users: [opponentId] }`.
   - open: **Accept** (anyone but the challenger), **Cancel** (challenger only). Pings nobody.
   Custom ID: `cf:<action>:<challengerId>:<opponentId or 0>:<bet>:<side>:<expiresAt base36 seconds>`,
   with `action` in `accept | decline | cancel`. It stays well under Discord's 100 characters.
3. **Accept.** In order:
   - wrong user (not the opponent of a targeted challenge, or the challenger on an open one):
     ephemeral "not your challenge", nothing changes;
   - challenge already closed: ephemeral "already taken";
   - past `expiresAt`: close it and update the card to "expired";
   - otherwise close it, then settle in one transaction: insert the `flips` row (with
     `message_id`), debit both stakes (`flip_bet`), credit the winner `2B − rake` (`flip_win`),
     add the rake to the pot, update both players' stats. Update the card with the result.
   - if the **challenger** can no longer cover `B`, nothing is written; the card becomes "closed:
     <challenger> can't cover the bet".
   - if the **acceptor** can't cover `B`, nothing is written, the challenge is reopened, and the
     acceptor gets an ephemeral "you need N coins". An open challenge stays available to others.
4. **Decline / Cancel.** Close the challenge and update the card to "declined" / "cancelled" with
   the buttons removed.
5. **Expiry timer.** After creating the card, a best-effort `setTimeout` closes the challenge and
   edits the card to "expired" if it is still open. After a restart there is no timer, but the
   `expiresAt` in the custom ID still rejects a late Accept.

### Exactly-once settlement

`src/features/coinflip/challenges.ts` holds a set of closed challenge message IDs on the Sapphire
container (the same pattern as `gambaCards`). `tryClose(messageId)` checks and adds in one
synchronous step; every button and the timer go through it, so an Accept racing a Cancel, or two
Accepts on an open challenge, settle at most once. `reopen(messageId)` is used only for the
acceptor-can't-afford path. `flips.message_id` is UNIQUE as a backstop across restarts: a second
insert fails the transaction, and the handler answers "already taken".

## Data model

Migration generated with `pnpm db:generate --name coinflip`.

### `flips`

| Column           | Type    | Notes                                                    |
| ---------------- | ------- | -------------------------------------------------------- |
| `id`             | integer | primary key, autoincrement                               |
| `guild_id`       | text    | not null                                                 |
| `mode`           | text    | `bot`, `challenge`, `open`                               |
| `challenger_id`  | text    | not null                                                 |
| `opponent_id`    | text    | null in bot mode                                         |
| `bet`            | integer | not null, per player                                     |
| `challenger_side`| text    | `heads` / `tails`                                        |
| `result_side`    | text    | `heads` / `tails`                                        |
| `winner_id`      | text    | null when the bot won                                    |
| `rake`           | integer | not null                                                 |
| `message_id`     | text    | unique, null in bot mode                                 |
| `created_at`     | integer | epoch ms                                                 |

Index `flips_guild_created_idx` on `(guild_id, created_at)`.

### `player_stats` additions

`flips`, `flip_wins`, `flip_wagered`, `flip_won`, all `integer not null default 0`.
`flip_wagered` adds `B` per flip; `flip_won` adds the credited `2B − rake` on a win. Net is
`flip_won − flip_wagered`. No new index: the board is ordered by an expression, and the table is
one row per player.

### Ledger

New reasons `flip_bet` and `flip_win` in `ledgerReasons` (TypeScript-only, no SQL change). Both
carry `ref` = the `flips.id`.

### Pot

`addToPot(tx, guildId, amount)` in `src/features/gamba/pot.ts`: inserts the pot at `pot.seed` if
missing, then adds `amount`. Exported from the gamba index.

## Stats and leaderboard

- `PlayerProfile` gains `flips`, `flipWins`, `flipWagered`, `flipWon`. `profileCard` adds the line
  `Coinflips **N** · won **W** · net **±X**`.
- New leaderboard category `coinflip`, label "Coinflip net", value `flip_won − flip_wagered`,
  formatted signed like `profit`. Only positive values qualify, like every board. It shows up in
  the category select automatically.
- Existing gamba boards (`profit`, `spins`, ...) are unchanged and stay gamba-only.

## Code layout

```
src/features/coinflip/
  config.ts        rake percent, expiry per mode
  flip.ts          Side type, flipCoin
  rake.ts          flipRake(bet)
  play.ts          playBotFlip, settleChallenge (transactions)
  stats.ts         recordFlipStats
  custom-ids.ts    encode/decode for cf:again and cf:accept|decline|cancel
  challenges.ts    closed-challenge set and expiry timers
  cards.ts         bot result card, challenge card, closed/result variants, error texts
  index.ts         public surface
src/commands/misc/coinflip.ts                 /coinflip with bot, challenge, open
src/interaction-handlers/coinflip-buttons.ts  all cf:* buttons
```

`parseBet` stays in `src/features/gamba/bet.ts` and is reused as-is (same limits); coinflip imports
it through the gamba index along with `addToPot`, `InvalidBetError` and the bet error text.

Docs: AGENTS.md layout (coinflip feature and handler), README command list and the gamba
section (no free spins, default bet 10).

## Testing

- Example tests: `flipRake` (minimum 1, 3% of the pool), `flipCoin` with an injected RNG,
  `playBotFlip` win and loss (balance, ledger rows and refs, pot delta, stats, flips row),
  `settleChallenge` for targeted and open (both wallets, winner credit, pot, both players' stats),
  challenger can't cover, acceptor can't cover, UNIQUE `message_id` rejects a second settle.
- Gamba: no bet plays 10; balance below 10 errors; `bet: 0` spin IDs no longer decode; free-spin
  tests removed or converted.
- Command and handler tests through `createClient` with stubbed interactions: each subcommand,
  self-challenge and bot-opponent rejection, wrong-user clicks, Decline, Cancel, expired Accept,
  two Accepts on one open challenge settle once.
- Stats: profile line, `coinflip` board ordering and rank.
- fast-check: `cf:*` decode never throws on arbitrary strings and round-trips valid IDs; rake
  invariant `1 ≤ rake ≤ B` and winner credit + rake = pool for all valid bets.
- `test/fuzz-economy.test.ts`: drop the `free` op, add `flipBot` and `flipChallenge` ops (random
  bets, sides, RNG, either player short of funds) and keep the ledger-consistency and
  non-negative-balance invariants.

## Out of scope

- Prefix `?coinflip`.
- Double button or streaks for coinflip.
- Persisting open challenges across restarts (they simply become unacceptable after expiry).
- Moving `gamba.ts` out of `commands/misc/`.
