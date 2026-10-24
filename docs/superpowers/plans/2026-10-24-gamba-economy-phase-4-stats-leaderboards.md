# Gamba Economy Phase 4 (Stats and Leaderboards) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/stats [user]` (a player profile card) and `/leaderboard [category]` (top 10 with a
category select and Previous/Next paging that edit the card in place).

**Architecture:** A new `src/features/stats/` holds read-only queries over `wallets` and
`player_stats` (profile, leaderboard page, caller rank), the `lb:*` custom IDs and the cards.
`commands/stats/stats.ts`, `commands/stats/leaderboard.ts` and
`interaction-handlers/leaderboard-components.ts` stay thin: read options or the custom ID, query,
render, reply or update.

**Tech Stack:** TypeScript (NodeNext ESM), Sapphire 5.5 / discord.js 14.27 (Components V2
`ContainerBuilder`, `SectionBuilder`, `ThumbnailBuilder`, `StringSelectMenuBuilder`,
`InteractionHandler`), better-sqlite3 + drizzle-orm 0.45, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-10-24-gamba-economy-design.md` (sections "Data model"
(`player_stats` definitions), "Cards and commands", "Buttons and selects", "Errors", "Architecture",
"Testing", "Delivery" item 4)

## Global Constraints

- Branch `feat/stats-leaderboard`. One PR. The spec update and this plan are committed first as
  `docs: settle stats and leaderboard decisions in the economy spec` and
  `docs: add gamba economy phase 4 plan`.
- Every commit: Conventional Commits, and `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
  (the "full check") passes. End each commit message with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Relative imports use `.js`; type-only imports use `import type`. Log via `container.logger`.
- Read only: nothing in this phase writes `ledger`, `spins`, `player_stats` or `pots`. The one
  write is `/stats` on yourself calling `getOrCreateWallet`, as `/balance` does.
- No schema change. `pnpm db:generate` must leave `drizzle/` unchanged.
- Categories, in this order: `coins`, `biggest-win`, `jackpots`, `profit`, `spins`. Labels:
  `Coins`, `Biggest win`, `Jackpots`, `Profit`, `Spins`. Value sources: `wallets.balance`,
  `player_stats.biggest_win`, `.jackpots`, `.won - .wagered`, `.spins`.
- Only values above 0 are listed or ranked. Ties: numeric user ID ascending
  (`cast(user_id as integer)`), as in `coinsRank` (`src/features/economy/wallets.ts`).
- Page size 10, pages counted from 0 in IDs and code, shown from 1 on the card.
- Custom IDs: `lb:page:<ownerId>:<category>:<page>` and `lb:cat:<ownerId>`. Only the owner may use
  them; anyone else gets an ephemeral `notYourLeaderboard`.
- Cards never ping (the client default `parse: []` covers mentions in cards).
- Slash command and component errors are ephemeral (`errorReply`).

## Review Focus

1. Ties between snowflakes of different lengths (`'9'` vs `'10'`, equal value): `'9'` ranks first,
   on the board and in the caller's rank, and the coins rank matches `/balance`. Task 1.
2. A stale Next button whose page no longer exists (the board shrank, or a hand-made
   `lb:page:1:coins:999`): the card updates to the last page; an empty board shows page 1 with
   "Nobody is on this board yet." Tasks 1 and 6.
3. Someone other than the owner clicks a page button or picks a category: ephemeral
   `notYourLeaderboard`, card not updated. Task 6.
4. Tampered or foreign IDs (`lb:page:1:gold:0`, `lb:page:1:coins:-1`, `lb:page:abc:coins:0`,
   `lb:cat:1:x`, a select value that is not a category, `gamba:again:1:0` reaching this handler)
   are ignored: no reply, no update. Tasks 3 and 6.
5. A profile with a wallet but no spins (`player_stats` row missing): zeros, win rate and best odds
   `—` (no `NaN%`), net profit `0`. Tasks 2 and 3.

---

