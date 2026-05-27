CREATE TABLE `vendor_invoice_line_items` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`line_number` int NOT NULL,
	`category` enum('labor','materials','equipment','trip','permit','fee','tax','other') NOT NULL,
	`description` text NOT NULL,
	`quantity` decimal(10,2) NOT NULL DEFAULT '1',
	`unit` varchar(32),
	`unit_price` decimal(12,2) NOT NULL,
	`extended_amount` decimal(12,2) NOT NULL DEFAULT '0',
	`tax_rate` decimal(6,3),
	`tax_amount` decimal(14,2) NOT NULL DEFAULT '0',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`vendor_invoice_id` varchar(36) NOT NULL,
	CONSTRAINT `vendor_invoice_line_items_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `vendor_invoices` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`vendor_id` varchar(36) NOT NULL,
	`assignment_id` varchar(36),
	`source_type` enum('manual','vendor_portal','email_ingestion','external_portal_sync','api') NOT NULL DEFAULT 'manual',
	`source_external_id` varchar(255),
	`invoice_number` varchar(128),
	`sequence_number` int,
	`is_final` boolean NOT NULL DEFAULT false,
	`status` enum('received','under_review','approved','disputed','paid') NOT NULL DEFAULT 'received',
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`subtotal` decimal(12,2) NOT NULL DEFAULT '0',
	`tax_total` decimal(14,2) NOT NULL DEFAULT '0',
	`total` decimal(12,2) NOT NULL DEFAULT '0',
	`nte_baseline_amount` decimal(12,2),
	`exceeds_nte` boolean NOT NULL DEFAULT false,
	`payment_status` enum('unpaid','partially_paid','paid') NOT NULL DEFAULT 'unpaid',
	`invoice_date` datetime,
	`approved_by_user_id` varchar(36),
	`approved_at` datetime,
	`notes` text,
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendor_invoices_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `vendor_invoice_line_items` ADD CONSTRAINT `vili_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_invoice_line_items` ADD CONSTRAINT `vili_invoice_fk` FOREIGN KEY (`vendor_invoice_id`) REFERENCES `vendor_invoices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_invoices` ADD CONSTRAINT `vinv_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_invoices` ADD CONSTRAINT `vinv_job_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_invoices` ADD CONSTRAINT `vinv_vendor_fk` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_invoices` ADD CONSTRAINT `vinv_assignment_fk` FOREIGN KEY (`assignment_id`) REFERENCES `job_vendor_assignments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_invoices` ADD CONSTRAINT `vinv_approved_by_fk` FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_invoices` ADD CONSTRAINT `vinv_created_by_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `vili_tenant_invoice_idx` ON `vendor_invoice_line_items` (`tenant_id`,`vendor_invoice_id`);--> statement-breakpoint
CREATE INDEX `vinv_tenant_job_idx` ON `vendor_invoices` (`tenant_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `vinv_tenant_vendor_idx` ON `vendor_invoices` (`tenant_id`,`vendor_id`);--> statement-breakpoint
CREATE INDEX `vinv_tenant_status_idx` ON `vendor_invoices` (`tenant_id`,`status`);