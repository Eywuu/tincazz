# Gamba economy design

Date: 2026-10-24
Status: approved in conversation, pending written-spec review
Supersedes the "Out of scope (v1)" list of `2026-10-24-gamba-design.md`.

## Goal

Turn `?gamba` from a stateless slot machine into a small casino economy for the cazzwastaken
server: coins, wagers with a progressive jackpot, coin income, stats and leaderboards, presented
with modern Discord UI (Components V2 cards and buttons). The core game stays: same three reels,
same emojis, same odds, free `?gamba` forever, jackpot role on cpp x3.

It also adds the bot's first persistent storage, which later features will reuse.

## Decisions

| Topic       | Decision                                                                               |
| ----------- | -------------------------------------------------------------------------------------- |
| Game model  | Full economy with wagers                                                               |
| Free play   | `?gamba` with no bet is always free and unlimited; any triple pays fixed coins         |
| Payouts     | Pairs and triples pay on wagers; progressive pot won by a wagered cpp x3               |
| Coin income | Starting balance, `/daily` with streak, broke bailout, chat activity, admin grants     |
| Anti-farm   | None on free spins (as today); chat rewards are rate capped                            |
| Transfers   | None. Coins never move between players                                                 |
| Storage     | SQLite file on a Docker volume, `better-sqlite3`, Drizzle ORM + drizzle-kit migrations |
| UI          | Components V2 cards, buttons inside the card, ephemeral errors                         |
| Scope       | Single guild in practice; every table keyed by `guild_id` anyway                       |

## Game rules

All numbers below are constants in the feature folders. Changing them is a reviewed code change.

### Outcomes

Unchanged odds, per reel (weights of 21): each of the six yt emojis 3 (1/7), python 2, cpp 1.
Each outcome gets a stable `key` (`head`, `cry`, `grr`, `nails`, `raa`, `spooked`, `python`, `cpp`);
the emoji string is display only. Storage always uses keys.

Result probabilities (out of 9,261 equally likely weighted combinations):

| Result      | Combos | Chance |
| ----------- | ------ | ------ |
| Any yt pair | 2,916  | 31.49% |
| python pair | 228    | 2.46%  |
| cpp pair    | 60     | 0.65%  |
| Any yt x3   | 162    | 1.75%  |
| python x3   | 8      | 0.086% |
| cpp x3      | 1      | 0.011% |
| Nothing     | 5,886  | 63.56% |

A "pair" is exactly two equal reels; the odd reel is ignored.

### Free spin

`?gamba` / `/gamba` with no bet. Pairs pay nothing.

| Result    | Prize                      |
| --------- | -------------------------- |
| Any yt x3 | 50                         |
| python x3 | 500                        |
| cpp x3    | 2,500 and the jackpot role |

Expected value is about 1.6 coins per spin. Free spins never touch the pot.

### Wagered spin

`?gamba <bet>` / `/gamba bet:<bet>`.
- Bet range 10 to 10,000. Accepted forms: a positive integer, `all` (`min(balance, 10,000)`),
  `half` (`floor(balance / 2)`, then range checked), and a `k` suffix (`2.5k` = 2,500; the result
  must be an integer).
- The bet is debited first. Payout is `floor(bet * multiplierBps / 10,000)` and includes the stake.
- Multipliers are stored as integer basis points so the RTP test is exact.

| Result      | Multiplier                      | Bps       |
| ----------- | ------------------------------- | --------- |
| Any yt pair | 1.2x                            | 12,000    |
| python pair | 4x                              | 40,000    |
| cpp pair    | 10x                             | 100,000   |
| Any yt x3   | 15x                             | 150,000   |
| python x3   | 100x                            | 1,000,000 |
| cpp x3      | 300x + pot share + jackpot role | 3,000,000 |

Table RTP before flooring is exactly 8,541.2 / 9,261 = 92.23%. The pot adds about 3% over time.

### Progressive pot

One pot per guild.
- Every wagered spin adds `max(1, floor(bet * 3 / 100))` to the pot. This is not taken from the
  player's payout; it is part of the coins already removed by the bet.
- The pot starts at 10,000.
- A wagered cpp x3 wins `floor(pot * min(1, bet / 500))`. Bets of 500 or more take the whole pot.
  This stops min-bet spam from being profitable when the pot is large.
