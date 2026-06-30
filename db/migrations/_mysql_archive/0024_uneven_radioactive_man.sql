CREATE INDEX `jobs_tenant_due_idx` ON `jobs` (`tenant_id`,`due_at`);--> statement-breakpoint
CREATE INDEX `jobs_tenant_source_idx` ON `jobs` (`tenant_id`,`source_type`);