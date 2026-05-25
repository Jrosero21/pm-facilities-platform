CREATE TABLE `job_vendor_assignment_status_history` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`assignment_id` varchar(36) NOT NULL,
	`from_status_id` varchar(36),
	`to_status_id` varchar(36) NOT NULL,
	`changed_by_user_id` varchar(36),
	`note` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `job_vendor_assignment_status_history_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `job_vendor_assignments` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`vendor_id` varchar(36) NOT NULL,
	`vendor_location_id` varchar(36),
	`vendor_contact_id` varchar(36),
	`current_status_id` varchar(36) NOT NULL,
	`agreed_nte_amount` decimal(12,2),
	`scheduled_start_at` datetime,
	`scheduled_end_at` datetime,
	`dispatch_scope` text,
	`matched_trade_id` varchar(36) NOT NULL,
	`matched_trade_was_primary` boolean NOT NULL,
	`tightest_geo_at_dispatch` enum('postal_code','city','state','national') NOT NULL,
	`matched_geo_types_at_dispatch` json NOT NULL,
	`compliance_status_at_dispatch` enum('ok','no_data','expired','non_compliant') NOT NULL,
	`chosen_branch_covered_trade` boolean,
	`sent_at` datetime,
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `job_vendor_assignments_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `dispatch_messages` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`assignment_id` varchar(36) NOT NULL,
	`direction` enum('outbound','inbound') NOT NULL DEFAULT 'outbound',
	`message_type` varchar(64) NOT NULL,
	`subject` varchar(255),
	`body` text NOT NULL,
	`visibility` enum('internal_only','vendor_visible','client_visible','client_and_vendor_visible','requires_review') NOT NULL DEFAULT 'internal_only',
	`sent_by_user_id` varchar(36),
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dispatch_messages_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `vendor_check_ins` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`assignment_id` varchar(36) NOT NULL,
	`occurred_at` datetime NOT NULL,
	`note` varchar(500),
	`recorded_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vendor_check_ins_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `vendor_check_outs` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`assignment_id` varchar(36) NOT NULL,
	`occurred_at` datetime NOT NULL,
	`note` varchar(500),
	`recorded_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vendor_check_outs_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `vendor_eta_confirmations` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`assignment_id` varchar(36) NOT NULL,
	`eta_start_at` datetime NOT NULL,
	`eta_end_at` datetime,
	`note` varchar(500),
	`confirmed_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vendor_eta_confirmations_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `dispatch_assignment_statuses` (
	`id` varchar(36) NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` varchar(255),
	`code` varchar(32) NOT NULL,
	`category` enum('draft','pending','active','completed','cancelled') NOT NULL,
	`sort_order` int NOT NULL,
	`is_terminal` boolean NOT NULL DEFAULT false,
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dispatch_assignment_statuses_id` PRIMARY KEY(`id`),
	CONSTRAINT `das_code_unique` UNIQUE(`code`),
	CONSTRAINT `das_name_unique` UNIQUE(`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `job_vendor_assignment_status_history` ADD CONSTRAINT `jvash_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_vendor_assignment_status_history` ADD CONSTRAINT `jvash_assignment_fk` FOREIGN KEY (`assignment_id`) REFERENCES `job_vendor_assignments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_vendor_assignment_status_history` ADD CONSTRAINT `jvash_from_status_fk` FOREIGN KEY (`from_status_id`) REFERENCES `dispatch_assignment_statuses`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_vendor_assignment_status_history` ADD CONSTRAINT `jvash_to_status_fk` FOREIGN KEY (`to_status_id`) REFERENCES `dispatch_assignment_statuses`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_vendor_assignment_status_history` ADD CONSTRAINT `jvash_changed_by_fk` FOREIGN KEY (`changed_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_vendor_assignments` ADD CONSTRAINT `jva_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_vendor_assignments` ADD CONSTRAINT `jva_job_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_vendor_assignments` ADD CONSTRAINT `jva_vendor_fk` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_vendor_assignments` ADD CONSTRAINT `jva_vendor_location_fk` FOREIGN KEY (`vendor_location_id`) REFERENCES `vendor_locations`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_vendor_assignments` ADD CONSTRAINT `jva_vendor_contact_fk` FOREIGN KEY (`vendor_contact_id`) REFERENCES `vendor_contacts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_vendor_assignments` ADD CONSTRAINT `jva_status_fk` FOREIGN KEY (`current_status_id`) REFERENCES `dispatch_assignment_statuses`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_vendor_assignments` ADD CONSTRAINT `jva_trade_fk` FOREIGN KEY (`matched_trade_id`) REFERENCES `trades`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_vendor_assignments` ADD CONSTRAINT `jva_creator_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispatch_messages` ADD CONSTRAINT `dm_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispatch_messages` ADD CONSTRAINT `dm_assignment_fk` FOREIGN KEY (`assignment_id`) REFERENCES `job_vendor_assignments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispatch_messages` ADD CONSTRAINT `dm_sent_by_fk` FOREIGN KEY (`sent_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_check_ins` ADD CONSTRAINT `vci_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_check_ins` ADD CONSTRAINT `vci_assignment_fk` FOREIGN KEY (`assignment_id`) REFERENCES `job_vendor_assignments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_check_ins` ADD CONSTRAINT `vci_recorded_by_fk` FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_check_outs` ADD CONSTRAINT `vco_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_check_outs` ADD CONSTRAINT `vco_assignment_fk` FOREIGN KEY (`assignment_id`) REFERENCES `job_vendor_assignments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_check_outs` ADD CONSTRAINT `vco_recorded_by_fk` FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_eta_confirmations` ADD CONSTRAINT `vec_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_eta_confirmations` ADD CONSTRAINT `vec_assignment_fk` FOREIGN KEY (`assignment_id`) REFERENCES `job_vendor_assignments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_eta_confirmations` ADD CONSTRAINT `vec_confirmed_by_fk` FOREIGN KEY (`confirmed_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispatch_assignment_statuses` ADD CONSTRAINT `dispatch_assignment_statuses_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `jvash_tenant_assignment_idx` ON `job_vendor_assignment_status_history` (`tenant_id`,`assignment_id`);--> statement-breakpoint
CREATE INDEX `jva_tenant_job_idx` ON `job_vendor_assignments` (`tenant_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `jva_tenant_vendor_idx` ON `job_vendor_assignments` (`tenant_id`,`vendor_id`);--> statement-breakpoint
CREATE INDEX `jva_tenant_status_idx` ON `job_vendor_assignments` (`tenant_id`,`current_status_id`);--> statement-breakpoint
CREATE INDEX `dm_assignment_created_idx` ON `dispatch_messages` (`assignment_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `dm_tenant_assignment_idx` ON `dispatch_messages` (`tenant_id`,`assignment_id`);--> statement-breakpoint
CREATE INDEX `vci_assignment_occurred_idx` ON `vendor_check_ins` (`assignment_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `vci_tenant_assignment_idx` ON `vendor_check_ins` (`tenant_id`,`assignment_id`);--> statement-breakpoint
CREATE INDEX `vco_assignment_occurred_idx` ON `vendor_check_outs` (`assignment_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `vco_tenant_assignment_idx` ON `vendor_check_outs` (`tenant_id`,`assignment_id`);--> statement-breakpoint
CREATE INDEX `vec_assignment_created_idx` ON `vendor_eta_confirmations` (`assignment_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `vec_tenant_assignment_idx` ON `vendor_eta_confirmations` (`tenant_id`,`assignment_id`);--> statement-breakpoint
CREATE INDEX `das_status_idx` ON `dispatch_assignment_statuses` (`status`);