CREATE TABLE `ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`delta` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`reason` text NOT NULL,
	`ref` integer,
	`actor_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ledger_user_idx` ON `ledger` (`guild_id`,`user_id`,`id`);--> statement-breakpoint
CREATE TABLE `player_stats` (
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`spins` integer DEFAULT 0 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`jackpots` integer DEFAULT 0 NOT NULL,
	`wagered` integer DEFAULT 0 NOT NULL,
	`won` integer DEFAULT 0 NOT NULL,
	`biggest_win` integer DEFAULT 0 NOT NULL,
	`best_odds` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`guild_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `player_stats_guild_biggest_win_idx` ON `player_stats` (`guild_id`,`biggest_win`);--> statement-breakpoint
CREATE INDEX `player_stats_guild_jackpots_idx` ON `player_stats` (`guild_id`,`jackpots`);--> statement-breakpoint
CREATE INDEX `player_stats_guild_spins_idx` ON `player_stats` (`guild_id`,`spins`);--> statement-breakpoint
CREATE TABLE `pots` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`amount` integer NOT NULL,
	`last_winner_id` text,
	`last_won_at` integer
);
--> statement-breakpoint
CREATE TABLE `spins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`mode` text NOT NULL,
	`reels` text NOT NULL,
	`result` text NOT NULL,
	`bet` integer DEFAULT 0 NOT NULL,
	`payout` integer DEFAULT 0 NOT NULL,
	`pot_won` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `spins_user_idx` ON `spins` (`guild_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `wallets` (
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`balance` integer NOT NULL,
	`daily_streak` integer DEFAULT 0 NOT NULL,
	`last_daily_at` integer,
	`last_bailout_at` integer,
	`last_chat_reward_at` integer,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`guild_id`, `user_id`),
	CONSTRAINT "wallets_balance_non_negative" CHECK("wallets"."balance" >= 0)
);
--> statement-breakpoint
CREATE INDEX `wallets_guild_balance_idx` ON `wallets` (`guild_id`,`balance`);