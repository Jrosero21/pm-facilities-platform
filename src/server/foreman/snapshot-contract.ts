import { z } from "zod";

const IsoDateTimeSchema = z.iso.datetime({
  offset: true,
});

const NullableIsoDateTimeSchema =
  IsoDateTimeSchema.nullable();

const MoneyStringSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/);

export const ForemanPmSnapshotSchema =
  z.object({
    job: z.object({
      id: z.string().min(1),

      jobNumber:
        z.number().int().positive(),

      sourceType:
        z.string().min(1),

      sourceExternalId:
        z.string().min(1).nullable(),

      problemDescription:
        z.string().min(1),

      scopeOfWork:
        z.string().min(1).nullable(),

      generatedScopeOfWork:
        z.string().min(1).nullable(),

      approvedScopeOfWork:
        z.string().min(1).nullable(),

      notToExceedAmount:
        MoneyStringSchema.nullable(),

      statusCode: z.enum([
        "NEW",
        "SCHEDULED",
        "DISPATCHED",
        "IN_PROGRESS",
        "PENDING_INVOICE",
        "ON_HOLD",
        "COMPLETED",
        "CANCELLED",
        "CLOSED",
        "CLOSED_BILLED",
      ]),

      priorityCode: z.enum([
        "EMERGENCY",
        "URGENT",
        "HIGH",
        "ROUTINE",
        "SCHEDULED",
      ]),

      tradeName:
        z.string().min(1).nullable(),

      openedAt:
        IsoDateTimeSchema,

      dueAt:
        NullableIsoDateTimeSchema,

      followUpAt:
        NullableIsoDateTimeSchema,

      completedAt:
        NullableIsoDateTimeSchema,

      closedAt:
        NullableIsoDateTimeSchema,
    }),

    client: z.object({
      id: z.string().min(1),
      name: z.string().min(1),
    }),

    location: z.object({
      id: z.string().min(1),
      name: z.string().min(1),

      address:
        z.string().min(1).nullable(),

      timezone:
        z.string().min(1).nullable(),
    }),

    activeAssignment: z
      .object({
        id: z.string().min(1),

        vendorId:
          z.string().min(1),

        vendorName:
          z.string().min(1),

        statusCode: z.enum([
          "DRAFT",
          "SENT",
          "ACCEPTED",
          "DECLINED",
          "SCHEDULED",
          "CONFIRMED",
          "ON_SITE",
          "WORK_COMPLETE",
          "CANCELLED",
          "GHOSTED",
        ]),

        sentAt:
          NullableIsoDateTimeSchema,

        acknowledgedAt:
          NullableIsoDateTimeSchema,

        declinedAt:
          NullableIsoDateTimeSchema,

        etaStartAt:
          NullableIsoDateTimeSchema,

        arrivedAt:
          NullableIsoDateTimeSchema,
      })
      .nullable(),

    activeApproval: z
      .object({
        amount:
          MoneyStringSchema.nullable(),

        status: z.enum([
          "NOT_REQUESTED",
          "PENDING",
          "APPROVED",
          "DECLINED",
        ]),
      })
      .nullable(),

    communications: z.array(
      z.object({
        id: z.string().min(1),

        party: z.enum([
          "CLIENT",
          "VENDOR",
          "TECHNICIAN",
          "INTERNAL",
          "SYSTEM",
        ]),

        direction: z.enum([
          "INBOUND",
          "OUTBOUND",
          "INTERNAL",
        ]),

        channel: z.enum([
          "EMAIL",
          "SMS",
          "PHONE",
          "PORTAL",
          "OTHER",
        ]),

        message:
          z.string().min(1),

        occurredAt:
          IsoDateTimeSchema,
      }),
    ),

    timeline: z.array(
      z.object({
        id: z.string().min(1),

        type:
          z.string().min(1),

        description:
          z.string().min(1),

        occurredAt:
          IsoDateTimeSchema,
      }),
    ),

    closeout: z.object({
      completionNotes:
        z.string().min(1).nullable(),

      requiredDocuments:
        z.array(z.string().min(1)),

      receivedDocuments:
        z.array(z.string().min(1)),

      invoiceReceived:
        z.boolean(),
    }),
  });

export type ForemanPmSnapshot =
  z.infer<
    typeof ForemanPmSnapshotSchema
  >;
