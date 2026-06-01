ALTER TABLE `client_locations` ADD `timezone` varchar(64);--> statement-breakpoint
ALTER TABLE `communication_logs` ADD `provider_message_id` varchar(255);--> statement-breakpoint
ALTER TABLE `communication_logs` ADD `attempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `communication_logs` ADD `last_error` text;