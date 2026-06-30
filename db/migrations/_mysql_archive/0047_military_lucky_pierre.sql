CREATE TABLE `invoice_drafts` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`agent_run_id` varchar(36) NOT NULL,
	`vendor_invoice_id` varchar(36) NOT NULL,
	`client_id` varchar(36) NOT NULL,
	`proposed_invoice` json NOT NULL,
	`status` enum('pending_review','approved','rejected','discarded','published') NOT NULL DEFAULT 'pending_review',
	`published_client_invoice_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoice_drafts_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `invoice_reviews` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`draft_id` varchar(36) NOT NULL,
	`reviewer_user_id` varchar(36),
	`decision` enum('approve','reject') NOT NULL,
	`edited_content` json,
	`review_notes` text,
	`reviewed_at` datetime NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoice_reviews_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `invoice_drafts` ADD CONSTRAINT `invd_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_drafts` ADD CONSTRAINT `invd_job_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_drafts` ADD CONSTRAINT `invd_run_fk` FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_drafts` ADD CONSTRAINT `invd_vendor_inv_fk` FOREIGN KEY (`vendor_invoice_id`) REFERENCES `vendor_invoices`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_drafts` ADD CONSTRAINT `invd_client_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_drafts` ADD CONSTRAINT `invd_pub_client_inv_fk` FOREIGN KEY (`published_client_invoice_id`) REFERENCES `client_invoices`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_reviews` ADD CONSTRAINT `invr_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_reviews` ADD CONSTRAINT `invr_draft_fk` FOREIGN KEY (`draft_id`) REFERENCES `invoice_drafts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_reviews` ADD CONSTRAINT `invr_reviewer_fk` FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `invd_tenant_job_idx` ON `invoice_drafts` (`tenant_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `invd_tenant_status_idx` ON `invoice_drafts` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `invd_run_idx` ON `invoice_drafts` (`agent_run_id`);--> statement-breakpoint
CREATE INDEX `invd_vendor_inv_idx` ON `invoice_drafts` (`vendor_invoice_id`);--> statement-breakpoint
CREATE INDEX `invr_draft_idx` ON `invoice_reviews` (`draft_id`);