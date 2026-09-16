CREATE TABLE `actions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`run_id` text NOT NULL,
	`product_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`assignee` text NOT NULL,
	`status` text NOT NULL,
	`decision_note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `actions_workspace_status` ON `actions` (`workspace_id`,`status`);--> statement-breakpoint
CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`actor` text NOT NULL,
	`event` text NOT NULL,
	`detail` text NOT NULL,
	`resource_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_workspace_time` ON `audit` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`object_key` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `documents_workspace_product` ON `documents` (`workspace_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`last_seen` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_token` ON `integrations` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `integration_product` ON `integrations` (`workspace_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`sector` text NOT NULL,
	`description` text NOT NULL,
	`color` text NOT NULL,
	`scope` text DEFAULT 'confirmed' NOT NULL,
	`template_id` text NOT NULL,
	`mode` text DEFAULT 'approve' NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_workspace_slug` ON `products` (`workspace_id`,`slug`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`template_id` text NOT NULL,
	`title` text NOT NULL,
	`input` text NOT NULL,
	`kind` text NOT NULL,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`output` text,
	`error` text,
	`document_ids` text DEFAULT '[]' NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `runs_workspace_time` ON `runs` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `run_idempotency` ON `runs` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`run_id` text NOT NULL,
	`action_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`assignee` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_action` ON `tasks` (`action_id`);--> statement-breakpoint
CREATE INDEX `tasks_workspace_status` ON `tasks` (`workspace_id`,`status`);--> statement-breakpoint
CREATE TABLE `usage` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`month` text NOT NULL,
	`reserved` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usage_workspace_month` ON `usage` (`workspace_id`,`month`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`paused` integer DEFAULT 0 NOT NULL,
	`run_limit` integer DEFAULT 100 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_owner` ON `workspaces` (`owner_id`);