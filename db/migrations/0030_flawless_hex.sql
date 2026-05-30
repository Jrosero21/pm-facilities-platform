CREATE TABLE `external_payload_logs` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`external_system_id` varchar(36) NOT NULL,
	`sync_run_id` varchar(36),
	`direction` enum('inbound','outbound') NOT NULL,
	`external_wo_id` varchar(255),
	`payload` json,
	`received_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `external_payload_logs_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `external_sync_events` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`sync_run_id` varchar(36) NOT NULL,
	`external_wo_id` varchar(255),
	`job_id` varchar(36),
	`event_type` varchar(64) NOT NULL,
	`outcome` enum('ok','skipped','error') NOT NULL,
	`message` text,
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `external_sync_events_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `external_sync_runs` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`external_system_id` varchar(36) NOT NULL,
	`run_type` varchar(64) NOT NULL,
	`status` enum('running','succeeded','failed','partial') NOT NULL DEFAULT 'running',
	`started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`finished_at` datetime,
	`counts` json,
	`error_summary` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `external_sync_runs_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `external_work_order_links` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`external_system_id` varchar(36) NOT NULL,
	`external_wo_id` varchar(255) NOT NULL,
	`job_id` varchar(36),
	`link_status` enum('active','unlinked') NOT NULL DEFAULT 'active',
	`last_synced_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `external_work_order_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `external_work_order_links_system_wo_unique` UNIQUE(`external_system_id`,`external_wo_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `external_payload_logs` ADD CONSTRAINT `epl_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_payload_logs` ADD CONSTRAINT `epl_system_fk` FOREIGN KEY (`external_system_id`) REFERENCES `external_systems`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_payload_logs` ADD CONSTRAINT `epl_run_fk` FOREIGN KEY (`sync_run_id`) REFERENCES `external_sync_runs`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_sync_events` ADD CONSTRAINT `ese_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_sync_events` ADD CONSTRAINT `ese_run_fk` FOREIGN KEY (`sync_run_id`) REFERENCES `external_sync_runs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_sync_runs` ADD CONSTRAINT `esr_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_sync_runs` ADD CONSTRAINT `esr_system_fk` FOREIGN KEY (`external_system_id`) REFERENCES `external_systems`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_work_order_links` ADD CONSTRAINT `ewol_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_work_order_links` ADD CONSTRAINT `ewol_system_fk` FOREIGN KEY (`external_system_id`) REFERENCES `external_systems`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_work_order_links` ADD CONSTRAINT `ewol_job_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `external_payload_logs_tenant_idx` ON `external_payload_logs` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `external_payload_logs_system_idx` ON `external_payload_logs` (`external_system_id`);--> statement-breakpoint
CREATE INDEX `external_payload_logs_run_idx` ON `external_payload_logs` (`sync_run_id`);--> statement-breakpoint
CREATE INDEX `external_payload_logs_wo_idx` ON `external_payload_logs` (`external_wo_id`);--> statement-breakpoint
CREATE INDEX `external_sync_events_tenant_idx` ON `external_sync_events` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `external_sync_events_run_idx` ON `external_sync_events` (`sync_run_id`);--> statement-breakpoint
CREATE INDEX `external_sync_events_wo_idx` ON `external_sync_events` (`external_wo_id`);--> statement-breakpoint
CREATE INDEX `external_sync_events_job_idx` ON `external_sync_events` (`job_id`);--> statement-breakpoint
CREATE INDEX `external_sync_runs_tenant_idx` ON `external_sync_runs` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `external_sync_runs_system_idx` ON `external_sync_runs` (`external_system_id`);--> statement-breakpoint
CREATE INDEX `external_sync_runs_tenant_status_idx` ON `external_sync_runs` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `external_work_order_links_tenant_idx` ON `external_work_order_links` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `external_work_order_links_system_idx` ON `external_work_order_links` (`external_system_id`);--> statement-breakpoint
CREATE INDEX `external_work_order_links_job_idx` ON `external_work_order_links` (`job_id`);