ALTER TABLE `job_attachments` ADD `storage_key` varchar(1024);--> statement-breakpoint
ALTER TABLE `job_attachments` ADD `checksum` varchar(255);--> statement-breakpoint
ALTER TABLE `job_attachments` ADD `storage_provider` varchar(32);