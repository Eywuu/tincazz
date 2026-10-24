# Gamba design

Date: 2026-10-24
Status: approved, pending implementation plan

## Goal

`?gamba` is a three-reel slot machine for the cazzwastaken server. Each reel shows one of eight
custom emojis. Landing cpp on all three reels (a jackpot) awards a role.

It is the bot's first real feature, so it also sets the layout later features follow. Gamba is
expected to grow into an economy (currency, streaks, leaderboards, cooldowns); v1 builds none of
that but must leave room for it without a rewrite.

## Behavior

- Trigger: prefix command `?gamba` (prefix from `COMMAND_PREFIX`). Guild channels only.
- Each of the three reels is rolled independently from the same weighted table:

  | Outcome                 | Weight (of 21) | Per reel |
  | ----------------------- | -------------- | -------- |
  | each of the 6 yt emojis | 3              | 1/7      |
  | python                  | 2              | 2/21     |
  | cpp                     | 1              | 1/21     |

  The six yt emojis together are 18/21.
- Reply (normal):

  ```
  @user GAMBA!
  <reel1> <reel2> <reel3>
  ```

- Jackpot: all three reels are cpp, probability (1/21)^3 = 1/9261. The bot adds role
  `1561827731400822845` to the member, then replies with an extra line:
  `JACKPOT! You won <@&1561827731400822845>`.
- Mentions stay suppressed (the client default): the user and role render as mentions but nobody
  is pinged.

## Layout

Feature logic lives in plain modules under `src/features/<name>/`; Sapphire pieces under
`src/commands/` and `src/listeners/` stay thin and delegate to them. `features/` is not a Sapphire
store, so nothing there is auto-loaded and it can be tested without Discord.

```
src/features/gamba/
  outcomes.ts   emoji table with integer weights, cpp emoji, jackpot role ID
  roll.ts       generic weighted pick: rollOutcome(outcomes, randomInt?)
  index.ts      spinGamba, isJackpot, formatGambaReply (public surface of the feature)
src/commands/misc/gamba.ts   GambaCommand: spin, award role on jackpot, reply
test/gamba.test.ts
```

Future work (economy, stats, a `/gamba` slash command) adds modules under `features/` and composes
these functions; it does not move game logic into commands.

## Components

### `features/gamba/outcomes.ts`

- `export interface WeightedOutcome { emoji: string; weight: number }`
- `export const gambaOutcomes: readonly WeightedOutcome[]`: the eight entries above, weights summing
  to 21 (stated in a comment).
- `export const cppEmoji`: the cpp emoji string, also used by `isJackpot`.
- `export const gambaJackpotRoleId = '1561827731400822845'`.

Emoji IDs (from the example code):
- yt: `<:gamba4Head:1202741378161840239>`, `<:gambaCry:1083000042547322930>`,
  `<:gambaGrr:1098212404640358463>`, `<:gambaNails:1082999569291423815>`,
  `<:gambaRaa:1098212756810907729>`, `<:gambaSpooked:1083000047051997264>`
- python: `<:python:1226479453039759410>`
- cpp: `<:cpp:1226477956541448194>`

Changing odds, emojis or the role is a reviewed code change, by design.

### `features/gamba/roll.ts`

`rollOutcome<T extends { weight: number }>(outcomes: readonly T[], randomInt = crypto.randomInt): T`
- `randomInt(max)` returns an integer in `[0, max)`; default is `randomInt` from `node:crypto`.
- Draws `randomInt(total)` and returns the first outcome whose cumulative weight exceeds the draw.
- Throws if the list is empty or any weight is not a positive integer.
- Generic, so other games can reuse it.

### `features/gamba/index.ts`

- `spinGamba(randomInt?) : [string, string, string]`: three independent `rollOutcome` calls over
  `gambaOutcomes`.
- `isJackpot(reels): boolean`: true only when all three reels equal `cppEmoji`.
- `formatGambaReply(userMention, reels, jackpot?)`: builds the reply text. `jackpot` is
  `undefined` (no jackpot), `{ roleAssigned: true }` or `{ roleAssigned: false }`.

### `commands/misc/gamba.ts`

- `name: 'gamba'`, `description: 'Spin the gamba slot machine'`, `runIn: GuildAny`.
- `messageRun`: `spinGamba()`; if `isJackpot`, `await message.member.roles.add(gambaJackpotRoleId,
  'gamba jackpot')`; then `message.reply(formatGambaReply(...))`.

The command passes no `randomInt`; tests control randomness by mocking `node:crypto`'s
`randomInt`. If that proves awkward, the command reads the RNG from an exported module-level
default the test can override.

## Data flow

`?gamba` -> Sapphire message command listeners -> `GambaCommand.messageRun` -> `spinGamba` ->
`isJackpot` -> (jackpot) `member.roles.add` -> `formatGambaReply` -> `message.reply`.

## Error handling

- Invalid outcome table: only possible through a code change; `rollOutcome` throws and a test over
  the real table fails CI.
- User already has the role: still shown the jackpot message; `roles.add` is idempotent.
- Role assignment fails (missing Manage Roles, role hierarchy): log a warning with
  `this.container.logger.warn` (user ID and error, no secrets), still send the jackpot reply with
  the note `(couldn't assign the role, tell a mod)`.
- Used in a DM: rejected by the `GuildAny` run-in precondition; no role code runs.
- Reply failure: left to Sapphire's default command error logging.

## Deployment requirements

- The bot needs the **Manage Roles** permission and its highest role must be **above** the jackpot
  role in the server's role list.
- No new gateway intents: `message.member` is populated for guild messages with the existing
  intents.
- No new environment variables.

## Testing (`test/gamba.test.ts`)

- Distribution: feeding every draw `0..20` to `rollOutcome(gambaOutcomes, ...)` yields each yt emoji
  exactly 3 times, python 2 times, cpp once.
- `rollOutcome`: first and last draws map to the first and last outcomes; throws on an empty list,
  a zero weight and a non-integer weight.
- `isJackpot`: true for three cpp; false for two cpp plus another emoji.
- `formatGambaReply`: normal, jackpot with role assigned, jackpot with role not assigned.
- End to end (stubbed message, as in `test/ping.test.ts`):
  - non-jackpot spin: reply has three emojis, `roles.add` not called;
  - jackpot (RNG always returns 20): `roles.add` called with the role ID, reply has the jackpot line;
  - jackpot where `roles.add` rejects: reply still sent with the "couldn't assign" note.

## Commits (branch `feat/gamba`)

1. `docs: add gamba design spec`
2. `feat(gamba): add weighted outcome roller`: `roll.ts` + tests.
3. `feat(gamba): add gamba command`: outcomes, index, command, non-jackpot tests.
4. `feat(gamba): award role on jackpot`: jackpot detection, role assignment, failure note, tests.
5. `docs: document features layout and gamba role requirements`: AGENTS.md layout/conventions
   (`features/<name>/` holds logic, commands stay thin) and the Manage Roles requirement.

Each commit leaves `pnpm lint && pnpm typecheck && pnpm test && pnpm build` passing.

## Out of scope (v1)

Currency, wagers, cooldowns, streaks, stats, leaderboards, a slash command, configuring the role or
odds at runtime.
