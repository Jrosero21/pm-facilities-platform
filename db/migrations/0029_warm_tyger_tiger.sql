CREATE TABLE `external_priority_mappings` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`external_system_id` varchar(36) NOT NULL,
	`external_code` varchar(128) NOT NULL,
	`priority_id` varchar(36) NOT NULL,
	`direction` enum('inbound','outbound','both') NOT NULL DEFAULT 'inbound',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `external_priority_mappings_id` PRIMARY KEY(`id`),
	CONSTRAINT `external_priority_mappings_tenant_system_code_dir_unique` UNIQUE(`tenant_id`,`external_system_id`,`external_code`,`direction`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `external_status_mappings` (
	`id` varchar(36) NOT NULL,
	`external_system_id` varchar(36) NOT NULL,
	`external_code` varchar(128) NOT NULL,
	`job_status_id` varchar(36) NOT NULL,
	`direction` enum('inbound','outbound','both') NOT NULL DEFAULT 'inbound',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `external_status_mappings_id` PRIMARY KEY(`id`),
	CONSTRAINT `external_status_mappings_system_code_dir_unique` UNIQUE(`external_system_id`,`external_code`,`direction`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `external_trade_mappings` (
	`id` varchar(36) NOT NULL,
	`external_system_id` varchar(36) NOT NULL,
	`external_code` varchar(128) NOT NULL,
	`trade_id` varchar(36) NOT NULL,
	`direction` enum('inbound','outbound','both') NOT NULL DEFAULT 'inbound',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `external_trade_mappings_id` PRIMARY KEY(`id`),
	CONSTRAINT `external_trade_mappings_system_code_dir_unique` UNIQUE(`external_system_id`,`external_code`,`direction`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `external_priority_mappings` ADD CONSTRAINT `external_priority_mappings_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_priority_mappings` ADD CONSTRAINT `external_priority_mappings_priority_id_priorities_id_fk` FOREIGN KEY (`priority_id`) REFERENCES `priorities`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_priority_mappings` ADD CONSTRAINT `epm_system_fk` FOREIGN KEY (`external_system_id`) REFERENCES `external_systems`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_status_mappings` ADD CONSTRAINT `external_status_mappings_job_status_id_job_statuses_id_fk` FOREIGN KEY (`job_status_id`) REFERENCES `job_statuses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_status_mappings` ADD CONSTRAINT `esm_system_fk` FOREIGN KEY (`external_system_id`) REFERENCES `external_systems`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_trade_mappings` ADD CONSTRAINT `external_trade_mappings_trade_id_trades_id_fk` FOREIGN KEY (`trade_id`) REFERENCES `trades`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_trade_mappings` ADD CONSTRAINT `etm_system_fk` FOREIGN KEY (`external_system_id`) REFERENCES `external_systems`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `external_priority_mappings_tenant_idx` ON `external_priority_mappings` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `external_priority_mappings_system_idx` ON `external_priority_mappings` (`external_system_id`);--> statement-breakpoint
CREATE INDEX `external_priority_mappings_priority_idx` ON `external_priority_mappings` (`priority_id`);--> statement-breakpoint
CREATE INDEX `external_status_mappings_system_idx` ON `external_status_mappings` (`external_system_id`);--> statement-breakpoint
CREATE INDEX `external_status_mappings_status_idx` ON `external_status_mappings` (`job_status_id`);--> statement-breakpoint
CREATE INDEX `external_trade_mappings_system_idx` ON `external_trade_mappings` (`external_system_id`);--> statement-breakpoint
CREATE INDEX `external_trade_mappings_trade_idx` ON `external_trade_mappings` (`trade_id`);