## File Structure

| File                                                          | Responsibility                                                    |
| ------------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/features/stats/config.ts` (create)                       | Categories, labels, page size                                     |
| `src/features/stats/leaderboard.ts` (create)                  | `leaderboardPage`, `leaderboardRank`                              |
| `src/features/stats/profile.ts` (create)                      | `playerProfile`                                                   |
| `src/features/stats/custom-ids.ts` (create)                   | Encode/decode `lb:*` IDs                                          |
| `src/features/stats/cards.ts` (create)                        | `profileCard`, `leaderboardCard`, `notYourLeaderboard`            |
| `src/features/stats/index.ts` (create)                        | Public surface                                                    |
| `src/commands/stats/stats.ts` (create)                        | `/stats [user]`                                                   |
| `src/commands/stats/leaderboard.ts` (create)                  | `/leaderboard [category]`                                         |
| `src/interaction-handlers/leaderboard-components.ts` (create) | Page buttons and category select                                  |
| `test/support/interaction.ts` (modify)                        | `makeUser` avatar URL; `makeSelect`                               |
| `README.md`, `AGENTS.md` (modify)                             | `/stats`, `/leaderboard`, `features/stats/` and `commands/stats/` |

---

### Task 1: Leaderboard queries

**Files:**
- Create: `src/features/stats/config.ts`, `src/features/stats/leaderboard.ts`,
  `src/features/stats/index.ts`
- Test: `test/stats-leaderboard.test.ts`

**Interfaces:**
- Consumes: `wallets`, `playerStats` from `src/db/schema.ts`; `DbOrTx` from `src/db/index.ts`.
- Produces (in `config.ts`):
  - `leaderboardCategories = ['coins', 'biggest-win', 'jackpots', 'profit', 'spins'] as const`,
    `type LeaderboardCategory = (typeof leaderboardCategories)[number]`
  - `categoryLabels: Record<LeaderboardCategory, string>` (labels from Global Constraints)
  - `isLeaderboardCategory(value: string): value is LeaderboardCategory`
  - `leaderboardPageSize = 10`
- Produces (in `leaderboard.ts`):
  - `interface BoardRow { userId: string; value: number; rank: number }`
  - `interface LeaderboardPage { rows: BoardRow[]; page: number; pageCount: number }`
  - `leaderboardPage(db: DbOrTx, guildId: string, category: LeaderboardCategory, page: number):
    LeaderboardPage`. Counts the qualifying rows, `pageCount = max(1, ceil(count / 10))`, clamps
    `page` to `0..pageCount - 1`, then selects with `ORDER BY value DESC, cast(user_id as integer)
    ASC LIMIT 10 OFFSET page * 10`. `rank = page * 10 + index + 1`.
  - `leaderboardRank(db: DbOrTx, guildId: string, category: LeaderboardCategory, userId: string):
    { rank: number; value: number } | undefined`. Undefined when the user has no row or a value
    of 0 or less; otherwise rank = 1 + rows with a higher value, or an equal value and a smaller
    numeric user ID (the `coinsRank` rule, restricted to values above 0).
  - Both share one private helper mapping a category to `{ table, userId column, value SQL }`, so
    the value expression for `profit` is written once.

- [ ] **Step 1: Write `test/stats-leaderboard.test.ts`** with `openDatabase(':memory:')`, inserting
  `wallets` and `player_stats` rows directly (guild `'2'`, plus one row in guild `'other'` that
  must never appear):
  - `coins` with balances `'1'`: 500, `'2'`: 900, `'3'`: 0 → rows `[{ userId: '2', value: 900,
    rank: 1 }, { userId: '1', value: 500, rank: 2 }]`, `pageCount` 1; `leaderboardRank` of `'3'`
    is undefined.
  - Ties: `'10'` and `'9'` both 700 → `'9'` rank 1, `'10'` rank 2 in the page and in
    `leaderboardRank`; and `leaderboardRank(db, '2', 'coins', '10')?.rank` equals
    `coinsRank(db, '2', '10')`.
  - `profit`: `'1'` won 300 wagered 100 (200), `'2'` won 50 wagered 400 (-350), `'3'` won 0
    wagered 0 → rows `[{ userId: '1', value: 200, rank: 1 }]`; rank of `'2'` undefined.
  - `biggest-win`, `jackpots`, `spins` each read their column (one row each is enough).
  - Paging: 25 `spins` rows with values 25..1 → page 1 has 10 rows, first `{ value: 15, rank: 11 }`;
    page 2 has 5 rows; `pageCount` 3; page 7 is clamped to page 2; page 0 of an empty board is
    `{ rows: [], page: 0, pageCount: 1 }`.
  - `isLeaderboardCategory('profit')` true, `('gold')` false.
- [ ] **Step 2: Run** `pnpm vitest run test/stats-leaderboard.test.ts`. Expected: FAIL (module not
  found).
- [ ] **Step 3: Implement** `config.ts`, `leaderboard.ts`, and `index.ts` re-exporting both.
- [ ] **Step 4: Run** the full check. Expected: PASS.
- [ ] **Step 5: Commit** `feat(stats): add leaderboard queries`

---

### Task 2: Player profile query

**Files:**
- Create: `src/features/stats/profile.ts`
- Modify: `src/features/stats/index.ts` (export)
- Test: `test/stats-profile.test.ts`

**Interfaces:**
- Consumes: `findWallet`, `coinsRank`, `utcDay` from `src/features/economy/index.ts`;
  `playerStats`.
- Produces:
  - `interface PlayerProfile { balance: number; rank: number; dailyStreak: number; spins: number;
    wins: number; jackpots: number; wagered: number; won: number; biggestWin: number;
    bestOdds: number }`
  - `playerProfile(db: DbOrTx, guildId: string, userId: string, now: number): PlayerProfile |
    undefined`. Undefined when there is no wallet. Missing `player_stats` row → stat fields 0.
    `dailyStreak` is the stored streak when `lastDailyAt` is today or yesterday
    (`utcDay(now) - utcDay(lastDailyAt) <= 1`), else 0.

- [ ] **Step 1: Write `test/stats-profile.test.ts`:**
  - No wallet → undefined.
  - `getOrCreateWallet` only → `{ balance: 1000, rank: 1, dailyStreak: 0, spins: 0, wins: 0,
    jackpots: 0, wagered: 0, won: 0, biggestWin: 0, bestOdds: 0 }`.
  - After `playFree` with a head x3 draw and a `playWager` loss (inject `rng`/draws as
    `test/gamba-play.test.ts` does): `spins` 2, `wins` 1, `biggestWin` 50, `bestOdds` 343,
    `wagered` equal to the bet, `won` 0, and `balance`/`rank` match `findWallet`/`coinsRank`.
  - Streak: after `claimDaily` at day D, profile at D and at D+1 has `dailyStreak` 1; at D+2 it
    has 0.
- [ ] **Step 2: Run** `pnpm vitest run test/stats-profile.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `profile.ts` and export it.
- [ ] **Step 4: Run** the full check. Expected: PASS.
- [ ] **Step 5: Commit** `feat(stats): add player profile query`

