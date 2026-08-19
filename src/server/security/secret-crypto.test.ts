import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret, generateSecretKey, KEY_REF } from "@/server/security/secret-crypto";

describe("secret-crypto", () => {
  it("exports KEY_REF", () => {
    expect(KEY_REF).toBe("env:v1");
  });

  describe("generateSecretKey", () => {
    it("returns a base64 string for a fresh 32-byte key", () => {
      const key = generateSecretKey();
      // base64 length is implementation-dependent but should be non-empty and decodable.
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);

      const decoded = Buffer.from(key, "base64");
      expect(decoded.length).toBe(32);

      // fresh: two keys should differ (extremely high probability)
      const key2 = generateSecretKey();
      expect(key2).not.toBe(key);
    });
  });

  describe("encryptSecret", () => {
    it("round-trips with decryptSecret and randomizes ciphertext", () => {
      const prev = process.env.SECRET_ENCRYPTION_KEY;
      process.env.SECRET_ENCRYPTION_KEY = generateSecretKey();
      try {
        const plaintext = "tenant-secret-123";
        const encoded1 = encryptSecret(plaintext);
        const encoded2 = encryptSecret(plaintext);

        // Shape: v1:<ivB64>:<tagB64>:<ciphertextB64>
        const parts1 = encoded1.split(":");
        const parts2 = encoded2.split(":");
        expect(parts1).toHaveLength(4);
        expect(parts2).toHaveLength(4);
        expect(parts1[0]).toBe("v1");
        expect(parts2[0]).toBe("v1");

        // Randomized IV => tokens differ
        expect(encoded2).not.toBe(encoded1);

        expect(decryptSecret(encoded1)).toBe(plaintext);
        expect(decryptSecret(encoded2)).toBe(plaintext);

        // Spot-check IV/tag lengths after base64 decoding.
        const iv1 = Buffer.from(parts1[1], "base64");
        const tag1 = Buffer.from(parts1[2], "base64");
        expect(iv1.length).toBe(12);
        expect(tag1.length).toBe(16);
      } finally {
        if (prev === undefined) delete process.env.SECRET_ENCRYPTION_KEY;
        else process.env.SECRET_ENCRYPTION_KEY = prev;
      }
    });

    it("throws when SECRET_ENCRYPTION_KEY is missing (never falls back)", () => {
      const prev = process.env.SECRET_ENCRYPTION_KEY;
      delete process.env.SECRET_ENCRYPTION_KEY;
      try {
        expect(() => encryptSecret("x")).toThrow(
          "SECRET_ENCRYPTION_KEY is not set — refusing to operate without a 32-byte base64 key",
        );
      } finally {
        if (prev === undefined) delete process.env.SECRET_ENCRYPTION_KEY;
        else process.env.SECRET_ENCRYPTION_KEY = prev;
      }
    });

    it("throws when SECRET_ENCRYPTION_KEY decodes to wrong byte length", () => {
      const prev = process.env.SECRET_ENCRYPTION_KEY;
      // Intentionally decode to wrong length: 31 bytes.
      process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(31).toString("base64");
      try {
        expect(() => encryptSecret("x")).toThrow(
          "SECRET_ENCRYPTION_KEY must be 32 bytes base64 (decoded to 31)",
        );
      } finally {
        if (prev === undefined) delete process.env.SECRET_ENCRYPTION_KEY;
        else process.env.SECRET_ENCRYPTION_KEY = prev;
      }
    });
  });

  describe("decryptSecret", () => {
    it("round-trips with encryptSecret for a representative plaintext", () => {
      const prev = process.env.SECRET_ENCRYPTION_KEY;
      process.env.SECRET_ENCRYPTION_KEY = generateSecretKey();
      try {
        const plaintext = "hello secure world";
        const encoded = encryptSecret(plaintext);
        expect(decryptSecret(encoded)).toBe(plaintext);
      } finally {
        if (prev === undefined) delete process.env.SECRET_ENCRYPTION_KEY;
        else process.env.SECRET_ENCRYPTION_KEY = prev;
      }
    });

    it("throws when SECRET_ENCRYPTION_KEY is missing", () => {
      const prev = process.env.SECRET_ENCRYPTION_KEY;
      delete process.env.SECRET_ENCRYPTION_KEY;
      try {
        expect(() => decryptSecret("v1:Zm9v:YmFy:baz")).toThrow(
          "SECRET_ENCRYPTION_KEY is not set — refusing to operate without a 32-byte base64 key",
        );
      } finally {
        if (prev === undefined) delete process.env.SECRET_ENCRYPTION_KEY;
        else process.env.SECRET_ENCRYPTION_KEY = prev;
      }
    });

    it("throws on malformed token (wrong number of parts)", () => {
      const prev = process.env.SECRET_ENCRYPTION_KEY;
      process.env.SECRET_ENCRYPTION_KEY = generateSecretKey();
      try {
        expect(() => decryptSecret("not-a-token")).toThrow(
          "secret decryption failed (malformed token)",
        );
      } finally {
        if (prev === undefined) delete process.env.SECRET_ENCRYPTION_KEY;
        else process.env.SECRET_ENCRYPTION_KEY = prev;
      }
    });

    it("throws on unknown version", () => {
      const prev = process.env.SECRET_ENCRYPTION_KEY;
      process.env.SECRET_ENCRYPTION_KEY = generateSecretKey();
      try {
        expect(() => decryptSecret("v9:Zm9v:YmFy:baz")).toThrow(
          'secret decryption failed (unknown version "v9")',
        );
      } finally {
        if (prev === undefined) delete process.env.SECRET_ENCRYPTION_KEY;
        else process.env.SECRET_ENCRYPTION_KEY = prev;
      }
    });

    it("throws when token is tampered (auth/tag verification fails)", () => {
      const prev = process.env.SECRET_ENCRYPTION_KEY;
      process.env.SECRET_ENCRYPTION_KEY = generateSecretKey();
      try {
        const encoded = encryptSecret("top-secret");
        const parts = encoded.split(":");
        expect(parts).toHaveLength(4);

        // Tamper with ciphertext bytes (not just base64 text) to reliably break GCM auth.
        const ctBytes = Buffer.from(parts[3], "base64");
        expect(ctBytes.length).toBeGreaterThan(0);
        ctBytes[0] = ctBytes[0] ^ 0xff; // flip first byte
        parts[3] = ctBytes.toString("base64");

        const tampered = parts.join(":");
        expect(() => decryptSecret(tampered)).toThrow(
          "secret decryption failed (tampered or wrong key)",
        );
      } finally {
        if (prev === undefined) delete process.env.SECRET_ENCRYPTION_KEY;
        else process.env.SECRET_ENCRYPTION_KEY = prev;
      }
    });
  });
});
