ALTER TABLE `reception_items` ADD `human_handler_id` text;--> statement-breakpoint
ALTER TABLE `reception_items` ADD `human_handler_name` text;--> statement-breakpoint
ALTER TABLE `reception_items` ADD `handoff_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `reception_items` ADD `preferred_handler_id` text;--> statement-breakpoint
ALTER TABLE `reception_items` ADD `preferred_handler_name` text;