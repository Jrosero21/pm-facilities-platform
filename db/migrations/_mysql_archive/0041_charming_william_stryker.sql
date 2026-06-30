CREATE TABLE `snow_service_logs` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`snow_dispatch_id` varchar(36) NOT NULL,
	`serviced_at` timestamp,
	`photo_refs` json,
	`gps_lat` decimal(10,7),
	`gps_lng` decimal(10,7),
	`notes` text,
	`logged_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `snow_service_logs_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `snow_weather_observations` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`snow_program_id` varchar(36),
	`observed_at` timestamp NOT NULL DEFAULT (now()),
	`source` varchar(64) NOT NULL DEFAULT 'manual',
	`snow_depth` decimal(6,2),
	`temperature` decimal(6,2),
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `snow_weather_observations_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `snow_service_logs` ADD CONSTRAINT `fk_slog_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `snow_service_logs` ADD CONSTRAINT `fk_slog_dispatch` FOREIGN KEY (`snow_dispatch_id`) REFERENCES `snow_dispatches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `snow_service_logs` ADD CONSTRAINT `fk_slog_logged_by` FOREIGN KEY (`logged_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `snow_weather_observations` ADD CONSTRAINT `fk_swobs_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `snow_weather_observations` ADD CONSTRAINT `fk_swobs_program` FOREIGN KEY (`snow_program_id`) REFERENCES `snow_programs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `snow_service_logs_tenant_idx` ON `snow_service_logs` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `snow_service_logs_dispatch_idx` ON `snow_service_logs` (`snow_dispatch_id`);--> statement-breakpoint
CREATE INDEX `snow_service_logs_logged_by_idx` ON `snow_service_logs` (`logged_by_user_id`);--> statement-breakpoint
CREATE INDEX `snow_weather_observations_tenant_idx` ON `snow_weather_observations` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `snow_weather_observations_program_idx` ON `snow_weather_observations` (`snow_program_id`);--> statement-breakpoint
ALTER TABLE `snow_events` ADD CONSTRAINT `fk_sevent_weather` FOREIGN KEY (`snow_weather_observation_id`) REFERENCES `snow_weather_observations`(`id`) ON DELETE set null ON UPDATE no action;