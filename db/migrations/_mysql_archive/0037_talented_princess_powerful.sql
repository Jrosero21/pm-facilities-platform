CREATE TABLE `pm_assets` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`client_location_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`asset_type` varchar(128),
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pm_assets_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `pm_generation_runs` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`pm_schedule_id` varchar(36) NOT NULL,
	`requested_count` int NOT NULL DEFAULT 0,
	`generated_count` int NOT NULL DEFAULT 0,
	`skipped_count` int NOT NULL DEFAULT 0,
	`run_at` datetime NOT NULL,
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pm_generation_runs_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `pm_visits` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`pm_schedule_id` varchar(36) NOT NULL,
	`client_location_id` varchar(36) NOT NULL,
	`pm_generation_run_id` varchar(36),
	`due_at` datetime NOT NULL,
	`generation_status` enum('generated','skipped','pending_review') NOT NULL,
	`skip_reason` varchar(512),
	`job_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pm_visits_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `pm_assets` ADD CONSTRAINT `fk_pm_assets_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pm_assets` ADD CONSTRAINT `fk_pm_assets_location` FOREIGN KEY (`client_location_id`) REFERENCES `client_locations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pm_generation_runs` ADD CONSTRAINT `fk_pm_gen_runs_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pm_generation_runs` ADD CONSTRAINT `fk_pm_gen_runs_schedule` FOREIGN KEY (`pm_schedule_id`) REFERENCES `pm_schedules`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pm_generation_runs` ADD CONSTRAINT `fk_pm_gen_runs_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pm_visits` ADD CONSTRAINT `fk_pm_visits_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pm_visits` ADD CONSTRAINT `fk_pm_visits_schedule` FOREIGN KEY (`pm_schedule_id`) REFERENCES `pm_schedules`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pm_visits` ADD CONSTRAINT `fk_pm_visits_location` FOREIGN KEY (`client_location_id`) REFERENCES `client_locations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pm_visits` ADD CONSTRAINT `fk_pm_visits_run` FOREIGN KEY (`pm_generation_run_id`) REFERENCES `pm_generation_runs`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pm_visits` ADD CONSTRAINT `fk_pm_visits_job` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `pm_assets_tenant_idx` ON `pm_assets` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `pm_assets_location_idx` ON `pm_assets` (`client_location_id`);--> statement-breakpoint
CREATE INDEX `pm_generation_runs_tenant_idx` ON `pm_generation_runs` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `pm_generation_runs_schedule_idx` ON `pm_generation_runs` (`pm_schedule_id`);--> statement-breakpoint
CREATE INDEX `pm_generation_runs_created_by_idx` ON `pm_generation_runs` (`created_by_user_id`);--> statement-breakpoint
CREATE INDEX `pm_visits_tenant_idx` ON `pm_visits` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `pm_visits_schedule_idx` ON `pm_visits` (`pm_schedule_id`);--> statement-breakpoint
CREATE INDEX `pm_visits_location_idx` ON `pm_visits` (`client_location_id`);--> statement-breakpoint
CREATE INDEX `pm_visits_run_idx` ON `pm_visits` (`pm_generation_run_id`);--> statement-breakpoint
CREATE INDEX `pm_visits_job_idx` ON `pm_visits` (`job_id`);--> statement-breakpoint
CREATE INDEX `pm_visits_tenant_status_idx` ON `pm_visits` (`tenant_id`,`generation_status`);