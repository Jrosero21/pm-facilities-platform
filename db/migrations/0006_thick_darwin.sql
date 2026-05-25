CREATE TABLE `vendor_compliance` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`vendor_id` varchar(36) NOT NULL,
	`requirement_type` enum('general_liability','workers_comp','auto_liability','umbrella','background_check','license','certification','other') NOT NULL,
	`coverage_amount` decimal(14,2),
	`carrier` varchar(255),
	`policy_number` varchar(128),
	`effective_date` date,
	`expiry_date` date,
	`compliance_status` enum('pending','compliant','non_compliant','expired') NOT NULL DEFAULT 'pending',
	`notes` text,
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendor_compliance_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `vendor_documents` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`vendor_id` varchar(36) NOT NULL,
	`vendor_location_id` varchar(36),
	`document_type` enum('insurance','w9','license','certification','agreement','other') NOT NULL,
	`title` varchar(255) NOT NULL,
	`file_url` varchar(1024),
	`file_size_bytes` bigint,
	`file_mime_type` varchar(127),
	`issued_date` date,
	`expiry_date` date,
	`notes` text,
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendor_documents_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `vendor_performance_scores` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`vendor_id` varchar(36) NOT NULL,
	`trade_id` varchar(36),
	`period_start` date,
	`period_end` date,
	`jobs_completed` int,
	`jobs_on_time` int,
	`on_time_rate` decimal(5,2),
	`avg_rating` decimal(3,2),
	`score` decimal(6,2),
	`computed_at` timestamp,
	`notes` text,
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendor_performance_scores_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `vendor_rates` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`vendor_id` varchar(36) NOT NULL,
	`trade_id` varchar(36),
	`vendor_location_id` varchar(36),
	`rate_type` enum('hourly','flat','trip_charge','per_unit','emergency','after_hours') NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`unit` varchar(32),
	`effective_date` date,
	`expiry_date` date,
	`notes` text,
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendor_rates_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `vendor_compliance` ADD CONSTRAINT `vendor_compliance_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_compliance` ADD CONSTRAINT `vendor_compliance_vendor_id_vendors_id_fk` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_compliance` ADD CONSTRAINT `vendor_compliance_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_documents` ADD CONSTRAINT `vendor_documents_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_documents` ADD CONSTRAINT `vendor_documents_vendor_id_vendors_id_fk` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_documents` ADD CONSTRAINT `vendor_documents_vendor_location_id_vendor_locations_id_fk` FOREIGN KEY (`vendor_location_id`) REFERENCES `vendor_locations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_documents` ADD CONSTRAINT `vendor_documents_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_performance_scores` ADD CONSTRAINT `vendor_performance_scores_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_performance_scores` ADD CONSTRAINT `vendor_performance_scores_vendor_id_vendors_id_fk` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_performance_scores` ADD CONSTRAINT `vendor_performance_scores_trade_id_trades_id_fk` FOREIGN KEY (`trade_id`) REFERENCES `trades`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_performance_scores` ADD CONSTRAINT `vendor_performance_scores_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_rates` ADD CONSTRAINT `vendor_rates_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_rates` ADD CONSTRAINT `vendor_rates_vendor_id_vendors_id_fk` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_rates` ADD CONSTRAINT `vendor_rates_trade_id_trades_id_fk` FOREIGN KEY (`trade_id`) REFERENCES `trades`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_rates` ADD CONSTRAINT `vendor_rates_vendor_location_id_vendor_locations_id_fk` FOREIGN KEY (`vendor_location_id`) REFERENCES `vendor_locations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_rates` ADD CONSTRAINT `vendor_rates_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `vendor_compliance_tenant_vendor_idx` ON `vendor_compliance` (`tenant_id`,`vendor_id`);--> statement-breakpoint
CREATE INDEX `vendor_documents_tenant_vendor_idx` ON `vendor_documents` (`tenant_id`,`vendor_id`);--> statement-breakpoint
CREATE INDEX `vendor_performance_scores_tenant_vendor_idx` ON `vendor_performance_scores` (`tenant_id`,`vendor_id`);--> statement-breakpoint
CREATE INDEX `vendor_rates_tenant_vendor_idx` ON `vendor_rates` (`tenant_id`,`vendor_id`);