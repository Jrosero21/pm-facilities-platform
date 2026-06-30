CREATE TABLE `pm_visit_checklists` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`pm_program_id` varchar(36) NOT NULL,
	`item_text` varchar(512) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pm_visit_checklists_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `pm_visit_results` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`pm_visit_id` varchar(36) NOT NULL,
	`pm_visit_checklist_id` varchar(36) NOT NULL,
	`result` enum('done','skipped','na'),
	`notes` text,
	`completed_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pm_visit_results_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `pm_visit_checklists` ADD CONSTRAINT `fk_pm_checklists_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pm_visit_checklists` ADD CONSTRAINT `fk_pm_checklists_program` FOREIGN KEY (`pm_program_id`) REFERENCES `pm_programs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pm_visit_results` ADD CONSTRAINT `fk_pm_results_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pm_visit_results` ADD CONSTRAINT `fk_pm_results_visit` FOREIGN KEY (`pm_visit_id`) REFERENCES `pm_visits`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pm_visit_results` ADD CONSTRAINT `fk_pm_results_checklist` FOREIGN KEY (`pm_visit_checklist_id`) REFERENCES `pm_visit_checklists`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `pm_visit_checklists_tenant_idx` ON `pm_visit_checklists` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `pm_visit_checklists_program_idx` ON `pm_visit_checklists` (`pm_program_id`);--> statement-breakpoint
CREATE INDEX `pm_visit_results_tenant_idx` ON `pm_visit_results` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `pm_visit_results_visit_idx` ON `pm_visit_results` (`pm_visit_id`);--> statement-breakpoint
CREATE INDEX `pm_visit_results_checklist_idx` ON `pm_visit_results` (`pm_visit_checklist_id`);