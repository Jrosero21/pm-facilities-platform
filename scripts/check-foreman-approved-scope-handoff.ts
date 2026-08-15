import assert from "node:assert/strict";

import {
  readFileSync,
} from "node:fs";

import {
  ApprovedScopeHandoffApiResponseSchema,
  ApprovedScopeHandoffSchema,
  bindApprovedScopeHandoffToPmJob,
  ForemanApprovedScopeHandoffBindingError,
  type ForemanCanonicalFingerprint,
} from "@/server/foreman/approved-scope-handoff-contract";

import {
  createForemanServiceClient,
  ForemanServiceClientError,
  type ForemanServiceFetch,
} from "@/server/foreman/service-client";

const TEST_TOKEN =
  "pm-foreman-handoff-client-test-token-1234567890";

function fingerprint(
  character:
    string,
): ForemanCanonicalFingerprint {
  return (
    `sha256:${character.repeat(64)}`
  ) as ForemanCanonicalFingerprint;
}

const JOB_ID =
  "pm-job-approved-scope-001";

const REVIEW_FINGERPRINT =
  fingerprint(
    "a",
  );

const NOT_FOUND_FINGERPRINT =
  fingerprint(
    "b",
  );

const INVALID_RESPONSE_FINGERPRINT =
  fingerprint(
    "c",
  );

const handoff =
  ApprovedScopeHandoffSchema.parse({
    version:
      "approved-scope-handoff.v1",

    workOrder: {
      externalId:
        JOB_ID,

      fingerprint:
        fingerprint(
          "d",
        ),
    },

    approvedScope: {
      summary:
        "Inspect the reported door issue and restore normal operation within the approved work objective.",

      technicianInstructions: [
        "Confirm the affected door with the site contact.",
        "Inspect accessible door, latch, and hardware conditions.",
        "Diagnose the cause using appropriate methods selected by the qualified technician.",
        "Repair or adjust confirmed failed components when work remains within the approved objective.",
        "Verify normal operation after work is complete.",
      ],

      closeoutRequirements: [
        "COMPLETION_NOTES",
        "PHOTOS",
        "INVOICE",
      ],

      assumptions: [],

      informationGaps: [],

      confidence:
        "HIGH",

      humanReviewRequired:
        true,
    },

    approval: {
      approvedDraftFingerprint:
        fingerprint(
          "e",
        ),

      reviewReceiptFingerprint:
        REVIEW_FINGERPRINT,

      reviewerId:
        "operator-001",

      reviewedAt:
        "2026-08-15T12:00:00-07:00",

      reviewAction:
        "APPROVE",

      humanApprovalRecorded:
        true,
    },

    sourceArtifactVersion:
      "approved-scope-artifact.v1",

    sourceArtifactFingerprint:
      fingerprint(
        "f",
      ),

    handoffMode:
      "READ_ONLY",

    externalWrite:
      "NONE",

    handoffFingerprint:
      fingerprint(
        "1",
      ),
  });

const requests:
  Request[] = [];

