// ── Phase 20 — STORAGE PROVIDER SEAM (interface + types) ──────────────────────────────
// The object-storage adapter contract for attachment bytes. Mirrors the send seam's
// provider.ts: a types-only module that depends on NOTHING in the server layer; concrete
// impls (r2/capture) live beside it and the server calls the factory in ./index. A provider
// NEVER touches the DB — it stores/serves bytes and reports; the caller owns all metadata writes.
// Two operations: put() (upload bytes) and getSignedUrl() (time-limited read URL).

/** Upload request. `key` is the object key (the storage_key persisted on the metadata row). */
export type PutRequest = {
  key: string;
  bytes: Uint8Array | Buffer;
  contentType: string;
};

/** A discriminated result — success carries the stored size + checksum; failure carries the error. */
export type PutResult =
  | { ok: true; key: string; size: number; checksum: string }
  | { ok: false; error: string };

/** A discriminated result — success carries a time-limited URL; failure carries the error. */
export type SignedUrlResult =
  | { ok: true; url: string; expiresInSeconds: number }
  | { ok: false; error: string };

/** The storage contract. `name` identifies the impl ('r2' | 'capture'). */
export interface StorageProvider {
  readonly name: string;
  put(req: PutRequest): Promise<PutResult>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<SignedUrlResult>;
}
