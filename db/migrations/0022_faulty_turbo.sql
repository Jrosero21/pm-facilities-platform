CREATE TABLE `payment_records` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`direction` enum('inbound','outbound') NOT NULL,
	`client_invoice_id` varchar(36),
	`vendor_invoice_id` varchar(36),
	`job_id` varchar(36) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`method` varchar(64),
	`reference` varchar(255),
	`paid_at` datetime NOT NULL,
	`recorded_by_user_id` varchar(36),
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payment_records_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `payment_records` ADD CONSTRAINT `pay_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_records` ADD CONSTRAINT `pay_client_invoice_fk` FOREIGN KEY (`client_invoice_id`) REFERENCES `client_invoices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_records` ADD CONSTRAINT `pay_vendor_invoice_fk` FOREIGN KEY (`vendor_invoice_id`) REFERENCES `vendor_invoices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_records` ADD CONSTRAINT `pay_job_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_records` ADD CONSTRAINT `pay_recorded_by_fk` FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `pay_tenant_job_idx` ON `payment_records` (`tenant_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `pay_client_invoice_idx` ON `payment_records` (`client_invoice_id`);--> statement-breakpoint
CREATE INDEX `pay_vendor_invoice_idx` ON `payment_records` (`vendor_invoice_id`);--> statement-breakpoint
CREATE INDEX `pay_tenant_direction_idx` ON `payment_records` (`tenant_id`,`direction`);