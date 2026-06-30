CREATE TABLE `proposal_drafts` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`agent_run_id` varchar(36) NOT NULL,
	`proposed_proposal` json NOT NULL,
	`status` enum('pending_review','approved','rejected','discarded','published') NOT NULL DEFAULT 'pending_review',
	`published_proposal_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `proposal_drafts_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `proposal_reviews` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`proposal_draft_id` varchar(36) NOT NULL,
	`reviewer_user_id` varchar(36),
	`decision` enum('approve','reject') NOT NULL,
	`edited_content` json,
	`review_notes` text,
	`reviewed_at` datetime NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `proposal_reviews_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `proposals` MODIFY COLUMN `status` enum('draft','sent','viewed','accepted','declined','expired','superseded','withdrawn','internal_billed') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `proposals` ADD `kind` enum('client','internal') DEFAULT 'client' NOT NULL;--> statement-breakpoint
ALTER TABLE `proposal_drafts` ADD CONSTRAINT `prpd_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposal_drafts` ADD CONSTRAINT `prpd_job_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposal_drafts` ADD CONSTRAINT `prpd_run_fk` FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposal_drafts` ADD CONSTRAINT `prpd_pub_proposal_fk` FOREIGN KEY (`published_proposal_id`) REFERENCES `proposals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposal_reviews` ADD CONSTRAINT `prpr_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposal_reviews` ADD CONSTRAINT `prpr_draft_fk` FOREIGN KEY (`proposal_draft_id`) REFERENCES `proposal_drafts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposal_reviews` ADD CONSTRAINT `prpr_reviewer_fk` FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `prpd_tenant_job_idx` ON `proposal_drafts` (`tenant_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `prpd_tenant_status_idx` ON `proposal_drafts` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `prpd_run_idx` ON `proposal_drafts` (`agent_run_id`);--> statement-breakpoint
CREATE INDEX `prpr_draft_idx` ON `proposal_reviews` (`proposal_draft_id`);--> statement-breakpoint
CREATE INDEX `prop_tenant_kind_status_idx` ON `proposals` (`tenant_id`,`kind`,`status`);