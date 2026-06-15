// ── Phase 20 — STORAGE SEAM (factory + public surface) ────────────────────────────────
// getStorageProvider() selects the impl by env. CAPTURE IS EXPLICIT-ONLY (STORAGE_CAPTURE=1, the
// harness flag): it stores bytes in memory + serves capture:// urls — never a real backend — so it
// must NEVER be a silent fallback. The old "R2 creds absent → capture" fallback MASKED data loss:
// uploads "succeeded" then evaporated (dev blank-tab; prod serverless per-instance ephemeral) — CF-iii.2.
// Now a real runtime with NO R2 creds THROWS a loud config error here — the single chokepoint that
// protects BOTH document and photo uploads (and reads). R2Provider is built only when creds are present.

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
 * - STORAGE_CAPTURE=1 (the harness flag, EXPLICIT) → CaptureStorageProvider (in-memory, no network).
 * - else R2 creds present → R2Provider (live).
 * - else (real runtime, NO R2 creds) → THROW STORAGE_NOT_CONFIGURED — a loud config error, NEVER a
 *   silent capture fallback (the masking was the CF-iii.2 bug: uploads that "succeed" then vanish).
 */
export function getStorageProvider(): StorageProvider {
  // Capture ONLY on an explicit request — never a silent fallback.
  if (process.env.STORAGE_CAPTURE === "1") {
    return new CaptureStorageProvider();
  }
  // Real runtime: R2 must be configured. Fail LOUDLY at this shared chokepoint (uploads + reads)
  // instead of silently capturing bytes that then evaporate.
  if (!process.env.R2_ACCESS_KEY_ID) {
    throw new Error(
      "STORAGE_NOT_CONFIGURED: file storage is not configured — set R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / " +
        "R2_SECRET_ACCESS_KEY / R2_BUCKET, or set STORAGE_CAPTURE=1 for tests.",
    );
  }
  return new R2Provider();
}
