CREATE TABLE `snow_dispatches` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`snow_event_site_id` varchar(36) NOT NULL,
	`job_id` varchar(36),
	`dispatch_status` enum('staged','spawned','skipped','cancelled') NOT NULL DEFAULT 'staged',
	`skip_reason` text,
	`spawned_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `snow_dispatches_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `snow_event_sites` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`snow_event_id` varchar(36) NOT NULL,
	`snow_site_id` varchar(36) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `snow_event_sites_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `snow_events` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`snow_program_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`event_status` enum('declared','dispatching','complete','cancelled') NOT NULL DEFAULT 'declared',
	`declared_at` timestamp NOT NULL DEFAULT (now()),
	`declared_by_user_id` varchar(36),
	`snow_weather_observation_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `snow_events_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `snow_dispatches` ADD CONSTRAINT `fk_disp_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `snow_dispatches` ADD CONSTRAINT `fk_disp_event_site` FOREIGN KEY (`snow_event_site_id`) REFERENCES `snow_event_sites`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `snow_dispatches` ADD CONSTRAINT `fk_disp_job` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `snow_event_sites` ADD CONSTRAINT `fk_ses_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `snow_event_sites` ADD CONSTRAINT `fk_ses_event` FOREIGN KEY (`snow_event_id`) REFERENCES `snow_events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `snow_event_sites` ADD CONSTRAINT `fk_ses_site` FOREIGN KEY (`snow_site_id`) REFERENCES `snow_sites`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `snow_events` ADD CONSTRAINT `fk_sevent_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `snow_events` ADD CONSTRAINT `fk_sevent_program` FOREIGN KEY (`snow_program_id`) REFERENCES `snow_programs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `snow_events` ADD CONSTRAINT `fk_sevent_declared_by` FOREIGN KEY (`declared_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `snow_dispatches_tenant_idx` ON `snow_dispatches` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `snow_dispatches_event_site_idx` ON `snow_dispatches` (`snow_event_site_id`);--> statement-breakpoint
CREATE INDEX `snow_dispatches_job_idx` ON `snow_dispatches` (`job_id`);--> statement-breakpoint
CREATE INDEX `snow_dispatches_status_idx` ON `snow_dispatches` (`dispatch_status`);--> statement-breakpoint
CREATE INDEX `snow_event_sites_tenant_idx` ON `snow_event_sites` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `snow_event_sites_event_idx` ON `snow_event_sites` (`snow_event_id`);--> statement-breakpoint
CREATE INDEX `snow_event_sites_site_idx` ON `snow_event_sites` (`snow_site_id`);--> statement-breakpoint
CREATE INDEX `snow_events_tenant_idx` ON `snow_events` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `snow_events_program_idx` ON `snow_events` (`snow_program_id`);--> statement-breakpoint
CREATE INDEX `snow_events_status_idx` ON `snow_events` (`event_status`);--> statement-breakpoint
CREATE INDEX `snow_events_declared_by_idx` ON `snow_events` (`declared_by_user_id`);