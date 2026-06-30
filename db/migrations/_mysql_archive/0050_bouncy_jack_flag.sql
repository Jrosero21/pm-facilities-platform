ALTER TABLE `change_order_line_items` ADD `trade_id` varchar(36);--> statement-breakpoint
ALTER TABLE `change_order_line_items` ADD `rate_type` enum('hourly','flat','trip_charge','per_unit','emergency','after_hours');--> statement-breakpoint
ALTER TABLE `client_invoice_line_items` ADD `trade_id` varchar(36);--> statement-breakpoint
ALTER TABLE `client_invoice_line_items` ADD `rate_type` enum('hourly','flat','trip_charge','per_unit','emergency','after_hours');--> statement-breakpoint
ALTER TABLE `jobs` ADD `billing_model` enum('rate_sheet','cost_plus','flat');--> statement-breakpoint
ALTER TABLE `proposal_line_items` ADD `trade_id` varchar(36);--> statement-breakpoint
ALTER TABLE `proposal_line_items` ADD `rate_type` enum('hourly','flat','trip_charge','per_unit','emergency','after_hours');--> statement-breakpoint
ALTER TABLE `change_order_line_items` ADD CONSTRAINT `coli_trade_fk` FOREIGN KEY (`trade_id`) REFERENCES `trades`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_invoice_line_items` ADD CONSTRAINT `cili_trade_fk` FOREIGN KEY (`trade_id`) REFERENCES `trades`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposal_line_items` ADD CONSTRAINT `pli_trade_fk` FOREIGN KEY (`trade_id`) REFERENCES `trades`(`id`) ON DELETE restrict ON UPDATE no action;