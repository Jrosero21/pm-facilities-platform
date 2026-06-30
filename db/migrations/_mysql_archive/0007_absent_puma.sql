CREATE TABLE `job_statuses` (
	`id` varchar(36) NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` varchar(255),
	`code` varchar(32) NOT NULL,
	`category` enum('open','in_progress','on_hold','completed','cancelled') NOT NULL,
	`sort_order` int NOT NULL,
	`is_terminal` boolean NOT NULL DEFAULT false,
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `job_statuses_id` PRIMARY KEY(`id`),
	CONSTRAINT `job_statuses_code_unique` UNIQUE(`code`),
	CONSTRAINT `job_statuses_name_unique` UNIQUE(`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `priorities` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` varchar(255),
	`code` varchar(32) NOT NULL,
	`rank` int NOT NULL,
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `priorities_id` PRIMARY KEY(`id`),
	CONSTRAINT `priorities_tenant_code_unique` UNIQUE(`tenant_id`,`code`),
	CONSTRAINT `priorities_tenant_name_unique` UNIQUE(`tenant_id`,`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `job_statuses` ADD CONSTRAINT `job_statuses_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `priorities` ADD CONSTRAINT `priorities_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `priorities` ADD CONSTRAINT `priorities_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `job_statuses_status_idx` ON `job_statuses` (`status`);--> statement-breakpoint
CREATE INDEX `priorities_tenant_idx` ON `priorities` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `priorities_status_idx` ON `priorities` (`status`);