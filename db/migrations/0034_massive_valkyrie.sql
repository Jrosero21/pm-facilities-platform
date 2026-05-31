CREATE TABLE `email_attachments` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`inbound_email_id` varchar(36) NOT NULL,
	`filename` varchar(255) NOT NULL,
	`mime_type` varchar(255),
	`size_bytes` int,
	`storage_ref` varchar(512),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_attachments_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `email_parse_results` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`inbound_email_id` varchar(36) NOT NULL,
	`parser_kind` enum('deterministic','ai_assist') NOT NULL,
	`matched_format` varchar(128),
	`matched_rule_id` varchar(36),
	`confidence` decimal(5,4),
	`extracted_fields` json,
	`extracted_client_code` varchar(64),
	`parse_outcome` enum('parsed','partial','failed') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_parse_results_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `inbound_emails` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`ingestion_account_id` varchar(36),
	`message_id` varchar(255),
	`from_address` varchar(255) NOT NULL,
	`to_address` varchar(255),
	`subject` varchar(998),
	`body_text` longtext,
	`body_html` longtext,
	`raw_headers` json,
	`received_at` datetime,
	`processing_status` enum('received','parsed','drafted','failed','duplicate_flagged') NOT NULL DEFAULT 'received',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inbound_emails_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `email_attachments` ADD CONSTRAINT `eatt_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_attachments` ADD CONSTRAINT `eatt_email_fk` FOREIGN KEY (`inbound_email_id`) REFERENCES `inbound_emails`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_parse_results` ADD CONSTRAINT `epr_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_parse_results` ADD CONSTRAINT `epr_email_fk` FOREIGN KEY (`inbound_email_id`) REFERENCES `inbound_emails`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_parse_results` ADD CONSTRAINT `epr_rule_fk` FOREIGN KEY (`matched_rule_id`) REFERENCES `email_parser_rules`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inbound_emails` ADD CONSTRAINT `ie_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inbound_emails` ADD CONSTRAINT `ie_account_fk` FOREIGN KEY (`ingestion_account_id`) REFERENCES `email_ingestion_accounts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `email_attachments_tenant_idx` ON `email_attachments` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `email_attachments_email_idx` ON `email_attachments` (`inbound_email_id`);--> statement-breakpoint
CREATE INDEX `email_parse_results_tenant_idx` ON `email_parse_results` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `email_parse_results_email_idx` ON `email_parse_results` (`inbound_email_id`);--> statement-breakpoint
CREATE INDEX `email_parse_results_rule_idx` ON `email_parse_results` (`matched_rule_id`);--> statement-breakpoint
CREATE INDEX `email_parse_results_outcome_idx` ON `email_parse_results` (`tenant_id`,`parse_outcome`);--> statement-breakpoint
CREATE INDEX `inbound_emails_tenant_message_idx` ON `inbound_emails` (`tenant_id`,`message_id`);--> statement-breakpoint
CREATE INDEX `inbound_emails_tenant_status_idx` ON `inbound_emails` (`tenant_id`,`processing_status`);--> statement-breakpoint
CREATE INDEX `inbound_emails_tenant_idx` ON `inbound_emails` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `inbound_emails_account_idx` ON `inbound_emails` (`ingestion_account_id`);