- After a win the pot becomes `max(10,000, pot - won)`. Topping up to the seed mints coins.
- The pot win is credited separately (ledger reason `pot_win`), and the pot's last winner and time
  are stored.

### Coin income

| Source     | Rule                                                                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start      | New wallets start with 1,000 (ledger `start`)                                                                                                                                      |
| `/daily`   | `200 + 50 * min(streak, 7)` (250 on day 1, 550 from day 7). One claim per UTC calendar day. Claiming the day after the previous claim continues the streak; any gap resets it to 1 |
| `/bailout` | Only when balance < 10 (the minimum bet): +200, at most once per hour                                                                                                              |
| Chat       | +5 per guild message, at most once per 60 s per user. Ignored: bots, webhooks, system messages, DMs, messages starting with the command prefix                                     |
| Admin      | `/eco give` and `/eco take` with a required reason. `take` fails, rather than clamping, if it exceeds the balance                                                                  |

No transfers between players.

## Data model

SQLite via `better-sqlite3`, schema in Drizzle. WAL mode and foreign keys on. All coin amounts are
integers. Timestamps are integer milliseconds since the epoch (UTC).

| Table          | Primary key          | Columns                                                                                                                                                                      |
| -------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wallets`      | `guild_id, user_id`  | `balance` (CHECK >= 0), `daily_streak`, `last_daily_at`, `last_bailout_at`, `last_chat_reward_at`, `created_at`                                                              |
| `ledger`       | `id` (autoincrement) | `guild_id`, `user_id`, `delta`, `balance_after`, `reason`, `ref`, `actor_id`, `created_at`                                                                                   |
| `spins`        | `id` (autoincrement) | `guild_id`, `user_id`, `mode` (`free`/`wager`), `reels` (three keys, comma separated), `result` (`none`/`pair`/`triple`/`jackpot`), `bet`, `payout`, `pot_won`, `created_at` |
| `player_stats` | `guild_id, user_id`  | `spins`, `wins`, `jackpots`, `wagered`, `won`, `biggest_win`, `best_odds`                                                                                                    |
| `pots`         | `guild_id`           | `amount`, `last_winner_id`, `last_won_at`                                                                                                                                    |
- Ledger `reason`: `start`, `daily`, `bailout`, `chat`, `free_prize`, `bet`, `payout`, `pot_win`,
  `admin_grant`, `admin_take`. `ref` is the spin ID for spin rows; `actor_id` is the moderator for
  admin rows. The ledger is append-only.
- `player_stats` definitions:
  - `spins`: all spins, free and wagered.
  - `wins`: spins with a payout or prize greater than 0.
  - `jackpots`: cpp x3 spins, free or wagered.
  - `wagered` / `won`: sums of bets and of payouts plus pot wins, wagered spins only. Net profit
    is `won - wagered`.
  - `biggest_win`: the largest single-spin payout plus pot win, or prize for free spins.
  - `best_odds`: the largest N in "1 in N" among triples hit.
- Indexes: `ledger (guild_id, user_id, id)`, `spins (guild_id, user_id)`, and one per leaderboard
  sort column on `player_stats` / `wallets` (guild_id first).
- Invariant: for every wallet, `balance` equals the sum of its ledger `delta`s.

## Economy API

`src/features/economy/` is the only code that changes balances. Every operation is synchronous and
runs inside one `db.transaction(...)`. A throw anywhere rolls the whole operation back.
- `getOrCreateWallet(db, guildId, userId, now)`: creates the wallet with the starting balance.
- `credit(tx, ...)` / `debit(tx, ...)`: update the balance and append a ledger row. `debit` throws
  `InsufficientFundsError` (carrying the balance) instead of going negative.
- `claimDaily`, `claimBailout`, `rewardChat`, `adminAdjust`: each returns a result object
  (amount, new balance, streak or next available time) or throws a typed error
  (`AlreadyClaimedError` with the next reset time, `NotEligibleError`, `CooldownError`).
- Time comes from an injected `now: number` so tests control the clock.

`src/features/gamba/` builds on it:
- `parseBet(input, balance)`: returns a bet or a typed error.
- `evaluate(reels)`: returns `{ result, payoutBps, freePrize, odds }`; pure.
- `playFree(db, guildId, userId, rng, now)` and `playWager(db, guildId, userId, bet, rng, now)`:
  roll, record the spin, settle coins, update stats and the pot in one transaction. Return
  everything a card needs (reels, payout, profit, balance, pot, jackpot flag).
- The jackpot role is assigned after the transaction commits, exactly as today.

## UI

Every response is a Components V2 message (`MessageFlags.IsComponentsV2`) built by pure functions
in `cards.ts` files, so they can be tested through `toJSON()`.

### Style

- Accent colours: grey for a loss, green for a win, gold for a jackpot or pot win, red for errors,
  and one brand colour for info cards.
- Reels are a markdown heading (`# a b c`) so custom emojis render large.
- Odds, balance and pot go in subtext (`-# ...`).
- Times use Discord timestamps (`<t:unix:R>`).
- Users are shown as mentions. The client default (`parse: []`) keeps them from pinging unless a
  message opts in.

