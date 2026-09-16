CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invite_token` ON `invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invites_workspace` ON `invitations` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_workspace_user` ON `members` (`workspace_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `members_user` ON `members` (`user_id`);--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`date` text NOT NULL,
	`location` text NOT NULL,
	`currency` text NOT NULL,
	`gross` integer NOT NULL,
	`refunds` integer NOT NULL,
	`orders` integer NOT NULL,
	`cogs` integer,
	`labour` integer,
	`source` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_daily_source` ON `sales` (`workspace_id`,`product_id`,`date`,`location`,`currency`,`source`);--> statement-breakpoint
CREATE INDEX `sales_workspace_date` ON `sales` (`workspace_id`,`date`);--> statement-breakpoint
DROP INDEX `workspace_owner`;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `kind` text DEFAULT 'internal' NOT NULL;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `plan` text DEFAULT 'pilot' NOT NULL;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `monthly_price` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `currency` text DEFAULT 'GBP' NOT NULL;--> statement-breakpoint
CREATE INDEX `workspace_owner_lookup` ON `workspaces` (`owner_id`);