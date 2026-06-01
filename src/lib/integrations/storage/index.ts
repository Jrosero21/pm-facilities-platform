// ── Phase 20 — STORAGE SEAM (factory + public surface) ────────────────────────────────
// getStorageProvider() selects the impl by env, mirroring getSendProvider()'s capture-default
// shape. THE HONESTY GUARANTOR: when STORAGE_CAPTURE=1 OR the R2 creds are absent, the
// CaptureStorageProvider is returned and **R2Provider is NEVER constructed** — so the harness
// (which sets STORAGE_CAPTURE=1) cannot reach R2. R2Provider is only built when creds are
// present and capture is not forced.

import type { StorageProvider } from "./provider";
import { CaptureStorageProvider } from "./capture-provider";
import { R2Provider } from "./r2-provider";

export type {
  StorageProvider,
  PutRequest,
  PutResult,
  SignedUrlResult,
} from "./provider";
export { CaptureStorageProvider, getCaptured, resetCaptured } from "./capture-provider";
export { R2Provider } from "./r2-provider";

/**
 * Resolve the active storage provider.
 * - STORAGE_CAPTURE=1 (the harness flag) → CaptureStorageProvider (no network, R2 not built).
 * - R2 creds absent → CaptureStorageProvider (fail-safe: no creds, no real upload).
 * - otherwise → R2Provider (live).
 */
export function getStorageProvider(): StorageProvider {
  if (process.env.STORAGE_CAPTURE === "1" || !process.env.R2_ACCESS_KEY_ID) {
    return new CaptureStorageProvider();
  }
  return new R2Provider();
}
