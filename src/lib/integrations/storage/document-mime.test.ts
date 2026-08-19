import { describe, expect, it } from "vitest";

import { documentExt, isSafeDocumentUpload } from "./document-mime";

describe("isSafeDocumentUpload", () => {
  it("accepts a mapped safe MIME even with a safe filename extension", () => {
    expect(isSafeDocumentUpload("application/pdf", "invoice.pdf")).toBe(true);
  });

  it("accepts when both contentType and fileName are undefined", () => {
    expect(isSafeDocumentUpload(undefined, undefined)).toBe(true);
  });

  it("accepts when contentType is null and fileName has a safe extension", () => {
    expect(isSafeDocumentUpload(null, "report.docx")).toBe(true);
  });

  it("accepts when fileName is undefined even if contentType is an unknown safe-ish value (not blocked)", () => {
    expect(isSafeDocumentUpload("application/vnd.some-unknown-type", undefined)).toBe(true);
  });

  it("rejects when MIME is blocked (even if filename extension is safe)", () => {
    expect(isSafeDocumentUpload("text/html", "invoice.pdf")).toBe(false);
  });

  it("rejects when filename extension is blocked (even if MIME is safe)", () => {
    expect(isSafeDocumentUpload("application/pdf", "malware.exe")).toBe(false);
  });

  it("rejects when both MIME and filename extension are blocked", () => {
    expect(isSafeDocumentUpload("application/javascript", "script.js")).toBe(false);
  });

  it("accepts when MIME would be blocked but the contentType has surrounding whitespace and mixed case", () => {
    // The implementation lowercases+trims before checking, so this should be rejected.
    expect(isSafeDocumentUpload("  TEXT/HTML  ", "ok.pdf")).toBe(false);
  });

  it("accepts when fileName does not have a clean extension match (so BLOCKED_EXT cannot trigger)", () => {
    // Extension regex is /\.[a-z0-9]{1,8}$/ so this one ends with a trailing dot and never matches.
    expect(isSafeDocumentUpload("application/pdf", "weirdname.")).toBe(true);
  });
});

describe("documentExt", () => {
  it("uses the known MIME mapping when contentType is mapped", () => {
    expect(documentExt("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "ignored.pdf")).toBe("docx");
  });

  it("falls back to the clean filename extension when MIME is unmapped", () => {
    expect(documentExt("application/vnd.some-unknown-type", "report.csv")).toBe("csv");
  });

  it("falls back to the generic 'bin' when MIME is null and filename has no clean extension", () => {
    expect(documentExt(null, "weirdname.")).toBe("bin");
  });

  it("falls back to the generic 'bin' when both arguments are undefined", () => {
    expect(documentExt(undefined, undefined)).toBe("bin");
  });

  it("uses MIME mapping even when fileName extension disagrees (mismatch pinned)", () => {
    // MIME says PDF -> pdf, even though filename extension is .exe.
    expect(documentExt("application/pdf", "malware.exe")).toBe("pdf");
  });

  it("uses filename extension when contentType is null even if filename would be unsafe in safety gate", () => {
    // This function does NOT enforce safety; it only computes storage extension.
    expect(documentExt(null, "malware.exe")).toBe("exe");
  });
});
