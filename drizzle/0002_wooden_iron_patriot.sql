CREATE TABLE `staff_push_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`value` text NOT NULL,
	`created` integer NOT NULL
);
