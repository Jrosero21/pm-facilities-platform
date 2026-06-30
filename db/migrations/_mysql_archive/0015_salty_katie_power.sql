CREATE TABLE `job_scope_drafts` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`agent_run_id` varchar(36) NOT NULL,
	`proposed_steps` json NOT NULL,
	`status` enum('pending_review','approved','rejected','discarded','published') NOT NULL DEFAULT 'pending_review',
	`published_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `job_scope_drafts_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `job_scope_reviews` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`draft_id` varchar(36) NOT NULL,
	`reviewer_user_id` varchar(36),
	`decision` enum('approve','reject') NOT NULL,
	`edited_steps` json,
	`review_notes` text,
	`reviewed_at` datetime NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `job_scope_reviews_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `job_scope_steps` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`step_order` int NOT NULL,
	`instruction` text NOT NULL,
	`category` varchar(32),
	`expects_photo` boolean NOT NULL DEFAULT false,
	`source` enum('ai_generated','template','manual','edited') NOT NULL,
	`source_draft_id` varchar(36),
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `job_scope_steps_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `job_scope_drafts` ADD CONSTRAINT `jsd_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_scope_drafts` ADD CONSTRAINT `jsd_job_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_scope_drafts` ADD CONSTRAINT `jsd_run_fk` FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_scope_reviews` ADD CONSTRAINT `jsr_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_scope_reviews` ADD CONSTRAINT `jsr_draft_fk` FOREIGN KEY (`draft_id`) REFERENCES `job_scope_drafts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_scope_reviews` ADD CONSTRAINT `jsr_reviewer_fk` FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_scope_steps` ADD CONSTRAINT `jss_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_scope_steps` ADD CONSTRAINT `jss_job_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_scope_steps` ADD CONSTRAINT `jss_source_draft_fk` FOREIGN KEY (`source_draft_id`) REFERENCES `job_scope_drafts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `jsd_tenant_job_idx` ON `job_scope_drafts` (`tenant_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `jsd_tenant_status_idx` ON `job_scope_drafts` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `jsd_run_idx` ON `job_scope_drafts` (`agent_run_id`);--> statement-breakpoint
CREATE INDEX `jsr_draft_idx` ON `job_scope_reviews` (`draft_id`);--> statement-breakpoint
CREATE INDEX `jss_tenant_job_order_idx` ON `job_scope_steps` (`tenant_id`,`job_id`,`step_order`);