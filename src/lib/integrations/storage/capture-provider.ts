// ── Phase 20 — CAPTURE STORAGE PROVIDER (harness / no-op) ─────────────────────────────
// Stores bytes in an in-memory Map; reaches no network and no filesystem. The phase-blocking
// harness forces this (STORAGE_CAPTURE=1) so the full upload path — put() → write storage_key/
// size/checksum metadata → getSignedUrl() — is exercised end-to-end without touching R2. The
// buffer (getCaptured/resetCaptured) is the harness's assertion surface, mirroring the send
// seam's CaptureProvider: "exactly N objects stored, R2Provider never built".

import { createHash } from "node:crypto";
import type {
  PutRequest,
  PutResult,
  SignedUrlResult,
  StorageProvider,
} from "./provider";

type CapturedObject = {
  bytes: Uint8Array | Buffer;
  contentType: string;
  size: number;
  checksum: string;
};

const captured = new Map<string, CapturedObject>();

/** All objects the CaptureStorageProvider has "stored" this process. Harness reads this. */
export function getCaptured(): ReadonlyMap<string, CapturedObject> {
  return captured;
}

/** Clear the capture buffer (harness setup/teardown). */
export function resetCaptured(): void {
  captured.clear();
}

export class CaptureStorageProvider implements StorageProvider {
  readonly name = "capture";

  async put(req: PutRequest): Promise<PutResult> {
    // Test hook (capture-only): STORAGE_FORCE_FAIL=1 forces a failed put so the harness can
    // exercise the writer's put-before-insert guard (no DB row on a failed put) without R2 or
    // any network. Never set in production paths.
    if (process.env.STORAGE_FORCE_FAIL === "1") {
      return { ok: false, error: "FORCED_FAILURE" };
    }
    const size = req.bytes.length;
    const checksum = createHash("sha256").update(req.bytes).digest("hex");
    captured.set(req.key, { bytes: req.bytes, contentType: req.contentType, size, checksum });
    return { ok: true, key: req.key, size, checksum };
  }

  async getSignedUrl(key: string, expiresInSeconds = 300): Promise<SignedUrlResult> {
    if (!captured.has(key)) {
      return { ok: false, error: "NOT_FOUND" };
    }
    return { ok: true, url: `capture://${key}`, expiresInSeconds };
  }
}
