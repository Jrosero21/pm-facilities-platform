CREATE TABLE `external_accounts` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`external_system_id` varchar(36) NOT NULL,
	`external_account_ref` varchar(255) NOT NULL,
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`config` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `external_accounts_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `external_credentials` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`external_system_id` varchar(36) NOT NULL,
	`credential_type` varchar(64) NOT NULL,
	`encrypted_payload` text,
	`key_ref` varchar(255),
	`expires_at` datetime,
	`status` enum('active','inactive','revoked') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `external_credentials_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `external_systems` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`provider` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`config` json,
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `external_systems_id` PRIMARY KEY(`id`),
	CONSTRAINT `external_systems_tenant_provider_name_unique` UNIQUE(`tenant_id`,`provider`,`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `external_accounts` ADD CONSTRAINT `external_accounts_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_accounts` ADD CONSTRAINT `external_accounts_external_system_id_external_systems_id_fk` FOREIGN KEY (`external_system_id`) REFERENCES `external_systems`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_credentials` ADD CONSTRAINT `external_credentials_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_credentials` ADD CONSTRAINT `external_credentials_external_system_id_external_systems_id_fk` FOREIGN KEY (`external_system_id`) REFERENCES `external_systems`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_systems` ADD CONSTRAINT `external_systems_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_systems` ADD CONSTRAINT `external_systems_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `external_accounts_tenant_system_idx` ON `external_accounts` (`tenant_id`,`external_system_id`);--> statement-breakpoint
CREATE INDEX `external_accounts_tenant_idx` ON `external_accounts` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `external_accounts_system_idx` ON `external_accounts` (`external_system_id`);--> statement-breakpoint
CREATE INDEX `external_credentials_tenant_idx` ON `external_credentials` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `external_credentials_system_idx` ON `external_credentials` (`external_system_id`);--> statement-breakpoint
CREATE INDEX `external_systems_tenant_status_idx` ON `external_systems` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `external_systems_tenant_idx` ON `external_systems` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `external_systems_created_by_idx` ON `external_systems` (`created_by_user_id`);