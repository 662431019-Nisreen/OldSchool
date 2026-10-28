CREATE INDEX `audit_login_attempt_idx` ON `audit` (`action`,`target`,`created`);--> statement-breakpoint
CREATE INDEX `orders_owner_id_idx` ON `orders` (`owner`,`id`);--> statement-breakpoint
CREATE INDEX `orders_created_idx` ON `orders` (`created`);--> statement-breakpoint
CREATE INDEX `push_deliveries_order_created_idx` ON `push_deliveries` (`order_id`,`created`);--> statement-breakpoint
CREATE INDEX `push_deliveries_created_idx` ON `push_deliveries` (`created`);--> statement-breakpoint
CREATE INDEX `push_events_status_created_idx` ON `push_events` (`status`,`created`);--> statement-breakpoint
CREATE INDEX `push_events_order_created_idx` ON `push_events` (`order_id`,`created`);--> statement-breakpoint
CREATE INDEX `push_events_created_idx` ON `push_events` (`created`);--> statement-breakpoint
CREATE INDEX `push_order_devices_order_subscription_idx` ON `push_order_devices` (`order_id`,`subscription_id`);--> statement-breakpoint
CREATE INDEX `push_order_devices_subscription_idx` ON `push_order_devices` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `push_order_devices_created_idx` ON `push_order_devices` (`created`);--> statement-breakpoint
CREATE INDEX `subscriptions_owner_idx` ON `subscriptions` (`owner`);