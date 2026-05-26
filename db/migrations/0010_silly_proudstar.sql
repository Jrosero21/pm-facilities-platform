CREATE TABLE `communication_logs` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`channel` enum('internal_note','vendor_portal','client_portal','email','sms','external_portal','phone_call') NOT NULL,
	`direction` enum('outbound','inbound','internal') NOT NULL,
	`source_type` enum('dispatch_message','outbound_message','inbound_message','job_note','client_update','vendor_update') NOT NULL,
	`source_id` varchar(36) NOT NULL,
	`visibility` enum('internal_only','vendor_visible','client_visible','client_and_vendor_visible','requires_review') NOT NULL DEFAULT 'internal_only',
	`summary` varchar(500) NOT NULL,
	`sent_by_user_id` varchar(36),
	`recipient_type` enum('vendor_contact','client_contact','external','internal','none') NOT NULL DEFAULT 'none',
	`recipient_id` varchar(36),
	`recipient_email` varchar(255),
	`recipient_phone` varchar(32),
	`cc` text,
	`bcc` text,
	`delivery_status` enum('draft','queued','sent','delivered','failed','bounced','received') NOT NULL DEFAULT 'draft',
	`sent_at` datetime,
	`delivered_at` datetime,
	`read_at` datetime,
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `communication_logs_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `email_templates` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`subject_template` varchar(500),
	`body_template` text NOT NULL,
	`applicable_channels` json NOT NULL,
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `et_tenant_name_unique` UNIQUE(`tenant_id`,`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `inbound_messages` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`external_sender` varchar(255),
	`subject` varchar(255),
	`raw_body` text NOT NULL,
	`received_at` datetime NOT NULL,
	`parse_status` varchar(32) NOT NULL DEFAULT 'unparsed',
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inbound_messages_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `outbound_messages` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`subject` varchar(255),
	`body` text NOT NULL,
	`template_id` varchar(36),
	`created_by_user_id` varchar(36),
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `outbound_messages_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `communication_logs` ADD CONSTRAINT `cl_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `communication_logs` ADD CONSTRAINT `cl_job_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `communication_logs` ADD CONSTRAINT `cl_sent_by_fk` FOREIGN KEY (`sent_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_templates` ADD CONSTRAINT `et_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_templates` ADD CONSTRAINT `et_created_by_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inbound_messages` ADD CONSTRAINT `im_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inbound_messages` ADD CONSTRAINT `im_created_by_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `outbound_messages` ADD CONSTRAINT `om_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `outbound_messages` ADD CONSTRAINT `om_template_fk` FOREIGN KEY (`template_id`) REFERENCES `email_templates`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `outbound_messages` ADD CONSTRAINT `om_created_by_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `cl_tenant_job_created_idx` ON `communication_logs` (`tenant_id`,`job_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `cl_source_idx` ON `communication_logs` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `cl_tenant_status_idx` ON `communication_logs` (`tenant_id`,`delivery_status`);--> statement-breakpoint
CREATE INDEX `cl_tenant_channel_idx` ON `communication_logs` (`tenant_id`,`channel`);--> statement-breakpoint
CREATE INDEX `cl_tenant_recipient_idx` ON `communication_logs` (`tenant_id`,`recipient_type`,`recipient_id`);--> statement-breakpoint
CREATE INDEX `im_tenant_parse_idx` ON `inbound_messages` (`tenant_id`,`parse_status`);--> statement-breakpoint
CREATE INDEX `om_tenant_idx` ON `outbound_messages` (`tenant_id`);