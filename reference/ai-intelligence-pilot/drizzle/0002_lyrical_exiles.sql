CREATE TABLE `journeys` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`title` text NOT NULL,
	`goal` text NOT NULL,
	`kind` text NOT NULL,
	`current_step` integer DEFAULT 0 NOT NULL,
	`step_run_id` text,
	`status` text NOT NULL,
	`history` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `journeys_workspace` ON `journeys` (`workspace_id`,`created_at`);