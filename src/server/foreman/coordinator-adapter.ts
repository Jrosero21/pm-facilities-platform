import "server-only";

import {
  ForemanPmSnapshotSchema,
  type ForemanPmSnapshot,
} from "@/server/foreman/snapshot-contract";

import {
  WorkOrderContextSchema,
  type WorkOrderContext,
} from "@/server/foreman/canonical-contract";

type AssignmentStatusCode =
  NonNullable<
    ForemanPmSnapshot["activeAssignment"]
  >["statusCode"];

function mapPriority(
  code: ForemanPmSnapshot["job"]["priorityCode"],
): WorkOrderContext["problem"]["priority"] {
  switch (code) {
    case "EMERGENCY":
      return "EMERGENCY";

    case "URGENT":
      return "URGENT";

    case "HIGH":
      return "HIGH";

    case "ROUTINE":
      return "NORMAL";

    case "SCHEDULED":
      return "LOW";
  }
}

function mapJobStatus(
  code: ForemanPmSnapshot["job"]["statusCode"],
): WorkOrderContext["status"] {
  switch (code) {
    case "NEW":
    case "SCHEDULED":
      return "OPEN";

    case "DISPATCHED":
    case "IN_PROGRESS":
      return "IN_PROGRESS";

    case "ON_HOLD":
      return "ON_HOLD";

    case "CANCELLED":
      return "CANCELLED";

    case "PENDING_INVOICE":
    case "COMPLETED":
    case "CLOSED":
    case "CLOSED_BILLED":
      return "COMPLETE";
  }
}

function mapDispatchStatus(
  code: AssignmentStatusCode,
): NonNullable<
  WorkOrderContext["vendorAssignment"]
>["dispatchStatus"] {
  switch (code) {
    case "DRAFT":
      return "NOT_DISPATCHED";

    case "SENT":
      return "DISPATCHED";

    case "ACCEPTED":
    case "SCHEDULED":
    case "CONFIRMED":
    case "ON_SITE":
    case "WORK_COMPLETE":
      return "ACKNOWLEDGED";

    case "DECLINED":
      return "DECLINED";

    case "CANCELLED":
    case "GHOSTED":
      return "CANCELLED";
  }
}

function moneyToNumber(
  value: string | null,
): number | null {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(
      "FOREMAN_MONEY_VALUE_NOT_MAPPABLE",
    );
  }

  return parsed;
}

export function mapForemanPmSnapshotToWorkOrderContext(
  input: ForemanPmSnapshot,
  asOf: string,
): WorkOrderContext {
  const snapshot =
    ForemanPmSnapshotSchema.parse(input);

  const scopeContent =
    snapshot.job.approvedScopeOfWork ??
    snapshot.job.scopeOfWork ??
    snapshot.job.generatedScopeOfWork;

  const scopeStatus =
    snapshot.job.approvedScopeOfWork
      ? "APPROVED"
      : scopeContent
        ? "DRAFT"
        : "NONE";

  const approval =
    snapshot.activeApproval
      ? {
          quoteRequired: true,

          quoteAmount:
            moneyToNumber(
              snapshot.activeApproval.amount,
            ),

          nteAmount:
            moneyToNumber(
              snapshot.job.notToExceedAmount,
            ),

          status:
            snapshot.activeApproval.status,
        }
      : {
          quoteRequired: false,

          quoteAmount: null,

          nteAmount:
            moneyToNumber(
              snapshot.job.notToExceedAmount,
            ),

          status:
            "NOT_REQUIRED" as const,
        };

  return WorkOrderContextSchema.parse({
    asOf,

    source: {
      system:
        "PM_FACILITIES_PLATFORM",

      externalId:
        snapshot.job.id,
    },

    client: {
      id:
        snapshot.client.id,

      name:
        snapshot.client.name,
    },

    location: {
      id:
        snapshot.location.id,

      name:
        snapshot.location.name,

      address:
        snapshot.location.address,
    },

    problem: {
      description:
        snapshot.job.problemDescription,

      trade:
        snapshot.job.tradeName,

      priority:
        mapPriority(
          snapshot.job.priorityCode,
        ),
    },

    status:
      mapJobStatus(
        snapshot.job.statusCode,
      ),

    scope: {
      status:
        scopeStatus,

      content:
        scopeContent,
    },

    approval,

    vendorAssignment:
      snapshot.activeAssignment
        ? {
            vendor: {
              id:
                snapshot
                  .activeAssignment
                  .vendorId,

              name:
                snapshot
                  .activeAssignment
                  .vendorName,
            },

            dispatchStatus:
              mapDispatchStatus(
                snapshot
                  .activeAssignment
                  .statusCode,
              ),

            dispatchedAt:
              snapshot
                .activeAssignment
                .sentAt,

            acknowledgedAt:
              snapshot
                .activeAssignment
                .acknowledgedAt,

            declinedAt:
              snapshot
                .activeAssignment
                .declinedAt,

            eta:
              snapshot
                .activeAssignment
                .etaStartAt,

            arrivedAt:
              snapshot
                .activeAssignment
                .arrivedAt,
          }
        : null,

    timing: {
      openedAt:
        snapshot.job.openedAt,

      dueAt:
        snapshot.job.dueAt,

      followUpAt:
        snapshot.job.followUpAt,
    },

    communications:
      snapshot.communications,

    timeline:
      snapshot.timeline,

    closeout: {
      workCompletedAt:
        snapshot.job.completedAt,

      completionNotes:
        snapshot.closeout
          .completionNotes,

      requiredDocuments:
        snapshot.closeout
          .requiredDocuments,

      receivedDocuments:
        snapshot.closeout
          .receivedDocuments,

      invoiceReceived:
        snapshot.closeout
          .invoiceReceived,
    },

    policyFacts: {
      pmJobNumber:
        snapshot.job.jobNumber,

      pmSourceType:
        snapshot.job.sourceType,

      pmSourceExternalId:
        snapshot.job.sourceExternalId,

      pmJobStatusCode:
        snapshot.job.statusCode,

      pmPriorityCode:
        snapshot.job.priorityCode,

      pmAssignmentStatusCode:
        snapshot.activeAssignment
          ?.statusCode ?? null,

      pmLocationTimezone:
        snapshot.location.timezone,
    },
  });
}
