CREATE TABLE `snow_programs` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`client_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`default_problem_description` text NOT NULL,
	`default_primary_trade_id` varchar(36),
	`default_priority_id` varchar(36),
	`auto_dispatch` boolean NOT NULL DEFAULT false,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `snow_programs_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `snow_service_triggers` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`snow_program_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`trigger_type` varchar(32) NOT NULL DEFAULT 'manual',
	`threshold_value` decimal(6,2),
	`threshold_unit` varchar(16),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `snow_service_triggers_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `snow_sites` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`snow_program_id` varchar(36) NOT NULL,
	`client_location_id` varchar(36) NOT NULL,
	`plow_priority` int,
	`site_notes` text,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `snow_sites_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `snow_programs` ADD CONSTRAINT `fk_sprog_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `snow_programs` ADD CONSTRAINT `fk_sprog_client` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `snow_programs` ADD CONSTRAINT `fk_sprog_trade` FOREIGN KEY (`default_primary_trade_id`) REFERENCES `trades`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `snow_programs` ADD CONSTRAINT `fk_sprog_priority` FOREIGN KEY (`default_priority_id`) REFERENCES `priorities`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `snow_programs` ADD CONSTRAINT `fk_sprog_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `snow_service_triggers` ADD CONSTRAINT `fk_strig_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `snow_service_triggers` ADD CONSTRAINT `fk_strig_program` FOREIGN KEY (`snow_program_id`) REFERENCES `snow_programs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `snow_sites` ADD CONSTRAINT `fk_ssite_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `snow_sites` ADD CONSTRAINT `fk_ssite_program` FOREIGN KEY (`snow_program_id`) REFERENCES `snow_programs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `snow_sites` ADD CONSTRAINT `fk_ssite_location` FOREIGN KEY (`client_location_id`) REFERENCES `client_locations`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `snow_programs_tenant_idx` ON `snow_programs` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `snow_programs_tenant_client_idx` ON `snow_programs` (`tenant_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `snow_programs_trade_idx` ON `snow_programs` (`default_primary_trade_id`);--> statement-breakpoint
CREATE INDEX `snow_programs_priority_idx` ON `snow_programs` (`default_priority_id`);--> statement-breakpoint
CREATE INDEX `snow_programs_created_by_idx` ON `snow_programs` (`created_by_user_id`);--> statement-breakpoint
CREATE INDEX `snow_service_triggers_tenant_idx` ON `snow_service_triggers` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `snow_service_triggers_program_idx` ON `snow_service_triggers` (`snow_program_id`);--> statement-breakpoint
CREATE INDEX `snow_sites_tenant_idx` ON `snow_sites` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `snow_sites_program_idx` ON `snow_sites` (`snow_program_id`);--> statement-breakpoint
CREATE INDEX `snow_sites_location_idx` ON `snow_sites` (`client_location_id`);