---

### Task 3: Custom IDs and cards

**Files:**
- Create: `src/features/stats/custom-ids.ts`, `src/features/stats/cards.ts`
- Modify: `src/features/stats/index.ts` (export)
- Test: `test/stats-custom-ids.test.ts`, `test/stats-cards.test.ts`

**Interfaces:**
- Consumes: Task 1 config and `LeaderboardPage`; Task 2 `PlayerProfile`; `accents`, `card`,
  `coins` from `src/features/ui/index.ts`.
- Produces (in `custom-ids.ts`):
  - `type LeaderboardId = { kind: 'page'; ownerId: string; category: LeaderboardCategory;
    page: number } | { kind: 'cat'; ownerId: string }`
  - `encodePageId(ownerId: string, category: LeaderboardCategory, page: number): string`,
    `encodeCategoryId(ownerId: string): string`
  - `decodeLeaderboardId(customId: string): LeaderboardId | undefined`. Owner must match
    `^\d{1,20}$`, page `^\d{1,6}$`, category `isLeaderboardCategory`; exact part counts (5 for
    `page`, 3 for `cat`).
- Produces (in `cards.ts`):
  - `notYourLeaderboard = "This isn't your leaderboard. Use \`/leaderboard\` to get your own."`
  - `profileCard(userId: string, avatarUrl: string, profile: PlayerProfile | undefined):
    ContainerBuilder`. Undefined → `card(accents.brand, '## Stats', '<@id> hasn\'t played
    yet.')`. Otherwise a brand container: a `SectionBuilder` with texts `## Stats` and
    `<@id> · **12,345** coins · rank #3` and a `ThumbnailBuilder` of `avatarUrl`, then text
    displays:
    - `Spins **120** · win rate **35.0%** · jackpots **1**`
    - `Biggest win **4,500** · best odds **1 in 343**`
    - `Net profit **+1,200** · wagered 10,000 · won 11,200`
    - `-# Daily streak: 3 days` (`1 day` when 1)

    Win rate is `(wins / spins * 100).toFixed(1)`; with 0 spins win rate is `—`; best odds 0 is
    `—`; net profit is `+` for positive, `-` for negative, `0` for zero.
  - `leaderboardCard(view: { ownerId: string; category: LeaderboardCategory;
    board: LeaderboardPage; caller: { rank: number; value: number } | undefined }):
    ContainerBuilder`. Brand container with:
    - `## Leaderboard · <label>`
    - the rows joined by `\n` in one text display: `🥇`/`🥈`/`🥉` for ranks 1 to 3, else `**N.**`,
      then ` <@id> · **value**`; value is `coins(value)`, with a leading `+` for `profit`. An
      empty board shows `Nobody is on this board yet.`
    - `-# Your rank: #12 · 1,000` or `-# You're not on this board yet`, followed by
      ` · Page 2 of 3` when `pageCount > 1`
    - an action row with a `StringSelectMenuBuilder` (`encodeCategoryId(ownerId)`, one option per
      category, value = category, label = its label, the current one `setDefault(true)`)
    - when `pageCount > 1`, an action row with Secondary buttons `Previous`
      (`encodePageId(owner, category, max(0, page - 1))`, disabled on page 0) and `Next`
      (`min(pageCount - 1, page + 1)`, disabled on the last page). These two IDs always differ
      because `pageCount > 1`.

