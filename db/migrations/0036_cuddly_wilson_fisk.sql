CREATE TABLE `pm_programs` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`client_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`primary_trade_id` varchar(36),
	`priority_id` varchar(36),
	`scope_of_work` text NOT NULL,
	`auto_generate` boolean NOT NULL DEFAULT true,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pm_programs_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `pm_schedule_locations` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`pm_schedule_id` varchar(36) NOT NULL,
	`client_location_id` varchar(36) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pm_schedule_locations_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `pm_schedules` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`pm_program_id` varchar(36) NOT NULL,
	`frequency` enum('day','week','month') NOT NULL,
	`interval_count` int NOT NULL DEFAULT 1,
	`next_due_at` datetime NOT NULL,
	`last_generated_at` datetime,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pm_schedules_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `pm_programs` ADD CONSTRAINT `fk_pm_programs_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pm_programs` ADD CONSTRAINT `fk_pm_programs_client` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pm_programs` ADD CONSTRAINT `fk_pm_programs_trade` FOREIGN KEY (`primary_trade_id`) REFERENCES `trades`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pm_programs` ADD CONSTRAINT `fk_pm_programs_priority` FOREIGN KEY (`priority_id`) REFERENCES `priorities`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pm_programs` ADD CONSTRAINT `fk_pm_programs_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pm_schedule_locations` ADD CONSTRAINT `fk_pmsl_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pm_schedule_locations` ADD CONSTRAINT `fk_pmsl_schedule` FOREIGN KEY (`pm_schedule_id`) REFERENCES `pm_schedules`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pm_schedule_locations` ADD CONSTRAINT `fk_pmsl_location` FOREIGN KEY (`client_location_id`) REFERENCES `client_locations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pm_schedules` ADD CONSTRAINT `fk_pm_schedules_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pm_schedules` ADD CONSTRAINT `fk_pm_schedules_program` FOREIGN KEY (`pm_program_id`) REFERENCES `pm_programs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `pm_programs_tenant_idx` ON `pm_programs` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `pm_programs_tenant_client_idx` ON `pm_programs` (`tenant_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `pm_programs_trade_idx` ON `pm_programs` (`primary_trade_id`);--> statement-breakpoint
CREATE INDEX `pm_programs_priority_idx` ON `pm_programs` (`priority_id`);--> statement-breakpoint
CREATE INDEX `pm_programs_created_by_idx` ON `pm_programs` (`created_by_user_id`);--> statement-breakpoint
CREATE INDEX `pm_schedule_locations_tenant_idx` ON `pm_schedule_locations` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `pm_schedule_locations_schedule_idx` ON `pm_schedule_locations` (`pm_schedule_id`);--> statement-breakpoint
CREATE INDEX `pm_schedule_locations_location_idx` ON `pm_schedule_locations` (`client_location_id`);--> statement-breakpoint
CREATE INDEX `pm_schedules_tenant_idx` ON `pm_schedules` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `pm_schedules_program_idx` ON `pm_schedules` (`pm_program_id`);--> statement-breakpoint
CREATE INDEX `pm_schedules_due_idx` ON `pm_schedules` (`is_active`,`next_due_at`);