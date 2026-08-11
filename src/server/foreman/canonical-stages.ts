import { z } from "zod";

export const COORDINATOR_STAGES = [
  "INTAKE",
  "SCOPING",
  "READY_TO_DISPATCH",
  "AWAITING_VENDOR_ACKNOWLEDGEMENT",
  "AWAITING_VENDOR_ETA",
  "SCHEDULED",
  "AWAITING_ARRIVAL",
  "ON_SITE",
  "WORK_IN_PROGRESS",
  "AWAITING_QUOTE_OR_APPROVAL",
  "AWAITING_CLOSEOUT",
  "AWAITING_INVOICE",
  "COMPLETE",
  "ON_HOLD",
  "EXCEPTION",
] as const;

export const CoordinatorStageSchema = z.enum(COORDINATOR_STAGES);

export type CoordinatorStage = z.infer<typeof CoordinatorStageSchema>;
