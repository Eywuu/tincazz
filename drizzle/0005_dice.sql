CREATE TABLE `rolls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`bet` integer NOT NULL,
	`call` text NOT NULL,
	`target` integer,
	`die1` integer NOT NULL,
	`die2` integer NOT NULL,
	`won` integer NOT NULL,
	`payout` integer NOT NULL,
	`edge` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rolls_user_idx` ON `rolls` (`guild_id`,`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `player_stats` ADD `rolls` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `player_stats` ADD `roll_wins` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `player_stats` ADD `roll_wagered` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `player_stats` ADD `roll_won` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `flips_challenger_idx` ON `flips` (`guild_id`,`challenger_id`);--> statement-breakpoint
CREATE INDEX `flips_opponent_idx` ON `flips` (`guild_id`,`opponent_id`);