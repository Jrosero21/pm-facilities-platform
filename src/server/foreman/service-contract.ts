import { z } from "zod";

import {
  CoordinatorDecisionSchema,
  ExecutionModeSchema,
  WorkOrderContextSchema,
} from "@/server/foreman/canonical-contract";

export const CoordinatorEvaluateRequestSchema =
  z.object({
    mode: ExecutionModeSchema.default(
      "DRY_RUN",
    ),

    workOrder:
      WorkOrderContextSchema,
  });

export type CoordinatorEvaluateRequest =
  z.infer<
    typeof CoordinatorEvaluateRequestSchema
  >;

export const CoordinatorEvaluateSuccessSchema =
  z.object({
    ok: z.literal(true),

    decision:
      CoordinatorDecisionSchema,
  });

export const CoordinatorEvaluateErrorSchema =
  z.object({
    ok: z.literal(false),

    error: z.object({
      code: z.enum([
        "INVALID_JSON",
        "INVALID_REQUEST",
        "MODE_NOT_ALLOWED",
        "UNAUTHORIZED",
        "SERVICE_NOT_CONFIGURED",
        "DEPRECATED_ENDPOINT",
        "INTERNAL_ERROR",
      ]),

      message: z.string().min(1),

      details: z
        .array(z.string())
        .optional(),
    }),
  });

export const CoordinatorEvaluateResponseSchema =
  z.union([
    CoordinatorEvaluateSuccessSchema,
    CoordinatorEvaluateErrorSchema,
  ]);
