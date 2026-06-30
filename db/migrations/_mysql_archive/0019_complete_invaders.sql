CREATE TABLE `change_order_approvals` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`change_order_id` varchar(36) NOT NULL,
	`decision` enum('accepted','declined') NOT NULL,
	`approver_user_id` varchar(36),
	`approver_name` varchar(255),
	`decided_at` datetime NOT NULL,
	`notes` text,
	`signature_ref` varchar(1024),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `change_order_approvals_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `change_order_line_items` (
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
	`change_order_id` varchar(36) NOT NULL,
	CONSTRAINT `change_order_line_items_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `change_orders` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`proposal_id` varchar(36),
	`status` enum('draft','submitted','approved','declined','withdrawn') NOT NULL DEFAULT 'draft',
	`scope_delta_snapshot` text,
	`reason` text,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`subtotal` decimal(12,2) NOT NULL DEFAULT '0',
	`markup_total` decimal(12,2) NOT NULL DEFAULT '0',
	`tax_total` decimal(14,2) NOT NULL DEFAULT '0',
	`total` decimal(12,2) NOT NULL DEFAULT '0',
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `change_orders_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `change_order_approvals` ADD CONSTRAINT `coapp_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `change_order_approvals` ADD CONSTRAINT `coapp_co_fk` FOREIGN KEY (`change_order_id`) REFERENCES `change_orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `change_order_approvals` ADD CONSTRAINT `coapp_user_fk` FOREIGN KEY (`approver_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `change_order_line_items` ADD CONSTRAINT `coli_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `change_order_line_items` ADD CONSTRAINT `coli_co_fk` FOREIGN KEY (`change_order_id`) REFERENCES `change_orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `change_orders` ADD CONSTRAINT `co_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `change_orders` ADD CONSTRAINT `co_job_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `change_orders` ADD CONSTRAINT `co_proposal_fk` FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `change_orders` ADD CONSTRAINT `co_created_by_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `coapp_tenant_co_idx` ON `change_order_approvals` (`tenant_id`,`change_order_id`);--> statement-breakpoint
CREATE INDEX `coli_tenant_co_idx` ON `change_order_line_items` (`tenant_id`,`change_order_id`);--> statement-breakpoint
CREATE INDEX `co_tenant_job_idx` ON `change_orders` (`tenant_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `co_tenant_status_idx` ON `change_orders` (`tenant_id`,`status`);