ALTER TABLE `jobs` ADD `follow_up_at` datetime;--> statement-breakpoint
ALTER TABLE `jobs` ADD `follow_up_category` enum('vendor_followup','confirm_onsite','proposal_followup','general');--> statement-breakpoint
CREATE INDEX `jobs_tenant_followup_idx` ON `jobs` (`tenant_id`,`follow_up_at`);