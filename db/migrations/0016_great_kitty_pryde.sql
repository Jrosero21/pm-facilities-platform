ALTER TABLE `client_billing_rules` ADD `is_tax_exempt` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `client_billing_rules` ADD `emergency_nte_multiplier` decimal(4,2);