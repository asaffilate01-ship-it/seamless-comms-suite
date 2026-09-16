CREATE TABLE `reception_customers` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`external_ref` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_source_ref` ON `reception_customers` (`workspace_id`,`product_id`,`external_ref`);--> statement-breakpoint
CREATE INDEX `customer_phone_lookup` ON `reception_customers` (`workspace_id`,`product_id`,`phone`);--> statement-breakpoint
ALTER TABLE `reception_items` ADD `customer_id` text;--> statement-breakpoint
ALTER TABLE `reception_items` ADD `caller_number` text;