import assert from "node:assert/strict";

import {
  ForemanPmSnapshotSchema,
} from "@/server/foreman/snapshot-contract";

import {
  mapForemanPmSnapshotToWorkOrderContext,
} from "@/server/foreman/coordinator-adapter";

import {
  CoordinatorEvaluateRequestSchema,
} from "@/server/foreman/service-contract";

import {
  createForemanServiceClient,
  ForemanServiceClientError,
} from "@/server/foreman/service-client";

const asOf =
  "2026-08-11T19:00:00.000Z";

const sampleSnapshot =
  ForemanPmSnapshotSchema.parse({
    job: {
      id:
        "job-test-1",

      jobNumber:
        1001,

      sourceType:
        "client_portal",

      sourceExternalId:
        "client-wo-1001",

      problemDescription:
        "Rooftop unit is not cooling.",

      scopeOfWork:
        "Inspect rooftop unit.",

      generatedScopeOfWork:
        "Diagnose cooling failure.",

      approvedScopeOfWork:
        "Inspect and repair rooftop unit.",

      notToExceedAmount:
        "1500.00",

      statusCode:
        "DISPATCHED",

      priorityCode:
        "URGENT",

      tradeName:
        "HVAC",

      openedAt:
        "2026-08-11T16:00:00.000Z",

      dueAt:
        "2026-08-11T23:00:00.000Z",

      followUpAt:
        "2026-08-11T19:30:00.000Z",

      completedAt:
        null,

      closedAt:
        null,
    },

    client: {
      id:
        "client-1",

      name:
        "Test Client",
    },

    location: {
      id:
        "location-1",

      name:
        "Test Location",

      address:
        "100 Test Street, Test City, CA 90000, US",

      timezone:
        "America/Los_Angeles",
    },

    activeAssignment: {
      id:
        "assignment-1",

      vendorId:
        "vendor-1",

      vendorName:
        "Test HVAC Vendor",

      statusCode:
        "SENT",

      sentAt:
        "2026-08-11T18:30:00.000Z",

      acknowledgedAt:
        null,

      declinedAt:
        null,

      etaStartAt:
        null,

      arrivedAt:
        null,
    },

    activeApproval: {
      amount:
        "1200.00",

      status:
        "PENDING",
    },

    communications: [],

    timeline: [],

    closeout: {
      completionNotes:
        null,

      requiredDocuments: [
        "completion_notes",
        "photos",
      ],

      receivedDocuments: [],

      invoiceReceived:
        false,
    },
  });

const workOrder =
  mapForemanPmSnapshotToWorkOrderContext(
    sampleSnapshot,
    asOf,
  );

assert.equal(
  workOrder.asOf,
  asOf,
);

assert.equal(
  workOrder.source.system,
  "PM_FACILITIES_PLATFORM",
);

assert.equal(
  workOrder.problem.priority,
  "URGENT",
);

assert.equal(
  workOrder.status,
  "IN_PROGRESS",
);

assert.equal(
  workOrder.scope.status,
  "APPROVED",
);

assert.equal(
  workOrder.scope.content,
  "Inspect and repair rooftop unit.",
);

assert.equal(
  workOrder.approval.quoteRequired,
  true,
);

assert.equal(
  workOrder.approval.quoteAmount,
  1200,
);

assert.equal(
  workOrder.approval.nteAmount,
  1500,
);

assert.equal(
  workOrder.vendorAssignment
    ?.dispatchStatus,
  "DISPATCHED",
);

console.log(
  "Snapshot maps to canonical WorkOrderContext: PASS",
);

const testToken =
  "pm-foreman-service-test-token-1234567890";

let observedMode:
  string | null =
    null;

const client =
  createForemanServiceClient({
    baseUrl:
      "https://foreman.example.test",

    token:
      testToken,

    fetchImpl:
      async (
        input,
        init,
      ) => {
        assert.equal(
          String(input),
          "https://foreman.example.test/api/v1/coordinator/evaluate",
        );

        assert.equal(
          init?.method,
          "POST",
        );

        const headers =
          new Headers(
            init?.headers,
          );

        assert.equal(
          headers.get(
            "authorization",
          ),
          `Bearer ${testToken}`,
        );

        const request =
          CoordinatorEvaluateRequestSchema
            .parse(
              JSON.parse(
                String(
                  init?.body,
                ),
              ),
            );

        observedMode =
          request.mode;

        return new Response(
          JSON.stringify({
            ok: true,

            decision: {
              mode:
                "DRY_RUN",

              stage:
                "AWAITING_VENDOR_ACKNOWLEDGEMENT",

              situation:
                "Vendor dispatch is awaiting acknowledgement.",

              observedFacts: [
                "A vendor assignment has been dispatched.",
                "No vendor acknowledgement is recorded.",
              ],

              recommendedAction:
                "FOLLOW_UP_VENDOR",

              reason:
                "The dispatched vendor has not acknowledged the work order.",

              urgency:
                "HIGH",

              confidence:
                "HIGH",

              humanAttentionRequired:
                true,

              proposedAction: {
                type:
                  "FOLLOW_UP_VENDOR",

                payload: {
                  assignmentId:
                    "assignment-1",
                },

                permittedInCurrentMode:
                  false,
              },

              nextCheck: {
                at:
                  null,

                afterMinutes:
                  30,

                condition:
                  "Vendor acknowledgement is received.",
              },
            },
          }),
          {
            status:
              200,

            headers: {
              "content-type":
                "application/json",

              "x-foreman-request-id":
                "test-request-1",
            },
          },
        );
      },
  });

const decision =
  await client.evaluate(
    workOrder,
  );

assert.equal(
  observedMode,
  "DRY_RUN",
);

assert.equal(
  decision.mode,
  "DRY_RUN",
);

assert.equal(
  decision.stage,
  "AWAITING_VENDOR_ACKNOWLEDGEMENT",
);

assert.equal(
  decision.recommendedAction,
  "FOLLOW_UP_VENDOR",
);

console.log(
  "Service request forced to DRY_RUN: PASS",
);

console.log(
  "Service response validated: PASS",
);

assert.throws(
  () =>
    createForemanServiceClient({
      baseUrl:
        "https://foreman.example.test",

      token:
        "too-short",
    }),

  (error: unknown) =>
    error instanceof
      ForemanServiceClientError &&
    error.code ===
      "CLIENT_NOT_CONFIGURED",
);

console.log(
  "Weak service token rejected: PASS",
);

const invalidClient =
  createForemanServiceClient({
    baseUrl:
      "https://foreman.example.test",

    token:
      testToken,

    fetchImpl:
      async () =>
        new Response(
          JSON.stringify({
            unexpected:
              true,
          }),
          {
            status:
              200,

            headers: {
              "content-type":
                "application/json",
            },
          },
        ),
  });

await assert.rejects(
  () =>
    invalidClient.evaluate(
      workOrder,
    ),

  (error: unknown) =>
    error instanceof
      ForemanServiceClientError &&
    error.code ===
      "INVALID_RESPONSE",
);

console.log(
  "Invalid service response rejected: PASS",
);

console.log();
console.log(
  "PM -> FOREMAN SERVICE CONTRACT: PASS",
);