- [ ] **Step 1: Write `test/stats-custom-ids.test.ts`:** round trips for both kinds;
  `decodeLeaderboardId` returns undefined for `lb:page:1:gold:0`, `lb:page:1:coins:-1`,
  `lb:page:1:coins:1.5`, `lb:page:1:coins:1234567`, `lb:page:abc:coins:0`, `lb:page:1:coins`,
  `lb:cat:1:x`, `lb:cat:`, `gamba:again:1:0`, `''`.
- [ ] **Step 2: Write `test/stats-cards.test.ts`** asserting on `JSON.stringify(card.toJSON())`:
  - `profileCard('1', 'https://cdn/a.png', undefined)` contains `<@1> hasn't played yet.`
  - A full profile (balance 12,345, rank 3, spins 120, wins 42, jackpots 1, wagered 10,000, won
    11,200, biggestWin 4,500, bestOdds 343, dailyStreak 3) contains each line above exactly and
    the thumbnail URL.
  - A profile with 0 spins contains `win rate **—**`, `best odds **—**`, `Net profit **0**`, and
    not `NaN`; a negative profit renders `**-350**`; streak 1 renders `1 day`.
  - Leaderboard, 3 rows on a 1-page `coins` board, caller rank 2: contains `## Leaderboard ·
    Coins`, `🥇 <@2> · **900**`, `-# Your rank: #2 · 500`, the select with five options and
    `coins` as default, no `Previous` button.
  - Page 1 of 3 of `profit` (ranks 11 to 20): contains `**11.**`, a value with a leading `+`,
    `Page 2 of 3`, `lb:page:1:profit:0` and `lb:page:1:profit:2`, neither button disabled. Page 0
    of 2: `Previous` disabled. Last page: `Next` disabled.
  - Empty board with no caller rank: `Nobody is on this board yet.` and
    `You're not on this board yet`.