### Cards and commands

| Command                              | Card                                                                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `?gamba`, `/gamba`                   | Free spin: reels, prize on a win, balance. Button: Spin again                                                                     |
| `?gamba <bet>`, `/gamba bet:<bet>`   | Wager: reels, bet -> payout and profit, result name and multiplier, balance, pot. Buttons: Spin again, Double                     |
| `/balance [user]`                    | Balance and coins rank                                                                                                            |
| `/daily`                             | Amount, streak, next reset countdown                                                                                              |
| `/bailout`                           | Amount, or when it is next available                                                                                              |
| `/stats [user]`                      | Profile section with avatar thumbnail: balance, rank, spins, win rate, biggest win, jackpots, best odds, daily streak, net profit |
| `/leaderboard [category]`            | Top 10 for the category with medals for 1 to 3, the caller's own rank on the last line. Category select and previous/next buttons |
| `/eco give\|take user amount reason` | Ephemeral confirmation. `default_member_permissions` = Manage Server                                                              |

Leaderboard categories: `coins` (wallet balance), `biggest-win`, `jackpots`, `profit`, `spins`.
Rows with a value of 0 are left out. Ties are ordered by user ID.

### Buttons and selects

State lives in the custom ID, so components survive bot restarts:
- `gamba:again:<userId>:<bet>` (bet 0 = free) and `gamba:double:<userId>:<bet>`. They edit the
  card in place (`interaction.update`), so repeated spins do not flood the channel.
- `lb:page:<ownerId>:<category>:<page>` and `lb:cat:<ownerId>`. They edit the leaderboard in place.
- Only the user in the ID may use the component. Anyone else gets an ephemeral "use `/gamba` (or
  `/leaderboard`) to get your own".

### Announcements

Any triple, free or wagered, also posts a separate gold card replying to the result card. It
mentions the winner with `allowedMentions: { users: [winnerId] }`, the prize, the odds, the role
for cpp x3, the pot win if any, and the win gif for python and cpp. The win stays visible even
after the result card is re-spun.

### Errors

- Slash commands and components reply ephemerally with the reason and a hint, for example
  "You have 40 coins. `/bailout` is available."
- Prefix commands cannot reply ephemerally, so they reply normally with the same red card.
- `?gamba <text>` where the text is not a valid bet replies with an invalid-bet error. Today the
  text is ignored and a free spin runs; that behaviour changes.

## Architecture

```
src/
  db/
    index.ts        openDatabase(path): better-sqlite3, WAL, foreign keys, run migrations
    schema.ts       Drizzle tables
  features/
    economy/        wallets, ledger, daily, bailout, chat, admin, errors, config
    gamba/          outcomes, roll, payouts, pot, bet parsing, play, cards, config
    leaderboard/    queries, cards
  commands/
    misc/gamba.ts   messageRun + chatInputRun (thin)
    economy/        balance, daily, bailout, eco
    stats/          stats, leaderboard
  interaction-handlers/
    gamba-buttons.ts, leaderboard-components.ts
  listeners/
    chat-reward.ts  messageCreate -> rewardChat
    command-errors.ts  chatInput/interaction errors -> ephemeral generic error + log
drizzle/            generated SQL migrations, committed, copied into the image
```

- `index.ts` opens the database before login and exposes it as `container.db` (Sapphire container
  augmentation), and closes it on shutdown. Tests set `container.db` to a `:memory:` database.
- Commands, handlers and listeners stay thin: parse input, call a feature function, render a card.
- New env vars, added to the zod schema and `.env.example` together:
  - `DATABASE_PATH`, default `./data/tincazz.db`.
  - `GUILD_ID`, optional. When set, application commands register to that guild, so updates are
    instant. When unset, they register globally. The server ID stays out of the repository.
