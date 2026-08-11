import assert from "node:assert/strict";

import { z } from "zod";

import {
  CoordinatorDecisionSchema,
} from "@/server/foreman/canonical-contract";

import {
  GET as getForemanDecision,
} from "@/app/api/integrations/foreman/work-orders/[jobId]/decision/route";

const jobId =
  process.argv[2]
    ?.trim();

if (!jobId) {
  throw new Error(
    "Usage: probe-foreman-real-job.ts <jobId>",
  );
}

const readToken =
  process.env
    .FOREMAN_READ_TOKEN
    ?.trim();

if (!readToken) {
  throw new Error(
    "FOREMAN_READ_TOKEN is required.",
  );
}

const SuccessSchema =
  z.object({
    ok:
      z.literal(true),

    asOf:
      z.iso.datetime({
        offset: true,
      }),

    source:
      z.object({
        system:
          z.literal(
            "PM_FACILITIES_PLATFORM",
          ),

        externalId:
          z.string().min(1),
      }),

    decision:
      CoordinatorDecisionSchema,
  });

console.log(
  "----- REAL PM -> DEPLOYED FOREMAN PROBE -----",
);

console.log(
  "Job ID:",
  jobId,
);

// First prove the PM integration endpoint
// still rejects unauthenticated requests.
const unauthorizedResponse =
  await getForemanDecision(
    new Request(
      `http://localhost/api/integrations/foreman/work-orders/${jobId}/decision`,
    ),

    {
      params:
        Promise.resolve({
          jobId,
        }),
    },
  );

assert.equal(
  unauthorizedResponse.status,
  401,
);

console.log(
  "PM integration authentication gate: PASS",
);

// Now execute the authorized read-only path:
//
// PM database SELECTs
// -> ForemanPmSnapshot
// -> canonical WorkOrderContext
// -> deployed FOREMAN
// -> DRY_RUN CoordinatorDecision
const response =
  await getForemanDecision(
    new Request(
      `http://localhost/api/integrations/foreman/work-orders/${jobId}/decision`,

      {
        headers: {
          authorization:
            `Bearer ${readToken}`,
        },
      },
    ),

    {
      params:
        Promise.resolve({
          jobId,
        }),
    },
  );

const raw =
  await response.json();

if (!response.ok) {
  console.error(
    "PM -> FOREMAN request failed:",
    {
      status:
        response.status,

      body:
        raw,
    },
  );

  process.exitCode =
    1;
} else {
  const result =
    SuccessSchema.parse(
      raw,
    );

  assert.equal(
    result.source.externalId,
    jobId,
  );

  assert.equal(
    result.decision.mode,
    "DRY_RUN",
  );

  console.log(
    "PM snapshot read: PASS",
  );

  console.log(
    "Canonical mapping: PASS",
  );

  console.log(
    "Deployed FOREMAN call: PASS",
  );

  console.log(
    "Returned mode:",
    result.decision.mode,
  );

  console.log();
  console.log(
    "----- COORDINATOR DECISION -----",
  );

  console.log(
    "Stage:",
    result.decision.stage,
  );

  console.log(
    "Action:",
    result.decision
      .recommendedAction,
  );

  console.log(
    "Urgency:",
    result.decision.urgency,
  );

  console.log(
    "Confidence:",
    result.decision.confidence,
  );

  console.log(
    "Human attention:",
    result.decision
      .humanAttentionRequired,
  );

  console.log(
    "Situation:",
    result.decision.situation,
  );

  console.log(
    "Reason:",
    result.decision.reason,
  );

  console.log(
    "Next check:",
    result.decision.nextCheck,
  );

  console.log();
  console.log(
    "REAL PM -> DEPLOYED FOREMAN: PASS",
  );
}
