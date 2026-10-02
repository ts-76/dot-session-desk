CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription` text NOT NULL,
	`message` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `deliveries_subscription` ON `deliveries` (`subscription`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread` text NOT NULL,
	`owner` text NOT NULL,
	`role` text NOT NULL,
	`body` text NOT NULL,
	`replyTo` text,
	`created` text NOT NULL,
	FOREIGN KEY (`thread`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `messages_thread` ON `messages` (`thread`,`created`);--> statement-breakpoint
CREATE UNIQUE INDEX `messages_reply` ON `messages` (`replyTo`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`url` text NOT NULL,
	`secret` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `subscriptions_owner` ON `subscriptions` (`owner`);--> statement-breakpoint
CREATE TABLE `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `threads_owner` ON `threads` (`owner`);