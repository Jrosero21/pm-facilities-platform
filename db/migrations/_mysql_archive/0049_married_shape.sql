CREATE TABLE `client_rates` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`client_id` varchar(36) NOT NULL,
	`trade_id` varchar(36),
	`rate_type` enum('hourly','flat','trip_charge','per_unit','emergency','after_hours') NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`unit` varchar(32),
	`effective_date` date,
	`expiry_date` date,
	`notes` text,
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_rates_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `clients` ADD `billing_model` enum('rate_sheet','cost_plus','flat') DEFAULT 'cost_plus' NOT NULL;--> statement-breakpoint
ALTER TABLE `client_rates` ADD CONSTRAINT `client_rates_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_rates` ADD CONSTRAINT `client_rates_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_rates` ADD CONSTRAINT `client_rates_trade_id_trades_id_fk` FOREIGN KEY (`trade_id`) REFERENCES `trades`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_rates` ADD CONSTRAINT `client_rates_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `client_rates_tenant_client_idx` ON `client_rates` (`tenant_id`,`client_id`);