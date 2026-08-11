import { z } from "zod";

export const COORDINATOR_ACTIONS = [
  "GENERATE_SCOPE",
  "REQUEST_INFORMATION",
  "RECOMMEND_VENDOR",
  "FOLLOW_UP_VENDOR",
  "RECORD_VENDOR_ACK",
  "RECORD_ETA",
  "REQUEST_VENDOR_STATUS",
  "DRAFT_CLIENT_UPDATE",
  "REQUEST_QUOTE_APPROVAL",
  "REQUEST_CLOSEOUT_DOCUMENTS",
  "REQUEST_INVOICE",
  "ESCALATE_TO_OPERATOR",
  "NO_ACTION",
] as const;

export const CoordinatorActionSchema = z.enum(COORDINATOR_ACTIONS);

export type CoordinatorAction = z.infer<typeof CoordinatorActionSchema>;