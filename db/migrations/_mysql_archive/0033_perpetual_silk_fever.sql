CREATE TABLE `email_ingestion_accounts` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`intake_address` varchar(255) NOT NULL,
	`source_type` enum('email_ingestion','forwarded_email') NOT NULL,
	`expected_parser_rule_id` varchar(36),
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_ingestion_accounts_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `email_parser_rules` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`match_sender_pattern` varchar(255),
	`format_key` varchar(128) NOT NULL,
	`extraction_config` json,
	`direction` varchar(32),
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_parser_rules_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `email_ingestion_accounts` ADD CONSTRAINT `eia_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_ingestion_accounts` ADD CONSTRAINT `eia_parser_rule_fk` FOREIGN KEY (`expected_parser_rule_id`) REFERENCES `email_parser_rules`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_ingestion_accounts` ADD CONSTRAINT `eia_creator_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_parser_rules` ADD CONSTRAINT `eprule_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `email_ingestion_accounts_tenant_status_idx` ON `email_ingestion_accounts` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `email_ingestion_accounts_tenant_idx` ON `email_ingestion_accounts` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `email_ingestion_accounts_parser_rule_idx` ON `email_ingestion_accounts` (`expected_parser_rule_id`);--> statement-breakpoint
CREATE INDEX `email_ingestion_accounts_creator_idx` ON `email_ingestion_accounts` (`created_by_user_id`);--> statement-breakpoint
CREATE INDEX `email_parser_rules_tenant_status_idx` ON `email_parser_rules` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `email_parser_rules_tenant_idx` ON `email_parser_rules` (`tenant_id`);