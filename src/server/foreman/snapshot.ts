import "server-only";

import {
  and,
  asc,
  desc,
  eq,
} from "drizzle-orm";

import { db } from "@/server/db";

import {
  dispatchAssignmentStatuses,
  jobStatuses,
  jobVendorAssignmentStatusHistory,
  vendorCheckIns,
  vendorCheckOuts,
  vendorEtaConfirmations,
} from "@/server/schema";

import {
  getJob,
  getJobDetail,
} from "@/server/jobs";

import {
  getLocation,
} from "@/server/client-locations";

import {
  getPriority,
} from "@/server/job-reference";

import {
  listAssignmentsForJob,
} from "@/server/dispatch";

import {
  listJobEvents,
} from "@/server/job-events";

import {
  listCommunicationsForJob,
} from "@/server/communications";

import {
  listVendorInvoicesForJob,
} from "@/server/billing/vendor-invoices";

import {
  listJobPhotos,
} from "@/server/job-attachments";

import {
  ForemanPmSnapshotSchema,
  type ForemanPmSnapshot,
} from "@/server/foreman/snapshot-contract";

export class ForemanSnapshotMappingError
  extends Error {
  constructor(message: string) {
    super(message);
    this.name =
      "ForemanSnapshotMappingError";
  }
}

type ForemanAssignmentStatusCode =
  NonNullable<
    ForemanPmSnapshot[
      "activeAssignment"
    ]
  >["statusCode"];

function requireAssignmentStatusCode(
  value: string,
): ForemanAssignmentStatusCode {
  switch (value) {
    case "DRAFT":
    case "SENT":
    case "ACCEPTED":
    case "DECLINED":
    case "SCHEDULED":
    case "CONFIRMED":
    case "ON_SITE":
    case "WORK_COMPLETE":
    case "CANCELLED":
    case "GHOSTED":
      return value;

    default:
      throw new ForemanSnapshotMappingError(
        "ASSIGNMENT_STATUS_NOT_MAPPABLE",
      );
  }
}

function toIso(
  value: Date | null,
): string | null {
  return value
    ? value.toISOString()
    : null;
}

function formatAddress(input: {
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
}): string {
  const street = [
    input.addressLine1,
    input.addressLine2,
  ]
    .filter(
      (part): part is string =>
        Boolean(part),
    )
    .join(" ");

  return [
    street,
    `${input.city}, ${input.stateProvince} ${input.postalCode}`,
    input.country,
  ].join(", ");
}

function mapChannel(
  channel: string,
):
  | "EMAIL"
  | "SMS"
  | "PHONE"
  | "PORTAL"
  | "OTHER" {
  switch (channel) {
    case "email":
      return "EMAIL";

    case "sms":
      return "SMS";

    case "phone_call":
      return "PHONE";

    case "vendor_portal":
    case "client_portal":
    case "external_portal":
      return "PORTAL";

    case "internal_note":
    default:
      return "OTHER";
  }
}

function mapDirection(
  direction: string,
):
  | "INBOUND"
  | "OUTBOUND"
  | "INTERNAL" {
  switch (direction) {
    case "inbound":
      return "INBOUND";

    case "outbound":
      return "OUTBOUND";

    default:
      return "INTERNAL";
  }
}

function mapCommunicationParty(
  input: {
    direction: string;
    sourceType: string;
    recipientType: string;
  },
):
  | "CLIENT"
  | "VENDOR"
  | "INTERNAL"
  | null {
  if (input.direction === "internal") {
    return "INTERNAL";
  }

  if (
    input.sourceType ===
      "vendor_update" ||
    input.sourceType ===
      "dispatch_message"
  ) {
    return "VENDOR";
  }

  if (
    input.sourceType ===
    "client_update"
  ) {
    return "CLIENT";
  }

  if (
    input.recipientType ===
    "vendor_contact"
  ) {
    return "VENDOR";
  }

  if (
    input.recipientType ===
    "client_contact"
  ) {
    return "CLIENT";
  }

  // Do not guess whether an unclassified
  // external inbound message came from a
  // client or vendor.
  return null;
}

