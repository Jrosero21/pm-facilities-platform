CREATE TABLE `agent_policies` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`client_id` varchar(36),
	`agent_id` varchar(64) NOT NULL,
	`policy` json NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`status` enum('draft','active','archived') NOT NULL DEFAULT 'draft',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agent_policies_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `agent_policy_defaults` (
	`id` varchar(36) NOT NULL,
	`agent_id` varchar(64) NOT NULL,
	`policy` json NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`status` enum('draft','active','archived') NOT NULL DEFAULT 'draft',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agent_policy_defaults_id` PRIMARY KEY(`id`),
	CONSTRAINT `apd_agent_unique` UNIQUE(`agent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `ai_prompt_template_defaults` (
	`id` varchar(36) NOT NULL,
	`agent_id` varchar(64) NOT NULL,
	`variant` varchar(64) NOT NULL DEFAULT 'default',
	`version` int NOT NULL DEFAULT 1,
	`status` enum('draft','active','archived') NOT NULL DEFAULT 'draft',
	`system_prompt` text NOT NULL,
	`user_prompt_template` text,
	`model_hint` varchar(64),
	`temperature` decimal(3,2),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_prompt_template_defaults_id` PRIMARY KEY(`id`),
	CONSTRAINT `aptd_agent_variant_unique` UNIQUE(`agent_id`,`variant`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `ai_prompt_templates` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`agent_id` varchar(64) NOT NULL,
	`variant` varchar(64) NOT NULL DEFAULT 'default',
	`version` int NOT NULL DEFAULT 1,
	`status` enum('draft','active','archived') NOT NULL DEFAULT 'draft',
	`system_prompt` text NOT NULL,
	`user_prompt_template` text,
	`model_hint` varchar(64),
	`temperature` decimal(3,2),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_prompt_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `apt_tenant_agent_variant_version_unique` UNIQUE(`tenant_id`,`agent_id`,`variant`,`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `agent_policies` ADD CONSTRAINT `ap_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_policies` ADD CONSTRAINT `ap_client_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_prompt_templates` ADD CONSTRAINT `apt_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ap_lookup_idx` ON `agent_policies` (`tenant_id`,`agent_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `apt_lookup_idx` ON `ai_prompt_templates` (`tenant_id`,`agent_id`,`variant`,`status`);