- Gateway intents are unchanged. Chat rewards use the existing `GuildMessages` and `MessageContent`
  intents.

### Deployment

- Compose gets a named volume `tincazz-data:/app/data`. The container stays `read_only`, and only
  the volume is writable.
- The Dockerfile creates `/app/data` owned by `node`, and copies `drizzle/` into the runtime image.
- `better-sqlite3` is a native module. `pnpm-workspace.yaml` allows its build, and the build stages
  install a toolchain (`python3`, `make`, `g++`) as a fallback when no musl prebuild matches. The
  pull request Docker build in CI verifies this.
- `drizzle-kit` is a dev dependency with a `pnpm db:generate` script.
- README and AGENTS.md document the volume, backups (`sqlite3 /app/data/tincazz.db ".backup ..."`
  works while the bot runs), the env vars, and the Manage Roles requirement, which is unchanged.

## Error handling

- Invalid input (bet, amount) is rejected before any transaction.
- An error inside a transaction rolls back completely: no half-applied bet, prize or pot change.
- If the database commits but the Discord reply fails, the result stands and is logged. The player
  can see it in `/balance` and `/stats`.
- Role assignment failures behave as today: log a warning, show "(couldn't assign the role, tell a
  mod)".
- If migrations fail or the database cannot be opened, the bot exits with a fatal log before
  logging in.
- Unexpected command errors are logged with `container.logger` and answered with an ephemeral
  generic error. Tokens and environment values are never logged.

## Testing

Vitest, no network, `:memory:` databases.
- Payout table: enumerate all 21^3 weighted draws and assert the exact table RTP
  (85,412,000 bps-units over 9,261 x 10,000) and each result's combo count.
- Outcomes: the existing distribution and roller tests stay. Outcome keys are unique.
- Economy:
  - The balance equals the sum of ledger deltas after a random sequence of operations.
  - Insufficient funds leaves every table unchanged.
  - Daily: day 1, consecutive days, a gap, the cap at day 7, a second claim on the same UTC day,
    and claims around UTC midnight.
  - Bailout: eligibility and the one-hour cooldown.
  - Chat reward: the 60 s cap and the ignored message kinds.
  - Admin: grant and take, a failing take, and `actor_id` recorded.
- Pot: contribution floor and minimum, a full win at bet >= 500, a proportional win below, and
  the reset to the seed.
- Bet parsing: integers, `all`, `half`, `k` suffix, below the minimum, above the maximum, above the
  balance, non-integers, junk.
- Stats: each `player_stats` field after scripted spins. Leaderboard ordering, ties, paging and
  the caller's rank.
- Cards: `toJSON()` assertions for each card kind.
- End to end (stubbed messages and interactions, like `test/gamba-command.test.ts`):
  - free spin;
  - a wager win and a loss;
  - insufficient funds;
  - Spin again by the owner and by someone else;
  - the jackpot role;
  - an invalid bet;
  - the leaderboard paging owner check.
- Migrations apply to a fresh database and the schema matches Drizzle's.
- The `loadMessageCommandListeners` guard test stays.

## Delivery

One branch and pull request per phase. Each phase gets its own implementation plan. Every commit
follows Conventional Commits and leaves `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
passing.
1. **Foundation**: dependencies, `src/db`, schema and first migration, `container.db`, env vars,
   Docker volume and native build, slash command registration (`GUILD_ID`), error listener, docs.
2. **Economy core**: wallets and ledger, `/balance`, `/daily`, `/bailout`, chat rewards, `/eco`,
   outcome keys, free spin prizes recorded in `spins` and `player_stats`. These commands get their
   Components V2 cards in this phase. `?gamba` keeps today's text reply and follow-up, with the
   prize and new balance added to the follow-up.
3. **Gamba v2**: payouts, bet parsing, pot, wagered spins, `/gamba`, gamba Components V2 cards,
   Spin again and Double buttons, announcements.
4. **Stats and leaderboards**: `/stats`, `/leaderboard` with select and paging.

## Open items

- Win gif: the current value is a klipy page URL that only works through link unfurling. Cards
  need a direct `.gif` URL. If none is supplied before phase 3, the gif is dropped from cards.

## Out of scope

Achievements, shop and items, transfers, cooldowns on free spins, spin animations, runtime
configuration of odds or prizes, multi-instance deployment, data export.
