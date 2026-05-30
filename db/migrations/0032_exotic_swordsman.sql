CREATE TABLE `external_client_mappings` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`external_system_id` varchar(36) NOT NULL,
	`external_code` varchar(255) NOT NULL,
	`client_id` varchar(36) NOT NULL,
	`direction` enum('inbound','outbound','both') NOT NULL DEFAULT 'both',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `external_client_mappings_id` PRIMARY KEY(`id`),
	CONSTRAINT `external_client_mappings_system_code_unique` UNIQUE(`external_system_id`,`external_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `external_location_mappings` DROP INDEX `external_location_mappings_system_code_unique`;--> statement-breakpoint
ALTER TABLE `external_location_mappings` ADD `client_id` varchar(36) NOT NULL;--> statement-breakpoint
ALTER TABLE `external_location_mappings` ADD CONSTRAINT `external_location_mappings_system_client_code_unique` UNIQUE(`external_system_id`,`client_id`,`external_code`);--> statement-breakpoint
ALTER TABLE `external_client_mappings` ADD CONSTRAINT `ecm_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_client_mappings` ADD CONSTRAINT `ecm_system_fk` FOREIGN KEY (`external_system_id`) REFERENCES `external_systems`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_client_mappings` ADD CONSTRAINT `ecm_client_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `external_client_mappings_tenant_idx` ON `external_client_mappings` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `external_client_mappings_system_idx` ON `external_client_mappings` (`external_system_id`);--> statement-breakpoint
CREATE INDEX `external_client_mappings_client_idx` ON `external_client_mappings` (`client_id`);--> statement-breakpoint
ALTER TABLE `external_location_mappings` ADD CONSTRAINT `elm_client_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `external_location_mappings_client_idx` ON `external_location_mappings` (`client_id`);