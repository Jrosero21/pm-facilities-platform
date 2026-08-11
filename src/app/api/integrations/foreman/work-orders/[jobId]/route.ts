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

    return Response.json(
      {
        ok: true,
        snapshot,
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
        "[foreman:read] snapshot mapping failed",
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

    console.error(
      "[foreman:read] snapshot read failed",
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
