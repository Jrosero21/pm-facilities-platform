import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

// ── CF-12.4 — credential encryption-at-rest (reversible secret encryption) ─────────────────
// AES-256-GCM (authenticated: confidentiality + tamper-detection via the 16-byte auth tag),
// with a fresh random 12-byte IV per call. For tenant secrets we must DECRYPT to use (LLM API
// keys, external-portal creds) — this is reversible encryption, NOT password hashing.
//
// The master key is read PER CALL from process.env.SECRET_ENCRYPTION_KEY (a 32-byte / 256-bit
// key, base64-encoded). Per-call (not module-cached) is rotation-friendly + testable; the env
// read is negligible next to the cipher. A missing or wrong-size key THROWS — it NEVER falls
// back to a default/empty key (silently encrypting with a weak key is the dangerous failure).
//
// POSTURE (honest): ciphertext at rest in the DB, key in the host env. Protects against a DB-dump
// leak, NOT against host compromise. No KMS pre-host; `keyRef` ("env:v1") lets a future rotation to
// KMS distinguish versions. NEVER log the key or plaintext; NEVER put them in error messages.

const KEY_ENV = "SECRET_ENCRYPTION_KEY";
const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

/** Stored alongside the ciphertext (external_credentials.key_ref) so rotation can tell which key. */
export const KEY_REF = "env:v1";

/**
 * Generate a fresh 32-byte master key, base64-encoded — for an operator to set
 * SECRET_ENCRYPTION_KEY. Does NOT store it anywhere. One-liner equivalent:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
export function generateSecretKey(): string {
  return randomBytes(KEY_BYTES).toString("base64");
}

/** Read + validate the master key from env. THROWS on missing/invalid/wrong-size (never weak-key). */
function loadKey(): Buffer {
  const raw = process.env[KEY_ENV];
  if (!raw) {
    throw new Error(`${KEY_ENV} is not set — refusing to operate without a 32-byte base64 key`);
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(`${KEY_ENV} must be ${KEY_BYTES} bytes base64 (decoded to ${key.length})`);
  }
  return key;
}

/**
 * Encrypt a secret string. Returns a self-describing token:
 *   `v1:<base64(iv)>:<base64(authTag)>:<base64(ciphertext)>`
 * Random IV per call (so two encrypts of the same plaintext differ). Store KEY_REF alongside.
 */
export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/**
 * Decrypt a token from encryptSecret. GCM auth-tag verification means a TAMPERED ciphertext or
 * a WRONG KEY THROWS (never returns garbage). Unknown version is rejected. The error message
 * never contains the plaintext or the key.
 */
export function decryptSecret(encoded: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 4) {
    throw new Error("secret decryption failed (malformed token)");
  }
  const [version, ivB64, tagB64, ctB64] = parts;
  if (version !== VERSION) {
    throw new Error(`secret decryption failed (unknown version "${version}")`);
  }
  const key = loadKey();
  try {
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(tagB64, "base64");
    const ciphertext = Buffer.from(ctB64, "base64");
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Authentication/parse failure — do NOT leak why beyond the generic reason.
    throw new Error("secret decryption failed (tampered or wrong key)");
  }
}
