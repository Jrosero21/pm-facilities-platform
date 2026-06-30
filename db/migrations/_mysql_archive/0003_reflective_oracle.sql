CREATE TABLE `trades` (
	`id` varchar(36) NOT NULL,
	`name` varchar(128) NOT NULL,
	`code` varchar(32) NOT NULL,
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trades_id` PRIMARY KEY(`id`),
	CONSTRAINT `trades_name_unique` UNIQUE(`name`),
	CONSTRAINT `trades_code_unique` UNIQUE(`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `vendor_contacts` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`vendor_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`title` varchar(128),
	`email` varchar(255),
	`phone` varchar(32),
	`is_primary` boolean NOT NULL DEFAULT false,
	`notes` text,
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendor_contacts_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `vendor_locations` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`vendor_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`location_code` varchar(64),
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`address_line1` varchar(255) NOT NULL,
	`address_line2` varchar(255),
	`city` varchar(128) NOT NULL,
	`state_province` varchar(128) NOT NULL,
	`postal_code` varchar(32) NOT NULL,
	`country` varchar(2) NOT NULL DEFAULT 'US',
	`latitude` decimal(10,7),
	`longitude` decimal(10,7),
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendor_locations_id` PRIMARY KEY(`id`),
	CONSTRAINT `vendor_locations_vendor_code_unique` UNIQUE(`vendor_id`,`location_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `vendors` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`legal_name` varchar(255),
	`vendor_code` varchar(64),
	`vendor_type` enum('local','regional','national') NOT NULL DEFAULT 'local',
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`main_phone` varchar(32),
	`main_email` varchar(255),
	`website` varchar(255),
	`tax_id` varchar(64),
	`notes` text,
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendors_id` PRIMARY KEY(`id`),
	CONSTRAINT `vendors_tenant_name_unique` UNIQUE(`tenant_id`,`name`),
	CONSTRAINT `vendors_tenant_code_unique` UNIQUE(`tenant_id`,`vendor_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `vendor_contacts` ADD CONSTRAINT `vendor_contacts_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_contacts` ADD CONSTRAINT `vendor_contacts_vendor_id_vendors_id_fk` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_contacts` ADD CONSTRAINT `vendor_contacts_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_locations` ADD CONSTRAINT `vendor_locations_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_locations` ADD CONSTRAINT `vendor_locations_vendor_id_vendors_id_fk` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_locations` ADD CONSTRAINT `vendor_locations_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendors` ADD CONSTRAINT `vendors_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendors` ADD CONSTRAINT `vendors_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `trades_status_idx` ON `trades` (`status`);--> statement-breakpoint
CREATE INDEX `vendor_contacts_tenant_idx` ON `vendor_contacts` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `vendor_contacts_vendor_idx` ON `vendor_contacts` (`vendor_id`);--> statement-breakpoint
CREATE INDEX `vendor_locations_tenant_idx` ON `vendor_locations` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `vendor_locations_vendor_idx` ON `vendor_locations` (`vendor_id`);--> statement-breakpoint
CREATE INDEX `vendor_locations_status_idx` ON `vendor_locations` (`status`);--> statement-breakpoint
CREATE INDEX `vendors_tenant_idx` ON `vendors` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `vendors_status_idx` ON `vendors` (`status`);--> statement-breakpoint
CREATE INDEX `vendors_type_idx` ON `vendors` (`vendor_type`);