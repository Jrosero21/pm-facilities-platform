CREATE TABLE `email_work_order_drafts` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`inbound_email_id` varchar(36) NOT NULL,
	`parse_result_id` varchar(36),
	`draft_status` enum('pending_review','approved','rejected','superseded') NOT NULL DEFAULT 'pending_review',
	`source_type` enum('email_ingestion','forwarded_email') NOT NULL,
	`problem_description` text,
	`resolved_client_id` varchar(36),
	`resolved_client_location_id` varchar(36),
	`resolved_trade_id` varchar(36),
	`resolved_priority_id` varchar(36),
	`created_job_id` varchar(36),
	`reviewed_by_user_id` varchar(36),
	`reviewed_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_work_order_drafts_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `email_work_order_drafts` ADD CONSTRAINT `ewod_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_work_order_drafts` ADD CONSTRAINT `ewod_email_fk` FOREIGN KEY (`inbound_email_id`) REFERENCES `inbound_emails`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_work_order_drafts` ADD CONSTRAINT `ewod_parse_fk` FOREIGN KEY (`parse_result_id`) REFERENCES `email_parse_results`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_work_order_drafts` ADD CONSTRAINT `ewod_client_fk` FOREIGN KEY (`resolved_client_id`) REFERENCES `clients`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_work_order_drafts` ADD CONSTRAINT `ewod_location_fk` FOREIGN KEY (`resolved_client_location_id`) REFERENCES `client_locations`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_work_order_drafts` ADD CONSTRAINT `ewod_trade_fk` FOREIGN KEY (`resolved_trade_id`) REFERENCES `trades`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_work_order_drafts` ADD CONSTRAINT `ewod_priority_fk` FOREIGN KEY (`resolved_priority_id`) REFERENCES `priorities`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_work_order_drafts` ADD CONSTRAINT `ewod_job_fk` FOREIGN KEY (`created_job_id`) REFERENCES `jobs`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_work_order_drafts` ADD CONSTRAINT `ewod_reviewer_fk` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `email_work_order_drafts_tenant_status_idx` ON `email_work_order_drafts` (`tenant_id`,`draft_status`);--> statement-breakpoint
CREATE INDEX `email_work_order_drafts_tenant_idx` ON `email_work_order_drafts` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `email_work_order_drafts_email_idx` ON `email_work_order_drafts` (`inbound_email_id`);--> statement-breakpoint
CREATE INDEX `email_work_order_drafts_parse_idx` ON `email_work_order_drafts` (`parse_result_id`);--> statement-breakpoint
CREATE INDEX `email_work_order_drafts_client_idx` ON `email_work_order_drafts` (`resolved_client_id`);--> statement-breakpoint
CREATE INDEX `email_work_order_drafts_location_idx` ON `email_work_order_drafts` (`resolved_client_location_id`);--> statement-breakpoint
CREATE INDEX `email_work_order_drafts_trade_idx` ON `email_work_order_drafts` (`resolved_trade_id`);--> statement-breakpoint
CREATE INDEX `email_work_order_drafts_priority_idx` ON `email_work_order_drafts` (`resolved_priority_id`);--> statement-breakpoint
CREATE INDEX `email_work_order_drafts_job_idx` ON `email_work_order_drafts` (`created_job_id`);--> statement-breakpoint
CREATE INDEX `email_work_order_drafts_reviewer_idx` ON `email_work_order_drafts` (`reviewed_by_user_id`);