const fetchImpl:
  ForemanServiceFetch =
  async (
    input,
    init,
  ) => {
    const request =
      input instanceof Request
        ? input
        : new Request(
            input.toString(),
            init,
          );

    requests.push(
      request,
    );

    const url =
      new URL(
        request.url,
      );

    const requestId =
      `pm-handoff-test-${requests.length}`;

    if (
      url.pathname !==
      "/api/v1/approved-scope-handoff"
    ) {
      return new Response(
        "Not Found",
        {
          status:
            404,
        },
      );
    }

    if (
      request.headers.get(
        "authorization",
      ) !==
      `Bearer ${TEST_TOKEN}`
    ) {
      return Response.json(
        {
          ok:
            false,

          error: {
            code:
              "UNAUTHORIZED",

            message:
              "A valid FOREMAN bearer token is required.",
          },
        },
        {
          status:
            401,

          headers: {
            "x-foreman-request-id":
              requestId,
          },
        },
      );
    }

    const entries =
      Array.from(
        url.searchParams.entries(),
      );

    assert.deepEqual(
      entries.map(
        ([key]) =>
          key,
      ),
      [
        "reviewReceiptFingerprint",
      ],
    );

    const requestedFingerprint =
      url.searchParams.get(
        "reviewReceiptFingerprint",
      );

    if (
      requestedFingerprint ===
      REVIEW_FINGERPRINT
    ) {
      return Response.json(
        {
          ok:
            true,

          handoff,
        },
        {
          status:
            200,

          headers: {
            "x-foreman-request-id":
              requestId,
          },
        },
      );
    }

    if (
      requestedFingerprint ===
      INVALID_RESPONSE_FINGERPRINT
    ) {
      return Response.json(
        {
          ok:
            true,

          handoff: {
            version:
              "not-a-valid-handoff",
          },
        },
        {
          status:
            200,

          headers: {
            "x-foreman-request-id":
              requestId,
          },
        },
      );
    }

    return Response.json(
      {
        ok:
          false,

        error: {
          code:
            "NOT_FOUND",

          message:
            "No approved scope artifact exists for the supplied review receipt fingerprint.",
        },
      },
      {
        status:
          404,

        headers: {
          "x-foreman-request-id":
            requestId,
        },
      },
    );
  };

