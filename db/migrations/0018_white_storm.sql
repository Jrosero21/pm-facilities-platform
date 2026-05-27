CREATE TABLE `proposal_approvals` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`proposal_id` varchar(36) NOT NULL,
	`decision` enum('accepted','declined') NOT NULL,
	`approver_user_id` varchar(36),
	`approver_name` varchar(255),
	`decided_at` datetime NOT NULL,
	`notes` text,
	`signature_ref` varchar(1024),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `proposal_approvals_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `proposal_line_items` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`line_number` int NOT NULL,
	`category` enum('labor','materials','equipment','trip','permit','fee','tax','other') NOT NULL,
	`description` text NOT NULL,
	`quantity` decimal(10,2) NOT NULL DEFAULT '1',
	`unit` varchar(32),
	`unit_price` decimal(12,2) NOT NULL,
	`extended_amount` decimal(12,2) NOT NULL DEFAULT '0',
	`tax_rate` decimal(6,3),
	`tax_amount` decimal(14,2) NOT NULL DEFAULT '0',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`markup_percent` decimal(6,3),
	`markup_amount` decimal(12,2) NOT NULL DEFAULT '0',
	`proposal_id` varchar(36) NOT NULL,
	CONSTRAINT `proposal_line_items_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`parent_proposal_id` varchar(36),
	`supersedes_proposal_id` varchar(36),
	`revision_number` int NOT NULL DEFAULT 1,
	`status` enum('draft','sent','viewed','accepted','declined','expired','superseded','withdrawn') NOT NULL DEFAULT 'draft',
	`title` varchar(255),
	`scope_snapshot` text,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`subtotal` decimal(12,2) NOT NULL DEFAULT '0',
	`markup_total` decimal(12,2) NOT NULL DEFAULT '0',
	`tax_total` decimal(14,2) NOT NULL DEFAULT '0',
	`total` decimal(12,2) NOT NULL DEFAULT '0',
	`valid_until` datetime,
	`notes` text,
	`sent_at` datetime,
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `proposals_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `proposal_approvals` ADD CONSTRAINT `papp_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposal_approvals` ADD CONSTRAINT `papp_proposal_fk` FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposal_approvals` ADD CONSTRAINT `papp_user_fk` FOREIGN KEY (`approver_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposal_line_items` ADD CONSTRAINT `pli_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposal_line_items` ADD CONSTRAINT `pli_proposal_fk` FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposals` ADD CONSTRAINT `prop_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposals` ADD CONSTRAINT `prop_job_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposals` ADD CONSTRAINT `prop_parent_fk` FOREIGN KEY (`parent_proposal_id`) REFERENCES `proposals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposals` ADD CONSTRAINT `prop_supersedes_fk` FOREIGN KEY (`supersedes_proposal_id`) REFERENCES `proposals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposals` ADD CONSTRAINT `prop_created_by_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `papp_tenant_proposal_idx` ON `proposal_approvals` (`tenant_id`,`proposal_id`);--> statement-breakpoint
CREATE INDEX `pli_tenant_proposal_idx` ON `proposal_line_items` (`tenant_id`,`proposal_id`);--> statement-breakpoint
CREATE INDEX `prop_tenant_job_idx` ON `proposals` (`tenant_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `prop_tenant_status_idx` ON `proposals` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `prop_parent_idx` ON `proposals` (`parent_proposal_id`);