- [ ] **Step 3: Run** `pnpm vitest run test/stats-custom-ids.test.ts test/stats-cards.test.ts`.
  Expected: FAIL.
- [ ] **Step 4: Implement** both files and export them.
- [ ] **Step 5: Run** the full check. Expected: PASS.
- [ ] **Step 6: Commit** `feat(stats): add leaderboard ids and stats cards`

---

### Task 4: `/stats`

**Files:**
- Create: `src/commands/stats/stats.ts`
- Modify: `test/support/interaction.ts`
- Test: `test/stats-command.test.ts`

**Interfaces:**
- Consumes: Task 2 `playerProfile`, Task 3 `profileCard`; `getOrCreateWallet`,
  `botsHaveNoWallets` from economy; `cardReply`, `errorReply` from ui.
- Produces: `makeUser(id, bot?)` also returns `displayAvatarURL: () =>
  \`https://cdn.example/${id}.png\``.

Same shape as `src/commands/economy/balance.ts`: guild-only context, optional `user` option
("Whose stats to show (default: you)"). Bot target → `errorReply(botsHaveNoWallets)`. For
yourself call `getOrCreateWallet(db, guildId, id, now)` first, then
`playerProfile(db, guildId, target.id, now)`, then reply
`cardReply(profileCard(target.id, target.displayAvatarURL(), profile))`.
- [ ] **Step 1: Write `test/stats-command.test.ts`** (shared client, `:memory:` db per test, as in
  `test/balance-command.test.ts`):
  - Caller `'1'` with no wallet: reply contains `<@1> · **1,000** coins · rank #1` and
    `https://cdn.example/1.png`; wallet `'1'` now exists.
  - `user: makeUser('5')` without a wallet: reply contains `<@5> hasn't played yet.`; no wallet
    for `'5'` is created.
  - `user: makeUser('6', true)`: ephemeral reply with `Bots don't have wallets.`
- [ ] **Step 2: Run** `pnpm vitest run test/stats-command.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the command and the `makeUser` change.
- [ ] **Step 4: Run** the full check. Expected: PASS.
- [ ] **Step 5: Commit** `feat(stats): add /stats with a profile card`

---

### Task 5: `/leaderboard`

**Files:**
- Create: `src/commands/stats/leaderboard.ts`
- Test: `test/leaderboard-command.test.ts`

**Interfaces:**
- Consumes: Task 1 `leaderboardPage`, `leaderboardRank`, `leaderboardCategories`,
  `categoryLabels`; Task 3 `leaderboardCard`.
- Produces: `renderLeaderboard(db: DbOrTx, guildId: string, ownerId: string,
  category: LeaderboardCategory, page: number): ContainerBuilder` in
  `src/features/stats/cards.ts`, exported from the index: queries the page and the owner's rank
  and builds the card. Task 6 reuses it.

Guild-only context, optional string option `category` ("Which board to show (default: coins)")
with one choice per category (`name` = label, `value` = category). Reply
`cardReply(renderLeaderboard(db, guildId, interaction.user.id, category ?? 'coins', 0))`. Never
creates a wallet.
- [ ] **Step 1: Write `test/leaderboard-command.test.ts`:**
  - Wallets `'1'` 500 and `'2'` 900, caller `'1'`, no option: reply contains `Leaderboard ·
    Coins`, `🥇 <@2> · **900**`, `-# Your rank: #2 · 500`, and `lb:cat:1`.
  - `category: 'spins'` with an empty board, caller `'7'`: `Nobody is on this board yet.`; no
    wallet for `'7'`.
