CREATE TABLE `client_invoice_line_items` (
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
	`markup_percent` decimal(6,3),
	`markup_amount` decimal(12,2) NOT NULL DEFAULT '0',
	`client_invoice_id` varchar(36) NOT NULL,
	CONSTRAINT `client_invoice_line_items_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `client_invoices` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`client_id` varchar(36) NOT NULL,
	`invoice_number` varchar(128),
	`sequence_number` int,
	`is_final` boolean NOT NULL DEFAULT false,
	`status` enum('draft','sent','void') NOT NULL DEFAULT 'draft',
	`payment_status` enum('unpaid','partially_paid','paid') NOT NULL DEFAULT 'unpaid',
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`subtotal` decimal(12,2) NOT NULL DEFAULT '0',
	`markup_total` decimal(12,2) NOT NULL DEFAULT '0',
	`tax_total` decimal(14,2) NOT NULL DEFAULT '0',
	`total` decimal(12,2) NOT NULL DEFAULT '0',
	`payment_terms_days` int,
	`issued_at` datetime,
	`due_at` datetime,
	`issued_by_user_id` varchar(36),
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_invoices_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `client_invoice_line_items` ADD CONSTRAINT `cili_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_invoice_line_items` ADD CONSTRAINT `cili_invoice_fk` FOREIGN KEY (`client_invoice_id`) REFERENCES `client_invoices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_invoices` ADD CONSTRAINT `cinv_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_invoices` ADD CONSTRAINT `cinv_job_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_invoices` ADD CONSTRAINT `cinv_client_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_invoices` ADD CONSTRAINT `cinv_issued_by_fk` FOREIGN KEY (`issued_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_invoices` ADD CONSTRAINT `cinv_created_by_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `cili_tenant_invoice_idx` ON `client_invoice_line_items` (`tenant_id`,`client_invoice_id`);--> statement-breakpoint
CREATE INDEX `cinv_tenant_job_idx` ON `client_invoices` (`tenant_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `cinv_tenant_client_idx` ON `client_invoices` (`tenant_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `cinv_tenant_status_idx` ON `client_invoices` (`tenant_id`,`status`);