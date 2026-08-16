import { z } from "zod";

export const ForemanCanonicalFingerprintSchema =
  z
    .string()
    .regex(
      /^sha256:[0-9a-f]{64}$/,
    );

export type ForemanCanonicalFingerprint =
  z.infer<
    typeof ForemanCanonicalFingerprintSchema
  >;

const ApprovedScopeTextSchema =
  z.string().min(1).max(500);

export const ForemanApprovedScopeSchema =
  z
    .object({
      summary:
        z.string().min(1).max(750),

      technicianInstructions:
        z
          .array(
            ApprovedScopeTextSchema,
          )
          .min(1)
          .max(12),

      closeoutRequirements:
        z
          .array(
            ApprovedScopeTextSchema,
          )
          .max(8),

      assumptions:
        z
          .array(
            ApprovedScopeTextSchema,
          )
          .max(8),

      informationGaps:
        z
          .array(
            ApprovedScopeTextSchema,
          )
          .max(8),

      confidence:
        z.enum([
          "LOW",
          "MEDIUM",
          "HIGH",
        ]),

      humanReviewRequired:
        z.literal(true),
    })
    .strict();

export const ApprovedScopeHandoffSchema =
  z
    .object({
      version:
        z.literal(
          "approved-scope-handoff.v1",
        ),

      workOrder:
        z
          .object({
            externalId:
              z.string().min(1),

            fingerprint:
              ForemanCanonicalFingerprintSchema,
          })
          .strict(),

      approvedScope:
        ForemanApprovedScopeSchema,

      approval:
        z
          .object({
            approvedDraftFingerprint:
              ForemanCanonicalFingerprintSchema,

            reviewReceiptFingerprint:
              ForemanCanonicalFingerprintSchema,

            reviewerId:
              z.string().min(1),

            reviewedAt:
              z.iso.datetime({
                offset:
                  true,
              }),

            reviewAction:
              z.enum([
                "APPROVE",
                "EDIT_AND_APPROVE",
              ]),

            humanApprovalRecorded:
              z.literal(true),
          })
          .strict(),

      sourceArtifactVersion:
        z.literal(
          "approved-scope-artifact.v1",
        ),

      sourceArtifactFingerprint:
        ForemanCanonicalFingerprintSchema,

      handoffMode:
        z.literal(
          "READ_ONLY",
        ),

      externalWrite:
        z.literal(
          "NONE",
        ),

      handoffFingerprint:
        ForemanCanonicalFingerprintSchema,
    })
    .strict();

export type ApprovedScopeHandoff =
  z.infer<
    typeof ApprovedScopeHandoffSchema
  >;

export const ApprovedScopeHandoffQuerySchema =
  z
    .object({
      reviewReceiptFingerprint:
        ForemanCanonicalFingerprintSchema,
    })
    .strict();

export const ApprovedScopeHandoffApiSuccessSchema =
  z
    .object({
      ok:
        z.literal(true),

      handoff:
        ApprovedScopeHandoffSchema,
    })
    .strict();

export const ApprovedScopeHandoffApiErrorSchema =
  z
    .object({
      ok:
        z.literal(false),

      error:
        z
          .object({
            code:
              z.enum([
                "INVALID_REQUEST",
                "UNAUTHORIZED",
                "SERVICE_NOT_CONFIGURED",
                "NOT_FOUND",
                "INTERNAL_ERROR",
              ]),

            message:
              z.string().min(1),

            details:
              z
                .array(
                  z.string(),
                )
                .optional(),
          })
          .strict(),
    })
    .strict();

export const ApprovedScopeHandoffApiResponseSchema =
  z.union([
    ApprovedScopeHandoffApiSuccessSchema,
    ApprovedScopeHandoffApiErrorSchema,
  ]);

export class ForemanApprovedScopeHandoffBindingError
  extends Error {
  constructor(
    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      "ForemanApprovedScopeHandoffBindingError";
  }
}

export function bindApprovedScopeHandoffToPmJob(
  jobId:
    string,

  value:
    unknown,
): ApprovedScopeHandoff {
  if (!jobId.trim()) {
    throw new ForemanApprovedScopeHandoffBindingError(
      "PM job identity is required for approved-scope handoff binding.",
    );
  }

  const handoff =
    ApprovedScopeHandoffSchema.parse(
      value,
    );

  if (
    handoff.workOrder.externalId !==
    jobId
  ) {
    throw new ForemanApprovedScopeHandoffBindingError(
      "FOREMAN approved-scope handoff does not belong to the requested PM job.",
    );
  }

  return handoff;
}
