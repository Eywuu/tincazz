CREATE TABLE `flips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`mode` text NOT NULL,
	`challenger_id` text NOT NULL,
	`opponent_id` text,
	`bet` integer NOT NULL,
	`challenger_side` text NOT NULL,
	`result_side` text NOT NULL,
	`winner_id` text,
	`rake` integer NOT NULL,
	`message_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `flips_message_id_unique` ON `flips` (`message_id`);--> statement-breakpoint
CREATE INDEX `flips_guild_created_idx` ON `flips` (`guild_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `player_stats` ADD `flips` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `player_stats` ADD `flip_wins` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `player_stats` ADD `flip_wagered` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `player_stats` ADD `flip_won` integer DEFAULT 0 NOT NULL;