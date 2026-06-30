CREATE TABLE `external_location_mappings` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`external_system_id` varchar(36) NOT NULL,
	`external_code` varchar(255) NOT NULL,
	`client_location_id` varchar(36) NOT NULL,
	`direction` enum('inbound','outbound','both') NOT NULL DEFAULT 'both',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `external_location_mappings_id` PRIMARY KEY(`id`),
	CONSTRAINT `external_location_mappings_system_code_unique` UNIQUE(`external_system_id`,`external_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `external_location_mappings` ADD CONSTRAINT `elm_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_location_mappings` ADD CONSTRAINT `elm_system_fk` FOREIGN KEY (`external_system_id`) REFERENCES `external_systems`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_location_mappings` ADD CONSTRAINT `elm_location_fk` FOREIGN KEY (`client_location_id`) REFERENCES `client_locations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `external_location_mappings_tenant_idx` ON `external_location_mappings` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `external_location_mappings_system_idx` ON `external_location_mappings` (`external_system_id`);--> statement-breakpoint
CREATE INDEX `external_location_mappings_location_idx` ON `external_location_mappings` (`client_location_id`);