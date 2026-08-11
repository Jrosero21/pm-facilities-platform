import { z } from "zod";

import {
  CoordinatorActionSchema,
  type CoordinatorAction,
} from "@/server/foreman/canonical-actions";

import {
  CoordinatorStageSchema,
  type CoordinatorStage,
} from "@/server/foreman/canonical-stages";


const IsoDateTimeSchema = z.iso.datetime({ offset: true });

export const WorkOrderPrioritySchema = z.enum([
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
  "EMERGENCY",
]);

export const WorkOrderStatusSchema = z.enum([
  "OPEN",
  "IN_PROGRESS",
  "ON_HOLD",
  "COMPLETE",
  "CANCELLED",
]);

export const ScopeStatusSchema = z.enum([
  "NONE",
  "DRAFT",
  "APPROVED",
]);

export const ApprovalStatusSchema = z.enum([
  "NOT_REQUIRED",
  "NOT_REQUESTED",
  "PENDING",
  "APPROVED",
  "DECLINED",
]);

export const VendorDispatchStatusSchema = z.enum([
  "NOT_DISPATCHED",
  "DISPATCHED",
  "ACKNOWLEDGED",
  "DECLINED",
  "CANCELLED",
]);

export const CommunicationPartySchema = z.enum([
  "CLIENT",
  "VENDOR",
  "TECHNICIAN",
  "INTERNAL",
  "SYSTEM",
]);

export const CommunicationDirectionSchema = z.enum([
  "INBOUND",
  "OUTBOUND",
  "INTERNAL",
]);

export const CommunicationChannelSchema = z.enum([
  "EMAIL",
  "SMS",
  "PHONE",
  "PORTAL",
  "OTHER",
]);

export const CommunicationSchema = z.object({
  id: z.string().min(1),
  party: CommunicationPartySchema,
  direction: CommunicationDirectionSchema,
  channel: CommunicationChannelSchema,
  message: z.string().min(1),
  occurredAt: IsoDateTimeSchema,
});

export const TimelineEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  description: z.string().min(1),
  occurredAt: IsoDateTimeSchema,
});

export const VendorAssignmentSchema = z.object({
  vendor: z.object({
    id: z.string().min(1).nullable(),
    name: z.string().min(1),
  }),

  dispatchStatus: VendorDispatchStatusSchema,

  dispatchedAt: IsoDateTimeSchema.nullable(),
  acknowledgedAt: IsoDateTimeSchema.nullable(),
  declinedAt: IsoDateTimeSchema.nullable(),
  eta: IsoDateTimeSchema.nullable(),
  arrivedAt: IsoDateTimeSchema.nullable(),
});

export const WorkOrderContextSchema = z.object({
  /**
   * The time this work-order snapshot should be evaluated as of.
   *
   * FOREMAN uses this instead of silently relying on the server clock.
   * This keeps fixtures and future simulated-time scenarios repeatable.
   */
  asOf: IsoDateTimeSchema,

  source: z.object({
    system: z.string().min(1),
    externalId: z.string().min(1),
  }),

  client: z.object({
    id: z.string().min(1).nullable(),
    name: z.string().min(1),
  }),

  location: z.object({
    id: z.string().min(1).nullable(),
    name: z.string().min(1),
    address: z.string().min(1).nullable(),
  }),

  problem: z.object({
    description: z.string().min(1),
    trade: z.string().min(1).nullable(),
    priority: WorkOrderPrioritySchema,
  }),

  /**
   * This is the normalized work-order status supplied to FOREMAN.
   * It is not the derived coordinator stage.
   */
  status: WorkOrderStatusSchema,

  scope: z.object({
    status: ScopeStatusSchema,
    content: z.string().min(1).nullable(),
  }),

  approval: z.object({
    quoteRequired: z.boolean(),
    quoteAmount: z.number().nonnegative().nullable(),
    nteAmount: z.number().nonnegative().nullable(),
    status: ApprovalStatusSchema,
  }),

  /**
   * null means there is currently no active vendor assignment.
   */
  vendorAssignment: VendorAssignmentSchema.nullable(),

  timing: z.object({
    openedAt: IsoDateTimeSchema,
    dueAt: IsoDateTimeSchema.nullable(),
    followUpAt: IsoDateTimeSchema.nullable(),
  }),

  communications: z.array(CommunicationSchema),

  timeline: z.array(TimelineEventSchema),

  closeout: z.object({
    workCompletedAt: IsoDateTimeSchema.nullable(),
    completionNotes: z.string().min(1).nullable(),

    requiredDocuments: z.array(z.string().min(1)),
    receivedDocuments: z.array(z.string().min(1)),

    invoiceReceived: z.boolean(),
  }),

  /**
   * Source-independent business-policy facts that may affect a decision.
   *
   * We will replace generic keys with stronger schemas whenever a scenario
   * proves that a particular policy fact belongs in the canonical contract.
   */
  policyFacts: z.record(
    z.string(),
    z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
    ]),
  ),
});

export type WorkOrderContext = z.infer<
  typeof WorkOrderContextSchema
>;

export const CoordinatorUrgencySchema = z.enum([
  "LOW",
  "NORMAL",
  "HIGH",
  "CRITICAL",
]);

export const CoordinatorConfidenceSchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
]);

export const ExecutionModeSchema = z.enum([
  "DRY_RUN",
  "SANDBOX",
  "LIVE",
]);

export const NextCheckSchema = z.object({
  at: IsoDateTimeSchema.nullable(),
  afterMinutes: z.number().int().positive().nullable(),
  condition: z.string().min(1).nullable(),
});

export const ProposedActionSchema = z.object({
  type: CoordinatorActionSchema,
  payload: z.record(z.string(), z.unknown()),
  permittedInCurrentMode: z.boolean(),
});

export const CoordinatorDecisionSchema = z.object({
  mode: ExecutionModeSchema,

  stage: CoordinatorStageSchema,

  situation: z.string().min(1),

  observedFacts: z.array(z.string().min(1)),

  recommendedAction: CoordinatorActionSchema,

  reason: z.string().min(1),

  urgency: CoordinatorUrgencySchema,

  confidence: CoordinatorConfidenceSchema,

  humanAttentionRequired: z.boolean(),

  proposedAction: ProposedActionSchema,

  nextCheck: NextCheckSchema,
});

export type CoordinatorDecision = z.infer<
  typeof CoordinatorDecisionSchema
>;

export type {
  CoordinatorAction,
  CoordinatorStage,
};