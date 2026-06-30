CREATE TABLE `job_billing_events` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`event_type` varchar(64) NOT NULL,
	`actor_user_id` varchar(36),
	`summary` varchar(500) NOT NULL,
	`amount` decimal(12,2),
	`currency` varchar(3),
	`proposal_id` varchar(36),
	`change_order_id` varchar(36),
	`vendor_invoice_id` varchar(36),
	`client_invoice_id` varchar(36),
	`payment_id` varchar(36),
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `job_billing_events_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `job_billing_events` ADD CONSTRAINT `jbe_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_billing_events` ADD CONSTRAINT `jbe_job_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_billing_events` ADD CONSTRAINT `jbe_actor_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_billing_events` ADD CONSTRAINT `jbe_proposal_fk` FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_billing_events` ADD CONSTRAINT `jbe_co_fk` FOREIGN KEY (`change_order_id`) REFERENCES `change_orders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_billing_events` ADD CONSTRAINT `jbe_vendor_invoice_fk` FOREIGN KEY (`vendor_invoice_id`) REFERENCES `vendor_invoices`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_billing_events` ADD CONSTRAINT `jbe_client_invoice_fk` FOREIGN KEY (`client_invoice_id`) REFERENCES `client_invoices`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_billing_events` ADD CONSTRAINT `jbe_payment_fk` FOREIGN KEY (`payment_id`) REFERENCES `payment_records`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `jbe_job_created_idx` ON `job_billing_events` (`job_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `jbe_tenant_job_idx` ON `job_billing_events` (`tenant_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `jbe_tenant_type_idx` ON `job_billing_events` (`tenant_id`,`event_type`);