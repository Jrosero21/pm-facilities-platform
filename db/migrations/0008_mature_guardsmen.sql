CREATE TABLE `jobs` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`job_number` int unsigned NOT NULL,
	`client_id` varchar(36) NOT NULL,
	`client_location_id` varchar(36) NOT NULL,
	`primary_trade_id` varchar(36),
	`priority_id` varchar(36),
	`current_status_id` varchar(36) NOT NULL,
	`source_type` enum('manual','internal_client_portal','external_client_portal','email_ingestion','forwarded_email','api','preventative_maintenance','snow_event') NOT NULL DEFAULT 'manual',
	`source_external_id` varchar(255),
	`problem_description` text NOT NULL,
	`scope_of_work` text,
	`generated_scope_of_work` text,
	`approved_scope_of_work` text,
	`scope_generation_status` varchar(32) NOT NULL DEFAULT 'not_started',
	`not_to_exceed_amount` decimal(12,2),
	`scheduled_start_at` datetime,
	`scheduled_end_at` datetime,
	`due_at` datetime,
	`completed_at` datetime,
	`closed_at` datetime,
	`is_archived` boolean NOT NULL DEFAULT false,
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `jobs_tenant_number_unique` UNIQUE(`tenant_id`,`job_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `tenant_job_sequences` (
	`tenant_id` varchar(36) NOT NULL,
	`next_number` int unsigned NOT NULL DEFAULT 1,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenant_job_sequences_tenant_id` PRIMARY KEY(`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `job_events` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`event_type` varchar(64) NOT NULL,
	`actor_user_id` varchar(36),
	`summary` varchar(500) NOT NULL,
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `job_events_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `job_priority_history` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`from_priority_id` varchar(36),
	`to_priority_id` varchar(36) NOT NULL,
	`changed_by_user_id` varchar(36),
	`note` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `job_priority_history_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `job_status_history` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`from_status_id` varchar(36),
	`to_status_id` varchar(36) NOT NULL,
	`changed_by_user_id` varchar(36),
	`note` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `job_status_history_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `job_trade_history` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`from_trade_id` varchar(36),
	`to_trade_id` varchar(36) NOT NULL,
	`changed_by_user_id` varchar(36),
	`note` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `job_trade_history_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `job_attachments` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`title` varchar(255) NOT NULL,
	`attachment_type` enum('photo','document','signature','invoice','quote','other') NOT NULL DEFAULT 'other',
	`file_url` varchar(1024),
	`file_size_bytes` bigint,
	`file_mime_type` varchar(127),
	`visibility` enum('internal_only','vendor_visible','client_visible','client_and_vendor_visible','requires_review') NOT NULL DEFAULT 'internal_only',
	`uploaded_by_user_id` varchar(36),
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `job_attachments_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `job_contacts` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`title` varchar(128),
	`email` varchar(255),
	`phone` varchar(32),
	`is_primary` boolean NOT NULL DEFAULT false,
	`notes` text,
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `job_contacts_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `job_notes` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`body` text NOT NULL,
	`visibility` enum('internal_only','vendor_visible','client_visible','client_and_vendor_visible','requires_review') NOT NULL DEFAULT 'internal_only',
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `job_notes_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `jobs` ADD CONSTRAINT `jobs_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `jobs` ADD CONSTRAINT `jobs_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `jobs` ADD CONSTRAINT `jobs_client_location_id_client_locations_id_fk` FOREIGN KEY (`client_location_id`) REFERENCES `client_locations`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `jobs` ADD CONSTRAINT `jobs_primary_trade_id_trades_id_fk` FOREIGN KEY (`primary_trade_id`) REFERENCES `trades`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `jobs` ADD CONSTRAINT `jobs_priority_id_priorities_id_fk` FOREIGN KEY (`priority_id`) REFERENCES `priorities`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `jobs` ADD CONSTRAINT `jobs_current_status_id_job_statuses_id_fk` FOREIGN KEY (`current_status_id`) REFERENCES `job_statuses`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `jobs` ADD CONSTRAINT `jobs_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_job_sequences` ADD CONSTRAINT `tenant_job_sequences_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_events` ADD CONSTRAINT `job_events_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_events` ADD CONSTRAINT `job_events_job_id_jobs_id_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_events` ADD CONSTRAINT `job_events_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_priority_history` ADD CONSTRAINT `job_priority_history_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_priority_history` ADD CONSTRAINT `job_priority_history_job_id_jobs_id_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_priority_history` ADD CONSTRAINT `job_priority_history_from_priority_id_priorities_id_fk` FOREIGN KEY (`from_priority_id`) REFERENCES `priorities`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_priority_history` ADD CONSTRAINT `job_priority_history_to_priority_id_priorities_id_fk` FOREIGN KEY (`to_priority_id`) REFERENCES `priorities`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_priority_history` ADD CONSTRAINT `job_priority_history_changed_by_user_id_users_id_fk` FOREIGN KEY (`changed_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_status_history` ADD CONSTRAINT `job_status_history_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_status_history` ADD CONSTRAINT `job_status_history_job_id_jobs_id_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_status_history` ADD CONSTRAINT `job_status_history_from_status_id_job_statuses_id_fk` FOREIGN KEY (`from_status_id`) REFERENCES `job_statuses`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_status_history` ADD CONSTRAINT `job_status_history_to_status_id_job_statuses_id_fk` FOREIGN KEY (`to_status_id`) REFERENCES `job_statuses`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_status_history` ADD CONSTRAINT `job_status_history_changed_by_user_id_users_id_fk` FOREIGN KEY (`changed_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_trade_history` ADD CONSTRAINT `job_trade_history_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_trade_history` ADD CONSTRAINT `job_trade_history_job_id_jobs_id_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_trade_history` ADD CONSTRAINT `job_trade_history_from_trade_id_trades_id_fk` FOREIGN KEY (`from_trade_id`) REFERENCES `trades`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_trade_history` ADD CONSTRAINT `job_trade_history_to_trade_id_trades_id_fk` FOREIGN KEY (`to_trade_id`) REFERENCES `trades`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_trade_history` ADD CONSTRAINT `job_trade_history_changed_by_user_id_users_id_fk` FOREIGN KEY (`changed_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_attachments` ADD CONSTRAINT `job_attachments_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_attachments` ADD CONSTRAINT `job_attachments_job_id_jobs_id_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_attachments` ADD CONSTRAINT `job_attachments_uploaded_by_user_id_users_id_fk` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_contacts` ADD CONSTRAINT `job_contacts_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_contacts` ADD CONSTRAINT `job_contacts_job_id_jobs_id_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_contacts` ADD CONSTRAINT `job_contacts_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_notes` ADD CONSTRAINT `job_notes_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_notes` ADD CONSTRAINT `job_notes_job_id_jobs_id_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_notes` ADD CONSTRAINT `job_notes_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `jobs_tenant_status_idx` ON `jobs` (`tenant_id`,`current_status_id`);--> statement-breakpoint
CREATE INDEX `jobs_tenant_client_idx` ON `jobs` (`tenant_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `jobs_tenant_location_idx` ON `jobs` (`tenant_id`,`client_location_id`);--> statement-breakpoint
CREATE INDEX `jobs_tenant_trade_idx` ON `jobs` (`tenant_id`,`primary_trade_id`);--> statement-breakpoint
CREATE INDEX `jobs_tenant_priority_idx` ON `jobs` (`tenant_id`,`priority_id`);--> statement-breakpoint
CREATE INDEX `jobs_tenant_created_idx` ON `jobs` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `job_events_job_created_idx` ON `job_events` (`job_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `job_events_tenant_job_idx` ON `job_events` (`tenant_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `job_priority_history_tenant_job_idx` ON `job_priority_history` (`tenant_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `job_status_history_tenant_job_idx` ON `job_status_history` (`tenant_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `job_trade_history_tenant_job_idx` ON `job_trade_history` (`tenant_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `job_attachments_tenant_job_idx` ON `job_attachments` (`tenant_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `job_contacts_tenant_job_idx` ON `job_contacts` (`tenant_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `job_notes_tenant_job_idx` ON `job_notes` (`tenant_id`,`job_id`);