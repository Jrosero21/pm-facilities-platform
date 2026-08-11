import {
  ZodError,
} from "zod";

import {
  isForemanReadAuthorized,
} from "@/server/foreman/read-auth";

import {
  ForemanSnapshotMappingError,
  getForemanWorkOrderSnapshot,
} from "@/server/foreman/snapshot";

import {
  mapForemanPmSnapshotToWorkOrderContext,
} from "@/server/foreman/coordinator-adapter";

import {
  createForemanServiceClientFromEnv,
  ForemanServiceClientError,
} from "@/server/foreman/service-client";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      jobId: string;
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
        status: 401,
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
        status: 503,
      },
    );
  }

  const {
    jobId,
  } = await context.params;

  if (!jobId.trim()) {
    return Response.json(
      {
        error:
          "invalid_job_id",
      },
      {
        status: 400,
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
          status: 404,
        },
      );
    }

    const asOf =
      new Date().toISOString();

    const workOrder =
      mapForemanPmSnapshotToWorkOrderContext(
        snapshot,
        asOf,
      );

    const client =
      createForemanServiceClientFromEnv();

    const decision =
      await client.evaluate(
        workOrder,
      );

    return Response.json(
      {
        ok: true,

        asOf,

        source: {
          system:
            workOrder.source.system,

          externalId:
            workOrder.source.externalId,
        },

        decision,
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
        ForemanSnapshotMappingError ||
      error instanceof
        ZodError
    ) {
      console.error(
        "[foreman:decision] mapping failed",
        {
          jobId,

          error:
            error.message,
        },
      );

      return Response.json(
        {
          error:
            "snapshot_not_mappable",
        },
        {
          status: 422,
        },
      );
    }

    if (
      error instanceof
      ForemanServiceClientError
    ) {
      console.error(
        "[foreman:decision] service call failed",
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

      const status =
        error.code ===
        "CLIENT_NOT_CONFIGURED"
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
      "[foreman:decision] unexpected failure",
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
        status: 500,
      },
    );
  }
}
