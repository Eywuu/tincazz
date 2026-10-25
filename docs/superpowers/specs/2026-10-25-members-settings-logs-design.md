# Departed members, auto-role and log channels design

Date: 2026-10-25
Status: approved in conversation, pending written-spec review

## Goal

Three related pieces of server management, sharing one per-guild settings layer:
1. **Departed members disappear.** A member who leaves the server stops appearing on boards and
   ranks at once, gets everything back if they rejoin within 30 days, and is purged after that.
2. **Auto-role.** Admins configure roles that are given to new members, with a separate list for
   bots, and can inspect the configuration.
3. **Log channels.** Admins set an economy log channel (important coin events) and a mod log
   channel (bot configuration changes and auto-role failures).

## Decisions

| Topic              | Decision                                                                         |
| ------------------ | -------------------------------------------------------------------------------- |
| Leave policy       | Hide immediately, restore on rejoin, purge after a 30-day grace period           |
| Purged data        | `wallets` and `player_stats` rows; `ledger`, `spins`, `flips` stay as history    |
| Purged coins       | Destroyed, recorded by a `pruned` ledger row that zeroes the balance first       |
| Leave detection    | Live `guildMemberRemove`/`guildMemberAdd` plus a daily reconcile job             |
| Scheduler          | Small in-process runner, last run persisted in `job_runs`; no new dependency     |
| Settings storage   | Typed tables: `guild_settings`, `guild_auto_roles`                               |
| Departure tracking | Nullable `wallets.departed_at`                                                   |
| Admin permission   | Manage Server (as `/eco`), checked at registration and again at runtime          |
| Command surface    | One `/settings` command with `autorole` and `logs` groups and a `show` command   |
| Auto-role targets  | Two lists: `member` (humans) and `bot`                                           |
| Screening          | Pending members get roles only once they pass Rules Screening                    |
| Economy log        | Admin give/take, jackpots, big spins/flips (≥ 5,000), departures and purges      |
| Mod log            | Settings changes, settings auto-cleared by deletions, auto-role failures         |
| Logging calls      | One `features/logs` module, called from the Discord-facing layer after commit    |
| New gateway intent | `GuildMembers` (privileged), required by both join/leave events and member fetch |
| New env variables  | None                                                                             |

## Part 1: data model

One migration, generated with `pnpm db:generate --name members-settings-logs`.
- `wallets.departed_at`: integer, nullable, epoch ms. Null means the member is present. New index
  `wallets_guild_departed_idx` on `(guild_id, departed_at)`.
- `guild_settings`: `guild_id` text primary key, `economy_log_channel_id` text nullable,
  `mod_log_channel_id` text nullable, `updated_at` integer not null.
- `guild_auto_roles`: `guild_id` text, `role_id` text, `target` text enum `member | bot`,
  `created_at` integer; primary key `(guild_id, role_id, target)`. The same role may appear in both
  lists.
- `job_runs`: `name` text primary key, `last_run_at` integer not null.
- `ledgerReasons` gains `'pruned'`.

## Part 2: member lifecycle

### States

| State                        | Boards and ranks | Entered by                                                       |
| ---------------------------- | ---------------- | ---------------------------------------------------------------- |
| Present (`departed_at` null) | shown            | wallet creation; `guildMemberAdd` or reconcile seeing the member |
| Departed                     | hidden           | `guildMemberRemove`, or reconcile not finding the member         |
| Purged (rows deleted)        | hidden           | reconcile, once `now - departed_at >= 30 days`                   |

`members.graceMs = 30 * 86_400_000` lives in `src/features/members/config.ts`.

### Purge

Per guild, in one transaction, for each wallet due:
1. If `balance > 0`, `debit` the full balance with reason `pruned` (balance after: 0).
2. Delete the `wallets` and `player_stats` rows for `(guild_id, user_id)`.

