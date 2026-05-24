CREATE TABLE `client_locations` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`client_id` varchar(36) NOT NULL,
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
	CONSTRAINT `client_locations_id` PRIMARY KEY(`id`),
	CONSTRAINT `client_locations_client_code_unique` UNIQUE(`client_id`,`location_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`client_code` varchar(64),
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clients_id` PRIMARY KEY(`id`),
	CONSTRAINT `clients_tenant_name_unique` UNIQUE(`tenant_id`,`name`),
	CONSTRAINT `clients_tenant_code_unique` UNIQUE(`tenant_id`,`client_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `client_locations` ADD CONSTRAINT `client_locations_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_locations` ADD CONSTRAINT `client_locations_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_locations` ADD CONSTRAINT `client_locations_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clients` ADD CONSTRAINT `clients_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clients` ADD CONSTRAINT `clients_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `client_locations_tenant_idx` ON `client_locations` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `client_locations_client_idx` ON `client_locations` (`client_id`);--> statement-breakpoint
CREATE INDEX `client_locations_status_idx` ON `client_locations` (`status`);--> statement-breakpoint
CREATE INDEX `clients_tenant_idx` ON `clients` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `clients_status_idx` ON `clients` (`status`);