async function main() {
  console.log(
    "----- PM READ-ONLY FOREMAN APPROVED SCOPE HANDOFF CONSUMER -----",
  );

  const parsedResponse =
    ApprovedScopeHandoffApiResponseSchema.parse({
      ok:
        true,

      handoff,
    });

  assert.equal(
    parsedResponse.ok,
    true,
  );

  assert.equal(
    handoff.handoffMode,
    "READ_ONLY",
  );

  assert.equal(
    handoff.externalWrite,
    "NONE",
  );

  console.log(
    "PM local contract accepts the exact read-only handoff transport shape: PASS",
  );

  const client =
    createForemanServiceClient({
      baseUrl:
        "http://foreman.test",

      token:
        TEST_TOKEN,

      fetchImpl,
    });

  const received =
    await client
      .getApprovedScopeHandoff(
        REVIEW_FINGERPRINT,
      );

  assert.deepEqual(
    received,
    handoff,
  );

  const firstRequest =
    requests[0];

  assert.ok(
    firstRequest,
  );

  assert.equal(
    firstRequest.method,
    "GET",
  );

  assert.equal(
    firstRequest.headers.get(
      "authorization",
    ),
    `Bearer ${TEST_TOKEN}`,
  );

  const firstUrl =
    new URL(
      firstRequest.url,
    );

  assert.equal(
    firstUrl.pathname,
    "/api/v1/approved-scope-handoff",
  );

  assert.deepEqual(
    Array.from(
      firstUrl.searchParams.entries(),
    ),
    [
      [
        "reviewReceiptFingerprint",
        REVIEW_FINGERPRINT,
      ],
    ],
  );

  console.log(
    "PM service client uses authenticated GET with exactly one receipt identity: PASS",
  );

  const bound =
    bindApprovedScopeHandoffToPmJob(
      JOB_ID,
      received,
    );

  assert.deepEqual(
    bound,
    handoff,
  );

  console.log(
    "PM job identity binds exactly to FOREMAN handoff work-order identity: PASS",
  );

  assert.throws(
    () =>
      bindApprovedScopeHandoffToPmJob(
        "different-pm-job",
        received,
      ),

    (
      error:
        unknown,
    ) => {
      assert.ok(
        error instanceof
          ForemanApprovedScopeHandoffBindingError,
      );

      return true;
    },
  );

  console.log(
    "Cross-job handoff substitution is rejected deterministically: PASS",
  );

  await assert.rejects(
    () =>
      client.getApprovedScopeHandoff(
        NOT_FOUND_FINGERPRINT,
      ),

    (
      error:
        unknown,
    ) => {
      assert.ok(
        error instanceof
          ForemanServiceClientError,
      );

      assert.equal(
        error.code,
        "NOT_FOUND",
      );

      assert.equal(
        error.status,
        404,
      );

      assert.ok(
        error.requestId,
      );

      return true;
    },
  );

  console.log(
    "PM service client preserves controlled FOREMAN NOT_FOUND: PASS",
  );

  const wrongTokenClient =
    createForemanServiceClient({
      baseUrl:
        "http://foreman.test",

      token:
        "pm-intentionally-invalid-token-12345678901234567890",

      fetchImpl,
    });

  await assert.rejects(
    () =>
      wrongTokenClient
        .getApprovedScopeHandoff(
          REVIEW_FINGERPRINT,
        ),

    (
      error:
        unknown,
    ) => {
      assert.ok(
        error instanceof
          ForemanServiceClientError,
      );

      assert.equal(
        error.code,
        "UNAUTHORIZED",
      );

      assert.equal(
        error.status,
        401,
      );

      return true;
    },
  );

  console.log(
    "PM service client preserves upstream authentication failure: PASS",
  );

  await assert.rejects(
    () =>
      client.getApprovedScopeHandoff(
        INVALID_RESPONSE_FINGERPRINT,
      ),

    (
      error:
        unknown,
    ) => {
      assert.ok(
        error instanceof
          ForemanServiceClientError,
      );

      assert.equal(
        error.code,
        "INVALID_RESPONSE",
      );

      return true;
    },
  );

  console.log(
    "PM service client rejects handoff responses outside the public contract: PASS",
  );

  const beforeMalformedInput =
    requests.length;

  await assert.rejects(
    () =>
      client.getApprovedScopeHandoff(
        "not-a-canonical-fingerprint" as
          ForemanCanonicalFingerprint,
      ),
  );

  assert.equal(
    requests.length,
    beforeMalformedInput,
  );

  console.log(
    "Malformed receipt identity is rejected before the FOREMAN request: PASS",
  );

  const routeSource =
    readFileSync(
      "src/app/api/integrations/foreman/work-orders/[jobId]/approved-scope-handoff/route.ts",
      "utf8",
    );

  const authIndex =
    routeSource.indexOf(
      "isForemanReadAuthorized(",
    );

  const queryIndex =
    routeSource.indexOf(
      "ApprovedScopeHandoffQuerySchema\n      .safeParse",
    );

  const snapshotIndex =
    routeSource.indexOf(
      "getForemanWorkOrderSnapshot(",
    );

  const clientIndex =
    routeSource.indexOf(
      ".getApprovedScopeHandoff(",
    );

  const bindingIndex =
    routeSource.indexOf(
      "bindApprovedScopeHandoffToPmJob(",
    );

  assert.ok(
    authIndex >=
      0 &&
    queryIndex >
      authIndex &&
    snapshotIndex >
      queryIndex &&
    clientIndex >
      snapshotIndex &&
    bindingIndex >
      clientIndex,
  );

  assert.ok(
    routeSource.includes(
      "export async function GET",
    ),
  );

  for (
    const method
    of [
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
    ]
  ) {
    assert.equal(
      routeSource.includes(
        `export async function ${method}`,
      ),
      false,
    );
  }

  for (
    const forbidden
    of [
      ".update(",
      ".insert(",
      ".delete(",
      "sendDispatch",
      "publishScope",
      "scope-actions",
      "DATABASE_URL",
    ]
  ) {
    assert.equal(
      routeSource.includes(
        forbidden,
      ),
      false,
    );
  }

  console.log(
    "PM route orders auth, query validation, tenant-scoped snapshot read, FOREMAN read, and job binding with no mutation path: PASS",
  );

  console.log("");
  console.log(
    "PM READ-ONLY FOREMAN APPROVED SCOPE HANDOFF CONSUMER: PASS",
  );
}

main().catch(
  (error) => {
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);
