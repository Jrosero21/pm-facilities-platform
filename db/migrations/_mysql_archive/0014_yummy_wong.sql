CREATE TABLE `scope_template_steps` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`template_id` varchar(36) NOT NULL,
	`step_order` int NOT NULL,
	`instruction` text NOT NULL,
	`category` varchar(32),
	`expects_photo` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scope_template_steps_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `scope_templates` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`trade_id` varchar(36),
	`description` text,
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scope_templates_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `scope_template_steps` ADD CONSTRAINT `sts_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scope_template_steps` ADD CONSTRAINT `sts_template_fk` FOREIGN KEY (`template_id`) REFERENCES `scope_templates`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scope_templates` ADD CONSTRAINT `st_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scope_templates` ADD CONSTRAINT `st_trade_fk` FOREIGN KEY (`trade_id`) REFERENCES `trades`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `sts_template_order_idx` ON `scope_template_steps` (`template_id`,`step_order`);--> statement-breakpoint
CREATE INDEX `st_tenant_idx` ON `scope_templates` (`tenant_id`);