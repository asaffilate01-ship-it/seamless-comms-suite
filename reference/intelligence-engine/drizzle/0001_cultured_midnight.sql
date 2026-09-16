CREATE TABLE `delivery_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`destination` text NOT NULL,
	`attempt` integer DEFAULT 1 NOT NULL,
	`status` text NOT NULL,
	`response_code` integer,
	`error_code` text,
	`next_retry_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_delivery_attempt_unique` ON `delivery_attempts` (`event_id`,`destination`,`attempt`);--> statement-breakpoint
CREATE INDEX `idx_delivery_attempt_retry` ON `delivery_attempts` (`status`,`next_retry_at`);--> statement-breakpoint
CREATE TABLE `provider_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`label` text NOT NULL,
	`model` text NOT NULL,
	`task_classes_json` text NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`daily_budget_pence` integer DEFAULT 0 NOT NULL,
	`credential_state` text DEFAULT 'not_connected' NOT NULL,
	`status` text DEFAULT 'simulation' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_provider_configs_provider_model` ON `provider_configs` (`provider`,`model`);--> statement-breakpoint
CREATE INDEX `idx_provider_configs_status_priority` ON `provider_configs` (`status`,`priority`);--> statement-breakpoint
CREATE TABLE `workflow_run_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`step_key` text NOT NULL,
	`step_type` text NOT NULL,
	`status` text NOT NULL,
	`provider` text,
	`input_json` text DEFAULT '{}' NOT NULL,
	`output_json` text,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`finished_at` text,
	`duration_ms` integer,
	`requires_approval` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workflow_run_steps_key` ON `workflow_run_steps` (`run_id`,`step_key`);--> statement-breakpoint
CREATE INDEX `idx_workflow_run_steps_status` ON `workflow_run_steps` (`status`);--> statement-breakpoint
CREATE TABLE `workflow_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`application_id` text NOT NULL,
	`event_id` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`mode` text DEFAULT 'simulation' NOT NULL,
	`input_json` text DEFAULT '{}' NOT NULL,
	`output_json` text,
	`started_by` text NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`finished_at` text,
	`duration_ms` integer,
	`estimated_cost_pence` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_workflow_started` ON `workflow_runs` (`workflow_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_application_status` ON `workflow_runs` (`application_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_event` ON `workflow_runs` (`event_id`);