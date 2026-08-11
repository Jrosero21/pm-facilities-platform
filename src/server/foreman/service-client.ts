import "server-only";

import {
  WorkOrderContextSchema,
  type WorkOrderContext,
  type CoordinatorDecision,
} from "@/server/foreman/canonical-contract";

import {
  CoordinatorEvaluateRequestSchema,
  CoordinatorEvaluateResponseSchema,
} from "@/server/foreman/service-contract";

export const FOREMAN_API_TOKEN_MIN_LENGTH =
  32;

export type ForemanServiceFetch =
  (
    input:
      string |
      URL |
      Request,

    init?:
      RequestInit,
  ) => Promise<Response>;

export class ForemanServiceClientError
  extends Error {
  readonly code:
    string;

  readonly status:
    number | null;

  readonly requestId:
    string | null;

  constructor(input: {
    code:
      string;

    message:
      string;

    status?:
      number | null;

    requestId?:
      string | null;
  }) {
    super(input.message);

    this.name =
      "ForemanServiceClientError";

    this.code =
      input.code;

    this.status =
      input.status ?? null;

    this.requestId =
      input.requestId ?? null;
  }
}

function normalizeBaseUrl(
  value: string,
): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new ForemanServiceClientError({
      code:
        "CLIENT_NOT_CONFIGURED",

      message:
        "FOREMAN service URL must be a valid absolute URL.",
    });
  }

  if (
    url.protocol !== "http:" &&
    url.protocol !== "https:"
  ) {
    throw new ForemanServiceClientError({
      code:
        "CLIENT_NOT_CONFIGURED",

      message:
        "FOREMAN service URL must use http or https.",
    });
  }

  return url
    .toString()
    .replace(
      /\/$/,
      "",
    );
}

function requireToken(
  value: string,
): string {
  const token =
    value.trim();

  if (
    token.length <
    FOREMAN_API_TOKEN_MIN_LENGTH
  ) {
    throw new ForemanServiceClientError({
      code:
        "CLIENT_NOT_CONFIGURED",

      message:
        "FOREMAN API token is missing or too short.",
    });
  }

  return token;
}

async function executeRequest(
  fetchImpl:
    ForemanServiceFetch,

  url:
    string,

  init:
    RequestInit,

  timeoutMs:
    number,
): Promise<Response> {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs,
    );

  try {
    return await fetchImpl(
      url,
      {
        ...init,

        signal:
          controller.signal,
      },
    );
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      error.name ===
        "AbortError";

    throw new ForemanServiceClientError({
      code:
        timedOut
          ? "TIMEOUT"
          : "NETWORK_ERROR",

      message:
        timedOut
          ? "FOREMAN service request timed out."
          : "FOREMAN service request failed.",
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(
  response:
    Response,
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ForemanServiceClientError({
      code:
        "INVALID_RESPONSE",

      message:
        "FOREMAN service returned invalid JSON.",

      status:
        response.status,

      requestId:
        response.headers.get(
          "x-foreman-request-id",
        ),
    });
  }
}

export function createForemanServiceClient(
  options: {
    baseUrl:
      string;

    token:
      string;

    timeoutMs?:
      number;

    fetchImpl?:
      ForemanServiceFetch;
  },
) {
  const baseUrl =
    normalizeBaseUrl(
      options.baseUrl,
    );

  const token =
    requireToken(
      options.token,
    );

  const timeoutMs =
    options.timeoutMs ??
    5000;

  if (
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0
  ) {
    throw new ForemanServiceClientError({
      code:
        "CLIENT_NOT_CONFIGURED",

      message:
        "FOREMAN client timeout must be greater than zero.",
    });
  }

  const fetchImpl =
    options.fetchImpl ??
    globalThis.fetch;

  return {
    async evaluate(
      input:
        WorkOrderContext,
    ): Promise<CoordinatorDecision> {
      const workOrder =
        WorkOrderContextSchema.parse(
          input,
        );

      const canonicalRequest =
        CoordinatorEvaluateRequestSchema.parse({
          mode:
            "DRY_RUN",

          workOrder,
        });

      const response =
        await executeRequest(
          fetchImpl,

          `${baseUrl}/api/v1/coordinator/evaluate`,

          {
            method:
              "POST",

            headers: {
              accept:
                "application/json",

              authorization:
                `Bearer ${token}`,

              "content-type":
                "application/json",
            },

            body:
              JSON.stringify(
                canonicalRequest,
              ),
          },

          timeoutMs,
        );

      const raw =
        await readJson(
          response,
        );

      const parsed =
        CoordinatorEvaluateResponseSchema
          .safeParse(raw);

      if (!parsed.success) {
        throw new ForemanServiceClientError({
          code:
            "INVALID_RESPONSE",

          message:
            "FOREMAN response did not match the v1 coordinator contract.",

          status:
            response.status,

          requestId:
            response.headers.get(
              "x-foreman-request-id",
            ),
        });
      }

      if (!parsed.data.ok) {
        throw new ForemanServiceClientError({
          code:
            parsed.data.error.code,

          message:
            parsed.data.error.message,

          status:
            response.status,

          requestId:
            response.headers.get(
              "x-foreman-request-id",
            ),
        });
      }

      if (!response.ok) {
        throw new ForemanServiceClientError({
          code:
            "HTTP_ERROR",

          message:
            "FOREMAN returned an unexpected HTTP status.",

          status:
            response.status,

          requestId:
            response.headers.get(
              "x-foreman-request-id",
            ),
        });
      }

      if (
        parsed.data.decision.mode !==
        "DRY_RUN"
      ) {
        throw new ForemanServiceClientError({
          code:
            "UNSAFE_RESPONSE_MODE",

          message:
            "FOREMAN returned a decision outside DRY_RUN mode.",

          status:
            response.status,

          requestId:
            response.headers.get(
              "x-foreman-request-id",
            ),
        });
      }

      return parsed.data.decision;
    },
  };
}

export function createForemanServiceClientFromEnv(
  options?: {
    timeoutMs?:
      number;

    fetchImpl?:
      ForemanServiceFetch;
  },
) {
  const baseUrl =
    process.env
      .FOREMAN_SERVICE_URL
      ?.trim();

  const token =
    process.env
      .FOREMAN_API_TOKEN
      ?.trim();

  if (
    !baseUrl ||
    !token
  ) {
    throw new ForemanServiceClientError({
      code:
        "CLIENT_NOT_CONFIGURED",

      message:
        "FOREMAN_SERVICE_URL and FOREMAN_API_TOKEN are required.",
    });
  }

  return createForemanServiceClient({
    baseUrl,
    token,

    timeoutMs:
      options?.timeoutMs,

    fetchImpl:
      options?.fetchImpl,
  });
}
