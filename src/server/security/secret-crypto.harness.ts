// Offline node:assert harness for the secret-crypto util (CF-12.4). Sets a TEST key in-process
// BEFORE any encrypt/decrypt (the util reads the key per-call). Plain tsx, no DB:
//   pnpm exec tsx src/server/security/secret-crypto.harness.ts
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { encryptSecret, decryptSecret, generateSecretKey, KEY_REF } from "./secret-crypto";

let pass = 0;
function test(n: string, fn: () => void) { fn(); pass++; console.log(`  ok ${n}`); }
console.log("secret-crypto harness");

const KEY_A = generateSecretKey();
const KEY_B = generateSecretKey();
process.env.SECRET_ENCRYPTION_KEY = KEY_A;

// flip one byte of the base64-decoded portion at index `part` (1=iv,2=tag,3=ct), re-encode.
function tamper(encoded: string, part: 1 | 2 | 3): string {
  const p = encoded.split(":");
  const buf = Buffer.from(p[part], "base64");
  buf[0] = buf[0] ^ 0xff;
  p[part] = buf.toString("base64");
  return p.join(":");
}

test("KEY_REF is env:v1 (rotation marker)", () => {
  assert.equal(KEY_REF, "env:v1");
});

test("round-trip: empty / long / unicode / realistic API key", () => {
  for (const s of ["", "x", "a".repeat(4096), "ключ-🔑-key", "sk-proj-AbC123_def-456XYZ"]) {
    assert.equal(decryptSecret(encryptSecret(s)), s);
  }
});

test("encoded token shape: v1:<iv>:<tag>:<ct>, 4 colon parts", () => {
  const enc = encryptSecret("sk-test-123");
  const parts = enc.split(":");
  assert.equal(parts.length, 4);
  assert.equal(parts[0], "v1");
});

test("UNIQUE IV: two encrypts of the same plaintext differ, both decrypt back", () => {
  const e1 = encryptSecret("same-secret");
  const e2 = encryptSecret("same-secret");
  assert.notEqual(e1, e2); // random IV per call
  assert.equal(decryptSecret(e1), "same-secret");
  assert.equal(decryptSecret(e2), "same-secret");
});

test("TAMPER ciphertext → throws (GCM auth-tag), no garbage", () => {
  const enc = encryptSecret("sk-test-123");
  assert.throws(() => decryptSecret(tamper(enc, 3)), /tampered or wrong key/);
});

test("TAMPER auth-tag → throws", () => {
  const enc = encryptSecret("sk-test-123");
  assert.throws(() => decryptSecret(tamper(enc, 2)), /tampered or wrong key/);
});

test("TAMPER iv → throws", () => {
  const enc = encryptSecret("sk-test-123");
  assert.throws(() => decryptSecret(tamper(enc, 1)), /tampered or wrong key/);
});

test("UNKNOWN VERSION → throws (forward-compat guard)", () => {
  const enc = encryptSecret("sk-test-123");
  const v2 = enc.replace(/^v1:/, "v2:");
  assert.throws(() => decryptSecret(v2), /unknown version/);
});

test("MALFORMED token → throws", () => {
  assert.throws(() => decryptSecret("not-a-token"), /malformed token/);
});

test("NO PLAINTEXT LEAK: encoded does not contain the plaintext substring", () => {
  const secret = "sk-LEAKCHECK-9999";
  const enc = encryptSecret(secret);
  assert.equal(enc.includes(secret), false);
});

test("WRONG KEY: encrypt with A, decrypt under B → throws", () => {
  process.env.SECRET_ENCRYPTION_KEY = KEY_A;
  const enc = encryptSecret("sk-test-123");
  process.env.SECRET_ENCRYPTION_KEY = KEY_B;
  assert.throws(() => decryptSecret(enc), /tampered or wrong key/);
  process.env.SECRET_ENCRYPTION_KEY = KEY_A; // restore
});

test("BAD KEY LENGTH: 16-byte key → loader throws clear error", () => {
  process.env.SECRET_ENCRYPTION_KEY = randomBytes(16).toString("base64");
  assert.throws(() => encryptSecret("x"), /must be 32 bytes base64/);
  process.env.SECRET_ENCRYPTION_KEY = KEY_A; // restore
});

test("MISSING KEY: unset → throws (never encrypts with empty/default)", () => {
  delete process.env.SECRET_ENCRYPTION_KEY;
  assert.throws(() => encryptSecret("x"), /is not set/);
  process.env.SECRET_ENCRYPTION_KEY = KEY_A; // restore
});

console.log(`\n${pass} passed`);
