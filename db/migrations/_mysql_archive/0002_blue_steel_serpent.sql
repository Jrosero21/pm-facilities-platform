CREATE TABLE `client_billing_rules` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`client_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`markup_percent` decimal(6,3),
	`payment_terms_days` int,
	`notes` text,
	`is_default` boolean NOT NULL DEFAULT false,
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_billing_rules_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `client_contacts` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`client_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`title` varchar(128),
	`email` varchar(255),
	`phone` varchar(32),
	`is_primary` boolean NOT NULL DEFAULT false,
	`notes` text,
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_contacts_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `client_location_access_notes` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`client_location_id` varchar(36) NOT NULL,
	`title` varchar(128),
	`body` text NOT NULL,
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_location_access_notes_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `client_location_contacts` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`client_location_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`title` varchar(128),
	`email` varchar(255),
	`phone` varchar(32),
	`is_primary` boolean NOT NULL DEFAULT false,
	`notes` text,
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_location_contacts_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `client_location_hours` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`client_location_id` varchar(36) NOT NULL,
	`day_of_week` enum('sun','mon','tue','wed','thu','fri','sat') NOT NULL,
	`open_time` time,
	`close_time` time,
	`is_closed` boolean NOT NULL DEFAULT false,
	`notes` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_location_hours_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `client_billing_rules` ADD CONSTRAINT `client_billing_rules_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_billing_rules` ADD CONSTRAINT `client_billing_rules_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_billing_rules` ADD CONSTRAINT `client_billing_rules_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_contacts` ADD CONSTRAINT `client_contacts_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_contacts` ADD CONSTRAINT `client_contacts_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_contacts` ADD CONSTRAINT `client_contacts_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_location_access_notes` ADD CONSTRAINT `client_location_access_notes_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_location_access_notes` ADD CONSTRAINT `client_location_access_notes_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_location_access_notes` ADD CONSTRAINT `cl_access_notes_location_fk` FOREIGN KEY (`client_location_id`) REFERENCES `client_locations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_location_contacts` ADD CONSTRAINT `client_location_contacts_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_location_contacts` ADD CONSTRAINT `client_location_contacts_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_location_contacts` ADD CONSTRAINT `cl_contacts_location_fk` FOREIGN KEY (`client_location_id`) REFERENCES `client_locations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_location_hours` ADD CONSTRAINT `client_location_hours_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_location_hours` ADD CONSTRAINT `cl_hours_location_fk` FOREIGN KEY (`client_location_id`) REFERENCES `client_locations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `client_billing_rules_tenant_idx` ON `client_billing_rules` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `client_billing_rules_client_idx` ON `client_billing_rules` (`client_id`);--> statement-breakpoint
CREATE INDEX `client_contacts_tenant_idx` ON `client_contacts` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `client_contacts_client_idx` ON `client_contacts` (`client_id`);--> statement-breakpoint
CREATE INDEX `client_location_access_notes_tenant_idx` ON `client_location_access_notes` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `client_location_access_notes_location_idx` ON `client_location_access_notes` (`client_location_id`);--> statement-breakpoint
CREATE INDEX `client_location_contacts_tenant_idx` ON `client_location_contacts` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `client_location_contacts_location_idx` ON `client_location_contacts` (`client_location_id`);--> statement-breakpoint
CREATE INDEX `client_location_hours_tenant_idx` ON `client_location_hours` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `client_location_hours_location_idx` ON `client_location_hours` (`client_location_id`);