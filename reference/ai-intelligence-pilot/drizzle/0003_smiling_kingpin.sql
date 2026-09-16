CREATE TABLE `daily_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`timezone` text NOT NULL,
	`goals` text DEFAULT '' NOT NULL,
	`issues` text DEFAULT '' NOT NULL,
	`review_note` text DEFAULT '' NOT NULL,
	`help_item_ids` text DEFAULT '[]' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_plan_owner_day` ON `daily_plans` (`workspace_id`,`user_id`,`day`);--> statement-breakpoint
CREATE TABLE `day_items` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text,
	`source_task_id` text,
	`title` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`scheduled_date` text NOT NULL,
	`due_date` text,
	`priority` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`blocker` text DEFAULT '' NOT NULL,
	`steps` text DEFAULT '[]' NOT NULL,
	`completed_at` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `day_item_owner_source` ON `day_items` (`workspace_id`,`user_id`,`source_task_id`);--> statement-breakpoint
CREATE INDEX `day_items_owner_status` ON `day_items` (`workspace_id`,`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `day_meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text,
	`title` text NOT NULL,
	`starts_at` text NOT NULL,
	`duration` integer DEFAULT 30 NOT NULL,
	`timezone` text NOT NULL,
	`attendees` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'unconfirmed' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `day_meetings_owner_time` ON `day_meetings` (`workspace_id`,`user_id`,`starts_at`);