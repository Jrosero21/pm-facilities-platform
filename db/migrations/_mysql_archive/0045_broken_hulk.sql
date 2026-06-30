CREATE TABLE `location_blocked_vendors` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`client_id` varchar(36) NOT NULL,
	`client_location_id` varchar(36),
	`vendor_id` varchar(36) NOT NULL,
	`reason` varchar(500),
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `location_blocked_vendors_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `location_preferred_vendors` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`client_location_id` varchar(36) NOT NULL,
	`trade_id` varchar(36) NOT NULL,
	`vendor_id` varchar(36) NOT NULL,
	`priority` int NOT NULL,
	`notes` varchar(500),
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `location_preferred_vendors_id` PRIMARY KEY(`id`),
	CONSTRAINT `lpv_location_trade_vendor_unique` UNIQUE(`client_location_id`,`trade_id`,`vendor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `location_blocked_vendors` ADD CONSTRAINT `location_blocked_vendors_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `location_blocked_vendors` ADD CONSTRAINT `location_blocked_vendors_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `location_blocked_vendors` ADD CONSTRAINT `location_blocked_vendors_vendor_id_vendors_id_fk` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `location_blocked_vendors` ADD CONSTRAINT `location_blocked_vendors_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `location_blocked_vendors` ADD CONSTRAINT `lbv_location_fk` FOREIGN KEY (`client_location_id`) REFERENCES `client_locations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `location_preferred_vendors` ADD CONSTRAINT `location_preferred_vendors_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `location_preferred_vendors` ADD CONSTRAINT `location_preferred_vendors_trade_id_trades_id_fk` FOREIGN KEY (`trade_id`) REFERENCES `trades`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `location_preferred_vendors` ADD CONSTRAINT `location_preferred_vendors_vendor_id_vendors_id_fk` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `location_preferred_vendors` ADD CONSTRAINT `location_preferred_vendors_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `location_preferred_vendors` ADD CONSTRAINT `lpv_location_fk` FOREIGN KEY (`client_location_id`) REFERENCES `client_locations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `lbv_location_vendor_idx` ON `location_blocked_vendors` (`tenant_id`,`client_location_id`,`vendor_id`);--> statement-breakpoint
CREATE INDEX `lbv_client_vendor_idx` ON `location_blocked_vendors` (`tenant_id`,`client_id`,`vendor_id`);--> statement-breakpoint
CREATE INDEX `lpv_lookup_idx` ON `location_preferred_vendors` (`tenant_id`,`client_location_id`,`trade_id`);