The purged user's ledger sums to 0, so if they rejoin later, `getOrCreateWallet` creates a fresh
wallet with the starting balance and `expectLedgerConsistent` still holds. Purge is the only code
outside `features/economy` that changes balances, so it lives in `features/economy/prune.ts` and is
exported from the economy surface; `features/members` calls it.

### Where departed members are hidden

- `leaderboardPage` and `leaderboardRank`: the `coins` source filters `wallets.departed_at IS NULL`;
  the five `player_stats` sources inner join `wallets` on `(guild_id, user_id)` with the same
  filter.
- `coinsRank`: counts only present wallets ahead. A departed wallet's own rank is `undefined`.
- Presence: the "last jackpot winner" status is dropped when that winner's wallet is departed or
  missing.
- `/eco give|take` refuses a target that is not a current guild member ("<@id> is not in this
  server."), so admins can't create or fund wallets for people who left.
- `findWallet` and direct profile lookups are unchanged; departed members cannot run commands.

### Live listeners

- `src/listeners/member-leave.ts` (`guildMemberRemove`): non-bot with a wallet → set
  `departed_at = now` (only if currently null), then `logEconomy` a `member_departed` event.
- `src/listeners/member-join.ts` (`guildMemberAdd`): non-bot with a departed wallet → clear
  `departed_at`, `logEconomy` `member_restored`. Then run auto-role (Part 4) unless the member is
  `pending`.
- `src/listeners/member-screening.ts` (`guildMemberUpdate`): `oldMember.pending && !newMember.pending`
  → run auto-role.

Listener errors are caught and logged; they never crash the process.

### Reconcile

`planReconcile(wallets, memberIds, now)` in `src/features/members/reconcile.ts` is pure:
- `depart`: present wallets whose user is not in `memberIds`.
- `restore`: departed wallets whose user is in `memberIds`.
- `purge`: departed wallets not in `memberIds` with `now - departed_at >= graceMs`. A wallet hidden
  in this same run is never purged in it.

The `member-reconcile` job (`src/features/members/job.ts`) runs for each guild in
`client.guilds.cache`, or only `GUILD_ID` when set (as presence does):
1. `guild.members.fetch()`. If it throws, or returns fewer than `0.95 * guild.memberCount` members,
   log a warning, change nothing and report failure (so the run is retried within an hour).
2. Apply the plan in one transaction: set or clear `departed_at`, then purge.
3. If anything changed, `logEconomy` a `reconcile_summary`: departed, restored and purged counts,
   coins removed, and purged users by mention when there are at most 20 (otherwise a count).

## Part 3: scheduler

`src/features/scheduler/`:

```ts
interface Job {
  name: string;
  everyMs: number;
  /** Resolves true when the run completed; false or a throw means retry later. */
  run(client: Client<true>, now: number): Promise<boolean>;
}
function startJobs(client: Client<true>, jobs: Job[]): () => void;
```

- Started from `src/listeners/ready.ts` next to `startPresence`.
- Checks once at start and then every `scheduler.tickMs` (1 hour, `unref`'d timer). A job runs when
  it has no `job_runs` row or `now - last_run_at >= everyMs`.
- `last_run_at` is upserted only after a successful run. An in-memory flag prevents overlapping runs
  of the same job. Errors are logged with `logger.warn` and never thrown.
- Returns a stop function that clears the timer.
- Registered jobs: `member-reconcile`, every 24 hours.

## Part 4: auto-role

### Validation

`validateAutoRole(role, ctx)` in `src/features/settings/autorole.ts` is pure and returns either
`ok` or a rejection reason with user-facing text. It rejects a role that:
- is `@everyone` or managed (bot, booster or integration roles);
- is at or above the bot's highest role, or the bot lacks Manage Roles;
- is at or above the invoker's highest role, unless the invoker owns the server;
- has any of: Administrator, Manage Server, Manage Roles, Manage Channels, Ban Members,
  Kick Members, Manage Messages, Mention Everyone, Manage Webhooks, Moderate Members;
- would make its list longer than `autoRoles.maxPerTarget` (10).

Adding a role that is already in the list replies "already set" and changes nothing.

### Assignment

`assignAutoRoles(member)` in `src/features/settings/assign.ts`:
1. Read the list for `member.user.bot ? 'bot' : 'member'`. Empty list → return.
2. Keep roles that still exist and that the bot can currently assign (has Manage Roles, role below
   its highest role, not managed).
3. One `member.roles.add(ids, 'auto-role')` call.
4. Never throws. Skipped roles or a failed call are logged with `logger.warn` and sent to the mod
   log as `autorole_failed` with the member, each role and why.

### Keeping configuration in step

- `src/listeners/role-delete.ts` (`roleDelete`): remove the role from both lists; `logMod`
  `setting_auto_cleared`.
- `src/listeners/channel-delete.ts` (`channelDelete`): clear any log setting pointing at the
  channel; `logMod` `setting_auto_cleared` (if the mod log itself was deleted, only the process log
  records it).

## Part 5: `/settings` command

`src/commands/admin/settings.ts`, guild-only, `setDefaultMemberPermissions(ManageGuild)`, with a
runtime `ManageGuild` check as in `/eco`. All replies are ephemeral cards.

| Invocation                                                     | Effect                                       |
| -------------------------------------------------------------- | -------------------------------------------- |
| `/settings show`                                               | Both auto-role lists and both log channels   |
| `/settings autorole add role:<role> [target:members\|bots]`    | Validate, add, `logMod` `autorole_added`     |
| `/settings autorole remove role:<role> [target:members\|bots]` | Remove, `logMod` `autorole_removed`          |
| `/settings logs set type:<economy\|mod> channel:<channel>`     | Validate, confirm in channel, save, `logMod` |
| `/settings logs clear type:<economy\|mod>`                     | Clear, `logMod` `log_channel_cleared`        |

`target` defaults to `members`. Removing a role not in the list replies "not set".

`/settings show` marks with ⚠️ an auto-role the bot cannot currently assign (with the reason) and a
log channel the bot cannot send to or that no longer exists.

`logs set` accepts text and announcement channels (`setChannelTypes`). The bot needs View Channel
and Send Messages there. It sends "This channel now receives <economy|mod> logs. Set by @actor."
into the channel and saves only if that send succeeds; otherwise it replies with the reason and
changes nothing. When the mod log channel moves, `log_channel_set` is sent to both the old and the
new mod log channel.

Settings reads and writes live in `src/features/settings/store.ts`; the command stays thin.

## Part 6: logs

`src/features/logs/`:
- `logEconomy(guildId, event)` and `logMod(guildId, event)`. Events are tagged unions in
  `events.ts`; `cards.ts` renders each as a Components V2 card with the existing `card` helpers,
  ending in a `-# <t:…:f>` timestamp line.
- Both look up the configured channel from `guild_settings`, fetch it from the client cache, send,
  and never throw: a missing setting returns silently, a missing channel or failed send logs
  `logger.warn`. No retries.
- Callers `void` them after the database commit and after replying to the user, so logging never
  delays or breaks the user-facing flow.
- Mentions in log cards never ping (the client's global `allowedMentions` stays as is).
- Thresholds live in `src/features/logs/config.ts`: `bigSpin = 5_000` (bet or payout),
  `bigFlip = 5_000` (bet).

### Economy events

| Event               | Emitted from                                                   | Content                                           |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| `admin_adjust`      | `src/commands/economy/eco.ts`                                  | actor, target, give/take, amount, reason, balance |
| `jackpot`           | `spin()` in `src/features/gamba/spin.ts`                       | winner, bet, pot won, role assigned or not        |
| `big_spin`          | `spin()`                                                       | player, bet, result, payout                       |
| `big_flip`          | `src/commands/misc/coinflip.ts`, `coinflip-buttons.ts` handler | mode, players, bet, winner, rake                  |
| `member_departed`   | `member-leave.ts`                                              | user, balance, purge date                         |
| `member_restored`   | `member-join.ts`                                               | user, balance                                     |
| `reconcile_summary` | `member-reconcile` job                                         | counts, coins removed, purged users               |

A jackpot spin emits `jackpot` only, never also `big_spin`.

### Mod events

| Event                                     | Content                                      |
| ----------------------------------------- | -------------------------------------------- |
| `autorole_added` / `autorole_removed`     | actor, role, list                            |
| `log_channel_set` / `log_channel_cleared` | actor, log type, old and new channel         |
| `setting_auto_cleared`                    | which role or channel was removed, and why   |
| `autorole_failed`                         | member, each role that failed and the reason |

## Part 7: client and permissions

- `src/client.ts` adds `GatewayIntentBits.GuildMembers`, commented as privileged (Developer Portal →
  Bot → Server Members Intent). A `client.test.ts` case guards it.
- The bot needs Manage Roles with its highest role above every auto-role (already true for the
  jackpot role), plus View Channel and Send Messages in the log channels.

## Testing

All with `openDatabase(':memory:')`; Discord objects are stubs as in `test/support/interaction.ts`.
- `members-reconcile.test.ts`: `planReconcile` examples (depart, restore, purge at exactly 30 days
  and 1 ms before, no purge in the run that hides); fast-check: never departs or purges a current
  member, `restore ⊆ memberIds`, every purged wallet has `departed_at <= now - graceMs`.
- `members-job.test.ts`: applying a plan, the incomplete-fetch guard (no writes, returns false), the
  summary event only when something changed.
- `economy-prune.test.ts`: `pruned` row then deletion, `player_stats` removed, ledger consistent,
  rejoin after purge starts at the starting balance.
- `fuzz-economy.test.ts`: `leave`, `rejoin` and `purge` ops; the coin total decreases by exactly the
  `pruned` sum; departed wallets never appear in `leaderboardPage`, `leaderboardRank` or
  `coinsRank`.
- `stats-leaderboard.test.ts`: departed wallets excluded from all six boards and ranks.
- `scheduler.test.ts` (fake timers): due at start, not due skipped, failure not recorded, no
  overlap, stop clears the timer.
- `settings-autorole.test.ts`: every rejection, owner bypass, cap, duplicate; fast-check: any
  dangerous permission bit is always rejected.
- `settings-assign.test.ts`: member vs bot list, missing and unassignable roles skipped, failure sent
  to the mod log, never throws.
- `settings-command.test.ts`: every subcommand end to end, the permission gate, the confirmation
  send failing, `show` warnings.
- `logs.test.ts`: a card per event, unset channel is silent, missing channel and throwing send only
  warn, jackpot not duplicated as `big_spin`.
- Listener tests: leave, join (pending deferred), screening completion, `roleDelete`,
  `channelDelete`.

## Docs

- `AGENTS.md`: layout entries for `commands/admin`, `features/members`, `features/scheduler`,
  `features/settings`, `features/logs`; Discord notes for the Server Members intent and auto-role
  role hierarchy; a convention note that new coin events with user impact should consider an
  economy log event.
- `README.md`: enabling the Server Members intent and first-time `/settings` setup.

## Delivery

Branch `feat/members-settings-logs`, one PR. Logical commits, each passing lint, typecheck, test and
build:
1. `feat(db): add departed members, guild settings and job runs`
2. `feat(scheduler): run persisted daily jobs`
3. `feat(logs): send economy and mod log cards`
4. `feat(settings): add /settings logs and show`
5. `feat(settings): validate and assign auto-roles`
6. `feat(settings): add /settings autorole`
7. `feat(members): hide departed members from boards and ranks`
8. `feat(members): reconcile and purge departed members daily`
9. `feat(logs): log admin adjustments, jackpots and big wins`
10. `test: fuzz member departures in the economy model run`
11. `docs: document members, settings and log channels`

## Out of scope

- Configurable grace period or big-win thresholds.
- Member join/leave lines in the mod log.
- Pruning `ledger`, `spins` or `flips` history.
- Prefix versions of `/settings`.
