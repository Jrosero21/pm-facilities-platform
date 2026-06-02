CREATE TABLE `tenant_autonomy_settings` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`kill_switch` boolean NOT NULL DEFAULT false,
	`max_committed_per_job` decimal(12,2),
	`max_committed_per_day` decimal(12,2),
	`max_committed_per_tenant` decimal(12,2),
	`max_llm_tokens_per_day` int,
	`max_llm_tokens_per_tenant` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenant_autonomy_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `tas_tenant_unique` UNIQUE(`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `tenant_autonomy_settings` ADD CONSTRAINT `tas_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;