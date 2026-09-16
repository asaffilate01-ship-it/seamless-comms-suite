CREATE TABLE `speech_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`month` text NOT NULL,
	`requests` integer DEFAULT 0 NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `speech_workspace_month` ON `speech_usage` (`workspace_id`,`month`);