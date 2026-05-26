CREATE TABLE `portal_update_queue` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`target_portal` enum('client_portal','vendor_portal','external_portal') NOT NULL,
	`source_type` varchar(32) NOT NULL,
	`source_id` varchar(36) NOT NULL,
	`queue_status` enum('queued','processing','sent','failed','cancelled') NOT NULL DEFAULT 'queued',
	`attempts` int NOT NULL DEFAULT 0,
	`scheduled_at` datetime,
	`processed_at` datetime,
	`last_error` text,
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `portal_update_queue_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `vendor_update_logs` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`vendor_id` varchar(36),
	`content` text NOT NULL,
	`received_at` datetime NOT NULL,
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendor_update_logs_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `portal_update_queue` ADD CONSTRAINT `puq_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `portal_update_queue` ADD CONSTRAINT `puq_job_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_update_logs` ADD CONSTRAINT `vul_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_update_logs` ADD CONSTRAINT `vul_job_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_update_logs` ADD CONSTRAINT `vul_vendor_fk` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `puq_tenant_status_idx` ON `portal_update_queue` (`tenant_id`,`queue_status`);--> statement-breakpoint
CREATE INDEX `puq_source_idx` ON `portal_update_queue` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `vul_tenant_job_idx` ON `vendor_update_logs` (`tenant_id`,`job_id`);