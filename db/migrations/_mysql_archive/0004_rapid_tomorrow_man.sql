ALTER TABLE `vendors` DROP INDEX `vendors_tenant_name_unique`;--> statement-breakpoint
CREATE INDEX `vendors_tenant_name_idx` ON `vendors` (`tenant_id`,`name`);