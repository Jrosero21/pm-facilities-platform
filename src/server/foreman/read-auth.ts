import {
  createHash,
  timingSafeEqual,
} from "node:crypto";

export function isBearerTokenAuthorized(
  authorizationHeader: string | null,
  expectedSecret: string | undefined,
): boolean {
  if (!expectedSecret) {
    return false;
  }

  const header =
    authorizationHeader ?? "";

  const presented =
    header.startsWith("Bearer ")
      ? header.slice(7)
      : "";

  if (!presented) {
    return false;
  }

  const presentedHash =
    createHash("sha256")
      .update(presented)
      .digest();

  const expectedHash =
    createHash("sha256")
      .update(expectedSecret)
      .digest();

  return timingSafeEqual(
    presentedHash,
    expectedHash,
  );
}

export function isForemanReadAuthorized(
  request: Request,
): boolean {
  return isBearerTokenAuthorized(
    request.headers.get(
      "authorization",
    ),
    process.env.FOREMAN_READ_TOKEN,
  );
}
