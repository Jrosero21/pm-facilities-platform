import {
  isForemanReadAuthorized,
} from "@/server/foreman/read-auth";

import {
  getForemanWorkOrderSnapshot,
} from "@/server/foreman/snapshot";

import {
  ApprovedScopeHandoffQuerySchema,
  bindApprovedScopeHandoffToPmJob,
  ForemanApprovedScopeHandoffBindingError,
} from "@/server/foreman/approved-scope-handoff-contract";

import {
  createForemanServiceClientFromEnv,
  ForemanServiceClientError,
} from "@/server/foreman/service-client";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export async function GET(
  request:
    Request,

  context: {
    params:
      Promise<{
        jobId:
          string;
      }>;
  },
): Promise<Response> {
  if (
    !isForemanReadAuthorized(
      request,
    )
  ) {
    return Response.json(
      {
        error:
          "unauthorized",
      },
      {
        status:
          401,
      },
    );
  }

  const tenantId =
    process.env
      .FOREMAN_TENANT_ID;

  if (!tenantId) {
    return Response.json(
      {
        error:
          "integration_disabled",
      },
      {
        status:
          503,
      },
    );
  }

  const {
    jobId,
  } =
    await context.params;

  if (!jobId.trim()) {
    return Response.json(
      {
        error:
          "invalid_job_id",
      },
      {
        status:
          400,
      },
    );
  }

  let url:
    URL;

  try {
    url =
      new URL(
        request.url,
      );
  } catch {
    return Response.json(
      {
        error:
          "invalid_request",
      },
      {
        status:
          400,
      },
    );
  }

  const queryEntries =
    Array.from(
      url.searchParams.entries(),
    );

  if (
    queryEntries.length !==
      1 ||
    queryEntries[0]?.[0] !==
      "reviewReceiptFingerprint"
  ) {
    return Response.json(
      {
        error:
          "invalid_review_receipt_fingerprint",
      },
      {
        status:
          400,
      },
    );
  }

  const parsedQuery =
    ApprovedScopeHandoffQuerySchema
      .safeParse({
        reviewReceiptFingerprint:
          queryEntries[0][1],
      });

  if (!parsedQuery.success) {
    return Response.json(
      {
        error:
          "invalid_review_receipt_fingerprint",
      },
      {
        status:
          400,
      },
    );
  }

  try {
    const snapshot =
      await getForemanWorkOrderSnapshot(
        tenantId,
        jobId,
      );

    if (!snapshot) {
      return Response.json(
        {
          error:
            "not_found",
        },
        {
          status:
            404,
        },
      );
    }

    const client =
      createForemanServiceClientFromEnv();

    const handoff =
      await client
        .getApprovedScopeHandoff(
          parsedQuery.data
            .reviewReceiptFingerprint,
        );

    const boundHandoff =
      bindApprovedScopeHandoffToPmJob(
        snapshot.job.id,
        handoff,
      );

    return Response.json(
      {
        ok:
          true,

        jobId:
          snapshot.job.id,

        reviewReceiptFingerprint:
          parsedQuery.data
            .reviewReceiptFingerprint,

        handoff:
          boundHandoff,
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (error) {
    if (
      error instanceof
      ForemanApprovedScopeHandoffBindingError
    ) {
      console.error(
        "[foreman:approved-scope-handoff] job binding failed",
        {
          jobId,

          error:
            error.message,
        },
      );

      return Response.json(
        {
          error:
            "foreman_handoff_job_mismatch",
        },
        {
          status:
            502,
        },
      );
    }

    if (
      error instanceof
      ForemanServiceClientError
    ) {
      console.error(
        "[foreman:approved-scope-handoff] service call failed",
        {
          jobId,

          code:
            error.code,

          status:
            error.status,

          requestId:
            error.requestId,
        },
      );

      if (
        error.code ===
        "NOT_FOUND"
      ) {
        return Response.json(
          {
            error:
              "approved_scope_handoff_not_found",

            upstreamCode:
              error.code,

            requestId:
              error.requestId,
          },
          {
            status:
              404,
          },
        );
      }

      const status =
        error.code ===
          "CLIENT_NOT_CONFIGURED" ||
        error.code ===
          "SERVICE_NOT_CONFIGURED"
          ? 503
          : error.code ===
              "TIMEOUT"
            ? 504
            : 502;

      return Response.json(
        {
          error:
            "foreman_service_unavailable",

          upstreamCode:
            error.code,

          requestId:
            error.requestId,
        },
        {
          status,
        },
      );
    }

    console.error(
      "[foreman:approved-scope-handoff] unexpected failure",
      {
        jobId,

        error:
          error instanceof Error
            ? error.message
            : "unknown",
      },
    );

    return Response.json(
      {
        error:
          "internal_error",
      },
      {
        status:
          500,
      },
    );
  }
}
