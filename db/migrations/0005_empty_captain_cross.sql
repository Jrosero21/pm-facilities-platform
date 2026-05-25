CREATE TABLE `vendor_service_areas` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`vendor_id` varchar(36) NOT NULL,
	`vendor_location_id` varchar(36),
	`area_type` enum('radius','postal_code','city','county','state','national') NOT NULL,
	`area_label` varchar(120),
	`center_latitude` decimal(10,7),
	`center_longitude` decimal(10,7),
	`radius_miles` decimal(6,2),
	`postal_code` varchar(32),
	`city` varchar(128),
	`county_name` varchar(128),
	`state_code` varchar(8),
	`country_code` varchar(2) NOT NULL DEFAULT 'US',
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendor_service_areas_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `vendor_trade_coverage` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`vendor_id` varchar(36) NOT NULL,
	`trade_id` varchar(36) NOT NULL,
	`vendor_location_id` varchar(36),
	`is_primary` boolean NOT NULL DEFAULT false,
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendor_trade_coverage_id` PRIMARY KEY(`id`),
	CONSTRAINT `vtc_vendor_trade_location_unique` UNIQUE(`vendor_id`,`trade_id`,`vendor_location_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `vendor_service_areas` ADD CONSTRAINT `vendor_service_areas_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_service_areas` ADD CONSTRAINT `vendor_service_areas_vendor_id_vendors_id_fk` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_service_areas` ADD CONSTRAINT `vendor_service_areas_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_service_areas` ADD CONSTRAINT `vsa_location_fk` FOREIGN KEY (`vendor_location_id`) REFERENCES `vendor_locations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_trade_coverage` ADD CONSTRAINT `vendor_trade_coverage_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_trade_coverage` ADD CONSTRAINT `vendor_trade_coverage_vendor_id_vendors_id_fk` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_trade_coverage` ADD CONSTRAINT `vendor_trade_coverage_trade_id_trades_id_fk` FOREIGN KEY (`trade_id`) REFERENCES `trades`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_trade_coverage` ADD CONSTRAINT `vendor_trade_coverage_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_trade_coverage` ADD CONSTRAINT `vtc_location_fk` FOREIGN KEY (`vendor_location_id`) REFERENCES `vendor_locations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `vsa_tenant_vendor_idx` ON `vendor_service_areas` (`tenant_id`,`vendor_id`);--> statement-breakpoint
CREATE INDEX `vsa_tenant_type_postal_idx` ON `vendor_service_areas` (`tenant_id`,`area_type`,`postal_code`);--> statement-breakpoint
CREATE INDEX `vsa_tenant_type_state_idx` ON `vendor_service_areas` (`tenant_id`,`area_type`,`state_code`);--> statement-breakpoint
CREATE INDEX `vsa_tenant_type_city_state_idx` ON `vendor_service_areas` (`tenant_id`,`area_type`,`city`,`state_code`);--> statement-breakpoint
CREATE INDEX `vtc_tenant_vendor_idx` ON `vendor_trade_coverage` (`tenant_id`,`vendor_id`);