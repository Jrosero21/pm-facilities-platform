CREATE TABLE `client_nte_rules` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`client_id` varchar(36) NOT NULL,
	`trade_id` varchar(36) NOT NULL,
	`priority_id` varchar(36) NOT NULL,
	`client_location_id` varchar(36),
	`nte_amount` decimal(12,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`status` enum('active','archived') NOT NULL DEFAULT 'active',
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_nte_rules_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `client_nte_rules` ADD CONSTRAINT `cnr_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_nte_rules` ADD CONSTRAINT `cnr_client_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_nte_rules` ADD CONSTRAINT `cnr_trade_fk` FOREIGN KEY (`trade_id`) REFERENCES `trades`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_nte_rules` ADD CONSTRAINT `cnr_priority_fk` FOREIGN KEY (`priority_id`) REFERENCES `priorities`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_nte_rules` ADD CONSTRAINT `cnr_location_fk` FOREIGN KEY (`client_location_id`) REFERENCES `client_locations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_nte_rules` ADD CONSTRAINT `cnr_created_by_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `cnr_resolve_idx` ON `client_nte_rules` (`tenant_id`,`client_id`,`trade_id`,`priority_id`);--> statement-breakpoint
CREATE INDEX `cnr_tenant_client_idx` ON `client_nte_rules` (`tenant_id`,`client_id`);