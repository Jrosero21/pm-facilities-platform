CREATE TABLE `tenant_llm_keys` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`provider` enum('anthropic','openai') NOT NULL,
	`encrypted_key` text NOT NULL,
	`key_ref` varchar(255) NOT NULL,
	`status` enum('active','revoked') NOT NULL DEFAULT 'active',
	`label` varchar(255),
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenant_llm_keys_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `tenant_llm_keys` ADD CONSTRAINT `tlk_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_llm_keys` ADD CONSTRAINT `tlk_created_by_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `tlk_tenant_provider_status_idx` ON `tenant_llm_keys` (`tenant_id`,`provider`,`status`);