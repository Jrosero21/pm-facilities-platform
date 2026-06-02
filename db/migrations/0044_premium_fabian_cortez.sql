CREATE TABLE `magic_link_tokens` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`assignment_id` varchar(36) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` datetime NOT NULL,
	`revoked_at` datetime,
	`sent_at` datetime,
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `magic_link_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `mlt_token_hash_unique` UNIQUE(`token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `job_attachments` ADD `source_token_id` varchar(36);--> statement-breakpoint
ALTER TABLE `job_notes` ADD `source_token_id` varchar(36);--> statement-breakpoint
ALTER TABLE `magic_link_tokens` ADD CONSTRAINT `mlt_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `magic_link_tokens` ADD CONSTRAINT `mlt_assignment_fk` FOREIGN KEY (`assignment_id`) REFERENCES `job_vendor_assignments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `magic_link_tokens` ADD CONSTRAINT `mlt_created_by_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `mlt_tenant_assignment_idx` ON `magic_link_tokens` (`tenant_id`,`assignment_id`);--> statement-breakpoint
ALTER TABLE `job_attachments` ADD CONSTRAINT `job_attachments_source_token_id_magic_link_tokens_id_fk` FOREIGN KEY (`source_token_id`) REFERENCES `magic_link_tokens`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `job_notes` ADD CONSTRAINT `job_notes_source_token_id_magic_link_tokens_id_fk` FOREIGN KEY (`source_token_id`) REFERENCES `magic_link_tokens`(`id`) ON DELETE set null ON UPDATE no action;