CREATE TABLE `update_rewrite_drafts` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`agent_run_id` varchar(36) NOT NULL,
	`source_type` enum('job_note','vendor_update') NOT NULL DEFAULT 'job_note',
	`source_id` varchar(36) NOT NULL,
	`draft_content` text NOT NULL,
	`status` enum('pending_review','approved','rejected','discarded','published') NOT NULL DEFAULT 'pending_review',
	`published_communication_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `update_rewrite_drafts_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `update_rewrite_reviews` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`draft_id` varchar(36) NOT NULL,
	`reviewer_user_id` varchar(36),
	`decision` enum('approve','reject') NOT NULL,
	`edited_content` text,
	`review_notes` text,
	`reviewed_at` datetime NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `update_rewrite_reviews_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `agent_decisions` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`agent_run_id` varchar(36) NOT NULL,
	`decision_type` varchar(64) NOT NULL,
	`proposed_action` varchar(500),
	`reasoning` text,
	`confidence` enum('high','medium','low'),
	`policy_check` varchar(128),
	`disposition` enum('queued_for_review','auto_executed','policy_blocked') NOT NULL,
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agent_decisions_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `agent_runs` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`agent_id` varchar(64) NOT NULL,
	`status` enum('running','succeeded','failed') NOT NULL DEFAULT 'running',
	`trigger_source` varchar(32) NOT NULL DEFAULT 'operator_manual',
	`triggered_by_user_id` varchar(36),
	`job_id` varchar(36),
	`input_summary` varchar(500),
	`output_summary` varchar(500),
	`model` varchar(64),
	`prompt_version` varchar(64),
	`input_tokens` int,
	`output_tokens` int,
	`error_message` text,
	`started_at` datetime NOT NULL,
	`completed_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agent_runs_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `agent_tool_calls` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`agent_run_id` varchar(36) NOT NULL,
	`sequence` int NOT NULL,
	`tool_name` varchar(128) NOT NULL,
	`tool_kind` enum('read','write') NOT NULL,
	`tool_input` json,
	`tool_output` json,
	`status` enum('ok','error') NOT NULL DEFAULT 'ok',
	`error_message` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agent_tool_calls_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `client_update_logs` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`content` text NOT NULL,
	`source_draft_id` varchar(36),
	`created_by_user_id` varchar(36),
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_update_logs_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `update_rewrite_drafts` ADD CONSTRAINT `urd_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `update_rewrite_drafts` ADD CONSTRAINT `urd_job_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `update_rewrite_drafts` ADD CONSTRAINT `urd_run_fk` FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `update_rewrite_drafts` ADD CONSTRAINT `urd_pub_comm_fk` FOREIGN KEY (`published_communication_id`) REFERENCES `communication_logs`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `update_rewrite_reviews` ADD CONSTRAINT `urr_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `update_rewrite_reviews` ADD CONSTRAINT `urr_draft_fk` FOREIGN KEY (`draft_id`) REFERENCES `update_rewrite_drafts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `update_rewrite_reviews` ADD CONSTRAINT `urr_reviewer_fk` FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_decisions` ADD CONSTRAINT `ad_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_decisions` ADD CONSTRAINT `ad_run_fk` FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_runs` ADD CONSTRAINT `ar_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_runs` ADD CONSTRAINT `ar_triggered_by_fk` FOREIGN KEY (`triggered_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_runs` ADD CONSTRAINT `ar_job_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_tool_calls` ADD CONSTRAINT `atc_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_tool_calls` ADD CONSTRAINT `atc_run_fk` FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_update_logs` ADD CONSTRAINT `cul_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_update_logs` ADD CONSTRAINT `cul_job_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_update_logs` ADD CONSTRAINT `cul_source_draft_fk` FOREIGN KEY (`source_draft_id`) REFERENCES `update_rewrite_drafts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_update_logs` ADD CONSTRAINT `cul_created_by_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `urd_tenant_job_idx` ON `update_rewrite_drafts` (`tenant_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `urd_tenant_status_idx` ON `update_rewrite_drafts` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `urd_run_idx` ON `update_rewrite_drafts` (`agent_run_id`);--> statement-breakpoint
CREATE INDEX `urd_source_idx` ON `update_rewrite_drafts` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `urr_draft_idx` ON `update_rewrite_reviews` (`draft_id`);--> statement-breakpoint
CREATE INDEX `ad_run_idx` ON `agent_decisions` (`agent_run_id`);--> statement-breakpoint
CREATE INDEX `ar_tenant_agent_created_idx` ON `agent_runs` (`tenant_id`,`agent_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ar_tenant_status_idx` ON `agent_runs` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `ar_job_idx` ON `agent_runs` (`job_id`);--> statement-breakpoint
CREATE INDEX `atc_run_seq_idx` ON `agent_tool_calls` (`agent_run_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `cul_tenant_job_idx` ON `client_update_logs` (`tenant_id`,`job_id`);