export async function
getForemanWorkOrderSnapshot(
  tenantId: string,
  jobId: string,
): Promise<ForemanPmSnapshot | null> {
  const [
    job,
    detail,
  ] = await Promise.all([
    getJob(
      tenantId,
      jobId,
    ),

    getJobDetail(
      tenantId,
      jobId,
    ),
  ]);

  if (!job || !detail) {
    return null;
  }

  const [
    location,
    priority,
    assignments,
    events,
    communicationRows,
    invoices,
    photos,
    statusRows,
  ] = await Promise.all([
    getLocation(
      tenantId,
      job.clientLocationId,
    ),

    job.priorityId
      ? getPriority(
          tenantId,
          job.priorityId,
        )
      : Promise.resolve(null),

    listAssignmentsForJob(
      tenantId,
      jobId,
    ),

    listJobEvents(
      tenantId,
      jobId,
    ),

    listCommunicationsForJob(
      tenantId,
      jobId,
    ),

    listVendorInvoicesForJob(
      tenantId,
      jobId,
    ),

    listJobPhotos(
      tenantId,
      jobId,
    ),

    db
      .select({
        code:
          jobStatuses.code,
      })
      .from(jobStatuses)
      .where(
        eq(
          jobStatuses.id,
          job.currentStatusId,
        ),
      )
      .limit(1),
  ]);

  if (!location) {
    throw new ForemanSnapshotMappingError(
      "LOCATION_NOT_FOUND",
    );
  }

  if (!priority) {
    // PM allows a nullable priority during
    // incomplete intake. FOREMAN currently
    // requires one, so fail closed rather
    // than inventing a priority.
    throw new ForemanSnapshotMappingError(
      "PRIORITY_NOT_MAPPABLE",
    );
  }

  const statusCode =
    statusRows[0]?.code;

  if (!statusCode) {
    throw new ForemanSnapshotMappingError(
      "STATUS_NOT_FOUND",
    );
  }

  const assignment =
    assignments[0] ?? null;

  let activeAssignment:
    ForemanPmSnapshot[
      "activeAssignment"
    ] = null;

  let latestCheckoutNote:
    string | null = null;

  if (assignment) {
    const [
      statusHistory,
      etaRows,
      checkInRows,
      checkOutRows,
    ] = await Promise.all([
      db
        .select({
          statusCode:
            dispatchAssignmentStatuses
              .code,

          createdAt:
            jobVendorAssignmentStatusHistory
              .createdAt,
        })
        .from(
          jobVendorAssignmentStatusHistory,
        )
        .innerJoin(
          dispatchAssignmentStatuses,

          eq(
            jobVendorAssignmentStatusHistory
              .toStatusId,

            dispatchAssignmentStatuses
              .id,
          ),
        )
        .where(
          and(
            eq(
              jobVendorAssignmentStatusHistory
                .tenantId,
              tenantId,
            ),

            eq(
              jobVendorAssignmentStatusHistory
                .assignmentId,
              assignment.id,
            ),
          ),
        )
        .orderBy(
          asc(
            jobVendorAssignmentStatusHistory
              .createdAt,
          ),
        ),

      db
        .select({
          etaStartAt:
            vendorEtaConfirmations
              .etaStartAt,

          createdAt:
            vendorEtaConfirmations
              .createdAt,
        })
        .from(
          vendorEtaConfirmations,
        )
        .where(
          and(
            eq(
              vendorEtaConfirmations
                .tenantId,
              tenantId,
            ),

            eq(
              vendorEtaConfirmations
                .assignmentId,
              assignment.id,
            ),
          ),
        )
        .orderBy(
          desc(
            vendorEtaConfirmations
              .createdAt,
          ),
        )
        .limit(1),

      db
        .select({
          occurredAt:
            vendorCheckIns
              .occurredAt,
        })
        .from(vendorCheckIns)
        .where(
          and(
            eq(
              vendorCheckIns
                .tenantId,
              tenantId,
            ),

            eq(
              vendorCheckIns
                .assignmentId,
              assignment.id,
            ),
          ),
        )
        .orderBy(
          desc(
            vendorCheckIns
              .occurredAt,
          ),
        )
        .limit(1),

      db
        .select({
          occurredAt:
            vendorCheckOuts
              .occurredAt,

          note:
            vendorCheckOuts.note,
        })
        .from(vendorCheckOuts)
        .where(
          and(
            eq(
              vendorCheckOuts
                .tenantId,
              tenantId,
            ),

            eq(
              vendorCheckOuts
                .assignmentId,
              assignment.id,
            ),
          ),
        )
        .orderBy(
          desc(
            vendorCheckOuts
              .occurredAt,
          ),
        )
        .limit(1),
    ]);

    const acknowledgement =
      statusHistory.find(
        (row) =>
          [
            "ACCEPTED",
            "SCHEDULED",
            "CONFIRMED",
            "ON_SITE",
            "WORK_COMPLETE",
          ].includes(
            row.statusCode,
          ),
      );

    const decline =
      statusHistory.find(
        (row) =>
          row.statusCode ===
          "DECLINED",
      );

    latestCheckoutNote =
      checkOutRows[0]?.note ??
      null;

    activeAssignment = {
      id:
        assignment.id,

      vendorId:
        assignment.vendorId,

      vendorName:
        assignment.vendorName,

      statusCode:
        requireAssignmentStatusCode(
          assignment.statusCode,
        ),

      sentAt:
        toIso(
          assignment.sentAt,
        ),

      acknowledgedAt:
        toIso(
          acknowledgement
            ?.createdAt ??
            null,
        ),

      declinedAt:
        toIso(
          decline?.createdAt ??
            null,
        ),

      etaStartAt:
        toIso(
          etaRows[0]
            ?.etaStartAt ??
            null,
        ),

      arrivedAt:
        toIso(
          checkInRows[0]
            ?.occurredAt ??
            null,
        ),
    };
  }

  const communications =
    communicationRows.flatMap(
      (communication) => {
        const party =
          mapCommunicationParty({
            direction:
              communication.direction,

            sourceType:
              communication.sourceType,

            recipientType:
              communication.recipientType,
          });

        if (!party) {
          return [];
        }

        const occurredAt =
          communication.sentAt ??
          communication.deliveredAt ??
          communication.createdAt;

        return [
          {
            id:
              communication.id,

            party,

            direction:
              mapDirection(
                communication.direction,
              ),

            channel:
              mapChannel(
                communication.channel,
              ),

            message:
              communication.summary,

            occurredAt:
              occurredAt.toISOString(),
          },
        ];
      },
    );

  const receivedDocuments:
    string[] = [];

  if (photos.length > 0) {
    receivedDocuments.push(
      "PHOTOS",
    );
  }

  const snapshot = {
    job: {
      id:
        job.id,

      jobNumber:
        job.jobNumber,

      sourceType:
        job.sourceType,

      sourceExternalId:
        job.sourceExternalId,

      problemDescription:
        job.problemDescription,

      scopeOfWork:
        job.scopeOfWork,

      generatedScopeOfWork:
        job.generatedScopeOfWork,

      approvedScopeOfWork:
        job.approvedScopeOfWork,

      notToExceedAmount:
        job.notToExceedAmount,

      statusCode,

      priorityCode:
        priority.code,

      tradeName:
        detail.tradeName,

      openedAt:
        job.createdAt
          .toISOString(),

      dueAt:
        toIso(job.dueAt),

      followUpAt:
        toIso(job.followUpAt),

      completedAt:
        toIso(job.completedAt),

      closedAt:
        toIso(job.closedAt),
    },

    client: {
      id:
        detail.clientId,

      name:
        detail.clientName,
    },

    location: {
      id:
        location.id,

      name:
        location.name,

      address:
        formatAddress(
          location,
        ),

      timezone:
        location.timezone,
    },

    activeAssignment,

    // Deliberately not inferred yet.
    // Proposal/change-order approval
    // semantics get their own mapping batch.
    activeApproval: null,

    communications,

    timeline:
      events.map(
        (event) => ({
          id:
            event.id,

          type:
            event.eventType,

          description:
            event.summary,

          occurredAt:
            event.createdAt
              .toISOString(),
        }),
      ),

    closeout: {
      completionNotes:
        latestCheckoutNote,

      // No explicit per-job closeout
      // requirement reader exists yet.
      // Empty means "not surfaced",
      // not "FOREMAN invented a rule".
      requiredDocuments: [],

      receivedDocuments,

      invoiceReceived:
        invoices.length > 0,
    },
  };

  return ForemanPmSnapshotSchema.parse(
    snapshot,
  );
}
