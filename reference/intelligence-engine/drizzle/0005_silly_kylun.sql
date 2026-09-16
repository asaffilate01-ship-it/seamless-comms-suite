CREATE TABLE `agent_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`department` text NOT NULL,
	`description` text NOT NULL,
	`default_autonomy` text DEFAULT 'draft_only' NOT NULL,
	`agent_keys_json` text DEFAULT '[]' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_teams_name_version` ON `agent_teams` (`name`,`version`);--> statement-breakpoint
CREATE INDEX `idx_agent_teams_department_status` ON `agent_teams` (`department`,`status`);--> statement-breakpoint
CREATE TABLE `agent_work_items` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`deployment_id` text,
	`work_type` text NOT NULL,
	`title` text NOT NULL,
	`source_ref` text,
	`priority` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`input_json` text DEFAULT '{}' NOT NULL,
	`result_json` text,
	`confidence_bps` integer,
	`requires_approval` integer DEFAULT true NOT NULL,
	`due_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deployment_id`) REFERENCES `tenant_agent_deployments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_agent_work_items_queue` ON `agent_work_items` (`tenant_id`,`status`,`priority`);--> statement-breakpoint
CREATE INDEX `idx_agent_work_items_due` ON `agent_work_items` (`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `idx_agent_work_items_deployment` ON `agent_work_items` (`deployment_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `report_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`report_type` text NOT NULL,
	`name` text NOT NULL,
	`frequency` text NOT NULL,
	`timezone` text DEFAULT 'Europe/London' NOT NULL,
	`recipients_json` text DEFAULT '[]' NOT NULL,
	`data_scopes_json` text DEFAULT '[]' NOT NULL,
	`approval_required` integer DEFAULT true NOT NULL,
	`next_run_at` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_report_schedules_tenant_name` ON `report_schedules` (`tenant_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_report_schedules_due` ON `report_schedules` (`status`,`next_run_at`);--> statement-breakpoint
CREATE TABLE `tenant_agent_deployments` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`team_id` text NOT NULL,
	`industry_pack` text NOT NULL,
	`autonomy_level` text DEFAULT 'draft_only' NOT NULL,
	`knowledge_scope_json` text DEFAULT '[]' NOT NULL,
	`channel_scope_json` text DEFAULT '[]' NOT NULL,
	`monthly_run_limit` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'simulation' NOT NULL,
	`deployed_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `agent_teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tenant_agent_deployment_team` ON `tenant_agent_deployments` (`tenant_id`,`team_id`);--> statement-breakpoint
CREATE INDEX `idx_tenant_agent_deployments_status` ON `tenant_agent_deployments` (`tenant_id`,`status`);