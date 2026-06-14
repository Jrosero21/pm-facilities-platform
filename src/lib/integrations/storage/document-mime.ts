// ── Document upload safety + extension (pure util) ────────────────────────────────────
// PURE util — no "use client", no "server-only", no DB/IO (mirrors money.ts / labor-units.ts).
// Phase (iii) Part 1: operators attach DOCUMENTS to a vendor invoice (PDF/Word/Excel/images/etc.).
// PERMISSIVE by design — we ALLOW broadly and BLOCK only what's unsafe to host/serve (executables,
// scripts, and active content like HTML/SVG that a browser would run). Defense in depth: a file is
// rejected if EITHER its MIME OR its original filename extension is in the block set (MIME is
// spoofable, so the extension is checked too).

const MAX_DOCUMENT_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB (under the 16 MB Server Action body cap)

// Unsafe MIME types — executables, scripts, and active/script-carrying content. Block, don't allow.
const BLOCKED_MIME: ReadonlySet<string> = new Set([
  "application/x-msdownload", "application/x-msdos-program", "application/x-dosexec",
  "application/x-executable", "application/vnd.microsoft.portable-executable",
  "application/x-sh", "application/x-csh", "text/x-shellscript", "application/x-bat", "application/bat",
  "application/javascript", "text/javascript", "application/ecmascript", "application/x-msi",
  "text/html", "application/xhtml+xml", "image/svg+xml",
  "application/java-archive", "application/x-java-archive",
  "application/x-apple-diskimage", "application/vnd.android.package-archive",
  "application/x-shockwave-flash",
]);

// Unsafe filename extensions (lowercased, no dot). Same intent as BLOCKED_MIME, applied to the
// ORIGINAL filename so a renamed/mis-typed MIME can't sneak an executable through.
const BLOCKED_EXT: ReadonlySet<string> = new Set([
  "exe", "com", "bat", "cmd", "sh", "bash", "ps1", "psm1", "vbs", "vbe", "js", "mjs", "cjs",
  "jse", "wsf", "wsh", "scr", "pif", "msi", "msp", "jar", "html", "htm", "xhtml", "svg",
  "app", "dmg", "apk", "dll",
]);

// Known-good MIME → storage extension. Anything accepted but unmapped derives its extension from the
// original filename (if clean) or falls back to a generic "bin".
const DOCUMENT_MIME_EXT: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
  "text/plain": "txt",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/tiff": "tif",
  "application/octet-stream": "bin",
};

/** The lowercased extension of a filename (no dot), or null when there is none / it's not clean. */
function filenameExt(fileName: string | null | undefined): string | null {
  if (!fileName) return null;
  const m = /\.([a-z0-9]{1,8})$/i.exec(fileName.trim().toLowerCase());
  return m ? m[1] : null;
}

/** The per-file upload cap for documents (15 MB), under the 16 MB Server Action body limit. */
export { MAX_DOCUMENT_UPLOAD_BYTES };

/**
 * PERMISSIVE safety gate: true unless the MIME OR the original filename extension is unsafe
 * (executable/script/active content). Everything else — PDF, Office, images, csv, txt, unknown
 * document types — is allowed. Empty/missing MIME is allowed (the extension check still guards it).
 */
export function isSafeDocumentUpload(contentType: string | null | undefined, fileName?: string | null): boolean {
  if (contentType && BLOCKED_MIME.has(contentType.toLowerCase().trim())) return false;
  const ext = filenameExt(fileName);
  if (ext && BLOCKED_EXT.has(ext)) return false;
  return true;
}

/**
 * The storage extension for an accepted upload: the known MIME mapping first, else the original
 * filename's clean extension, else "bin". Callers MUST gate with isSafeDocumentUpload first.
 */
export function documentExt(contentType: string | null | undefined, fileName?: string | null): string {
  const mapped = contentType ? DOCUMENT_MIME_EXT[contentType.toLowerCase().trim()] : undefined;
  return mapped ?? filenameExt(fileName) ?? "bin";
}
