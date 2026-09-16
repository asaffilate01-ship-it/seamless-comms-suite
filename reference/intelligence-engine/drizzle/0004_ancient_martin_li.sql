CREATE TABLE `branding_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`display_name` text NOT NULL,
	`accent_color` text DEFAULT '#7c5cff' NOT NULL,
	`logo_url` text,
	`support_email` text,
	`custom_domain` text,
	`mode` text DEFAULT 'powered_by_omniqora' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_branding_profiles_tenant` ON `branding_profiles` (`tenant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_branding_profiles_domain` ON `branding_profiles` (`custom_domain`);--> statement-breakpoint
CREATE TABLE `commercial_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`billing_model` text NOT NULL,
	`monthly_base_pence` integer DEFAULT 0 NOT NULL,
	`included_runs` integer DEFAULT 0 NOT NULL,
	`overage_pence` integer DEFAULT 0 NOT NULL,
	`features_json` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_commercial_plans_name` ON `commercial_plans` (`name`);--> statement-breakpoint
CREATE INDEX `idx_commercial_plans_status` ON `commercial_plans` (`status`);--> statement-breakpoint
CREATE TABLE `tenant_entitlements` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`feature_key` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`limit_value` integer,
	`source` text DEFAULT 'plan' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tenant_entitlements_feature` ON `tenant_entitlements` (`tenant_id`,`feature_key`);--> statement-breakpoint
CREATE INDEX `idx_tenant_entitlements_enabled` ON `tenant_entitlements` (`tenant_id`,`enabled`);--> statement-breakpoint
CREATE TABLE `tenant_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`industry_pack` text NOT NULL,
	`status` text DEFAULT 'trial' NOT NULL,
	`trial_ends_at` text,
	`current_period_start` text NOT NULL,
	`current_period_end` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`plan_id`) REFERENCES `commercial_plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tenant_subscriptions_tenant` ON `tenant_subscriptions` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_tenant_subscriptions_status_period` ON `tenant_subscriptions` (`status`,`current_period_end`);--> statement-breakpoint
CREATE TABLE `usage_meters` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`metric_key` text NOT NULL,
	`period` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`estimated_cost_pence` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_usage_meters_period` ON `usage_meters` (`tenant_id`,`metric_key`,`period`);--> statement-breakpoint
CREATE INDEX `idx_usage_meters_metric` ON `usage_meters` (`metric_key`,`period`);