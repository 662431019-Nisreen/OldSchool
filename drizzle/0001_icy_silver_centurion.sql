CREATE TABLE `push_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`order_id` integer NOT NULL,
	`device` text NOT NULL,
	`status` text NOT NULL,
	`http_status` integer,
	`error` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `push_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` integer NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`created` integer NOT NULL,
	`message` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `push_order_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` integer NOT NULL,
	`subscription_id` text NOT NULL,
	`created` integer NOT NULL
);