- [ ] **Step 2: Run** `pnpm vitest run test/leaderboard-command.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `renderLeaderboard` and the command.
- [ ] **Step 4: Run** the full check. Expected: PASS.
- [ ] **Step 5: Commit** `feat(stats): add /leaderboard`

---

### Task 6: Leaderboard paging and category select

**Files:**
- Create: `src/interaction-handlers/leaderboard-components.ts`
- Modify: `test/support/interaction.ts`
- Test: `test/leaderboard-components.test.ts`

**Interfaces:**
- Consumes: Task 3 `decodeLeaderboardId`, `notYourLeaderboard`, `isLeaderboardCategory`;
  Task 5 `renderLeaderboard`.
- Produces: `makeSelect(client, { customId, userId, values, guildId? })` in
  `test/support/interaction.ts`: like `makeButton`, but `isButton: () => false`,
  `isStringSelectMenu: () => true`, `isAnySelectMenu: () => true` and a `values` array.

One handler with `interactionHandlerType: InteractionHandlerTypes.MessageComponent`. `parse`:
decode the ID; a `page` ID must come from a button (`interaction.isButton()`); a `cat` ID must come
from a string select whose `values[0]` passes `isLeaderboardCategory`; otherwise `this.none()`.
Parse yields `{ ownerId, category, page }` (page 0 for a select). `run`: a different user →
`interaction.reply(errorReply(notYourLeaderboard))`; else
`interaction.update(cardReply(renderLeaderboard(db, guildId, ownerId, category, page)))`.
- [ ] **Step 1: Write `test/leaderboard-components.test.ts`** (25 `player_stats` rows with spins
  25..1, users `'101'`..`'125'`, owner `'1'`):
  - Owner clicks `lb:page:1:spins:1`: `update` contains `**11.**` and `Page 2 of 3`.
  - Owner clicks `lb:page:1:spins:9`: `update` contains `Page 3 of 3` (clamped).
  - Owner selects `profit` on `lb:cat:1` with an empty profit board: `update` contains
    `Leaderboard · Profit` and `Nobody is on this board yet.`
  - User `'5'` clicks `lb:page:1:spins:1`: ephemeral reply with `notYourLeaderboard`; `update` not
    called.
  - Ignored after 100 ms (neither `reply` nor `update` called): button `lb:page:1:gold:0`, button
    `lb:cat:1`, select `lb:cat:1` with value `gold`, button `lb:page:abc:spins:0`.
- [ ] **Step 2: Run** `pnpm vitest run test/leaderboard-components.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the handler and `makeSelect`. Sapphire loads
  `src/interaction-handlers/` automatically; do not register it by hand. Check that
  `test/gamba-buttons.test.ts` still passes: the gamba handler must keep ignoring `lb:*` IDs and
  this one must ignore `gamba:*` IDs.
- [ ] **Step 4: Run** the full check. Expected: PASS.
- [ ] **Step 5: Commit** `feat(stats): page and switch leaderboard categories in place`

---

### Task 7: Documentation

**Files:**
- Modify: `README.md`, `AGENTS.md`

- [ ] **Step 1: README:** add `/stats [user]` and `/leaderboard [category]` to the command list,
  with the five categories and a line saying only the caller can use the leaderboard's select and
  buttons.
- [ ] **Step 2: AGENTS.md:** in Layout add `commands/stats/` (`/stats`, `/leaderboard`) and
  `features/stats/` (read-only profile and leaderboard queries, `lb:*` custom IDs, cards); extend
  the `interaction-handlers/` line to cover the leaderboard components.
- [ ] **Step 3: Run** `pnpm lint`. Expected: PASS.
- [ ] **Step 4: Commit** `docs: document /stats and /leaderboard`
