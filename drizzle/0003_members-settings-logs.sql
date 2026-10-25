CREATE TABLE `guild_auto_roles` (
	`guild_id` text NOT NULL,
	`role_id` text NOT NULL,
	`target` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`guild_id`, `role_id`, `target`)
);
--> statement-breakpoint
CREATE TABLE `guild_settings` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`economy_log_channel_id` text,
	`mod_log_channel_id` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_runs` (
	`name` text PRIMARY KEY NOT NULL,
	`last_run_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `wallets` ADD `departed_at` integer;--> statement-breakpoint
CREATE INDEX `wallets_guild_departed_idx` ON `wallets` (`guild_id`,`departed_at`);