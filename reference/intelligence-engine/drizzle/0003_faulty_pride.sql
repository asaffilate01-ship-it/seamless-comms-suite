CREATE TABLE `callback_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`destination_id` text NOT NULL,
	`run_id` text,
	`idempotency_key` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_response_code` integer,
	`next_attempt_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`destination_id`) REFERENCES `outbound_destinations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_callback_deliveries_idempotency` ON `callback_deliveries` (`destination_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_callback_deliveries_queue` ON `callback_deliveries` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `event_tenant_links` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_event_tenant_event` ON `event_tenant_links` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_event_tenant_tenant` ON `event_tenant_links` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `outbound_destinations` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`event_types_json` text NOT NULL,
	`secret_version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'testing' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_outbound_destinations_app_name` ON `outbound_destinations` (`application_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_outbound_destinations_status` ON `outbound_destinations` (`status`);--> statement-breakpoint
CREATE TABLE `policy_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_pack_id` text NOT NULL,
	`application_id` text NOT NULL,
	`tenant_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`policy_pack_id`) REFERENCES `policy_packs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_policy_bindings_scope` ON `policy_bindings` (`policy_pack_id`,`application_id`,`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_policy_bindings_application` ON `policy_bindings` (`application_id`,`status`);--> statement-breakpoint
CREATE TABLE `policy_packs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sector` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`rules_json` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_policy_packs_name_version` ON `policy_packs` (`name`,`version`);--> statement-breakpoint
CREATE INDEX `idx_policy_packs_sector_status` ON `policy_packs` (`sector`,`status`);--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`tenant_id` text,
	`cron_expression` text NOT NULL,
	`timezone` text DEFAULT 'Europe/London' NOT NULL,
	`next_run_at` text NOT NULL,
	`status` text DEFAULT 'paused' NOT NULL,
	`last_run_at` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_schedules_due` ON `schedules` (`status`,`next_run_at`);--> statement-breakpoint
CREATE INDEX `idx_schedules_workflow` ON `schedules` (`workflow_id`);--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`external_id` text NOT NULL,
	`name` text NOT NULL,
	`region` text DEFAULT 'GB' NOT NULL,
	`data_residency` text DEFAULT 'UK' NOT NULL,
	`status` text DEFAULT 'simulation' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tenants_application_external` ON `tenants` (`application_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_tenants_application_status` ON `tenants` (`application_id`,`status`);