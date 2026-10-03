CREATE TABLE `progress_updates` (
	`thread` text NOT NULL,
	`owner` text NOT NULL,
	`version` integer NOT NULL,
	`updateKey` text NOT NULL,
	`expectedVersion` integer NOT NULL,
	`payload` text NOT NULL,
	`updated` text NOT NULL,
	FOREIGN KEY (`thread`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `progress_thread_version` ON `progress_updates` (`owner`,`thread`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `progress_update_key` ON `progress_updates` (`owner`,`thread`,`updateKey`);