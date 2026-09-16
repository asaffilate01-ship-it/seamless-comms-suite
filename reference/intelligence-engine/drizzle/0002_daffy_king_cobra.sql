CREATE TABLE `budget_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`daily_limit_pence` integer DEFAULT 0 NOT NULL,
	`monthly_limit_pence` integer DEFAULT 0 NOT NULL,
	`warning_percent` integer DEFAULT 80 NOT NULL,
	`hard_stop` integer DEFAULT true NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_budget_policies_application` ON `budget_policies` (`application_id`);--> statement-breakpoint
CREATE TABLE `dead_letters` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`application_id` text NOT NULL,
	`failure_stage` text NOT NULL,
	`error_code` text NOT NULL,
	`error_message` text NOT NULL,
	`replay_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`last_replay_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_dead_letters_event` ON `dead_letters` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_dead_letters_status_created` ON `dead_letters` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_dead_letters_application` ON `dead_letters` (`application_id`);--> statement-breakpoint
CREATE TABLE `readiness_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`check_key` text NOT NULL,
	`status` text NOT NULL,
	`evidence_json` text DEFAULT '{}' NOT NULL,
	`checked_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`checked_by` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_readiness_checks_application_key` ON `readiness_checks` (`application_id`,`check_key`);--> statement-breakpoint
CREATE INDEX `idx_readiness_checks_status` ON `readiness_checks` (`status`);--> statement-breakpoint
CREATE TABLE `workflow_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`version` integer NOT NULL,
	`definition_json` text NOT NULL,
	`validation_json` text DEFAULT '{}' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workflow_versions_unique` ON `workflow_versions` (`workflow_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_workflow_versions_created` ON `workflow_versions` (`created_at`);