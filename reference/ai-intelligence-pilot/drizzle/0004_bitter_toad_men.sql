CREATE TABLE `planning_records` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`kind` text NOT NULL,
	`record_key` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `planning_record` ON `planning_records` (`workspace_id`,`product_id`,`kind`,`record_key`);--> statement-breakpoint
CREATE INDEX `planning_product` ON `planning_records` (`workspace_id`,`product_id`,`kind`);--> statement-breakpoint
CREATE TABLE `planning_scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`assumptions` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scenarios_product` ON `planning_scenarios` (`workspace_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `reception_items` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`kind` text NOT NULL,
	`channel` text NOT NULL,
	`customer` text NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`summary` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`external_key` text NOT NULL,
	`source_ref` text,
	`receipt` text DEFAULT '{}' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reception_event` ON `reception_items` (`workspace_id`,`product_id`,`external_key`);--> statement-breakpoint
CREATE INDEX `reception_status` ON `reception_items` (`workspace_id`,`status`);--> statement-breakpoint
CREATE TABLE `reception_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`escalation` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reception_product` ON `reception_settings` (`workspace_id`,`product_id`);