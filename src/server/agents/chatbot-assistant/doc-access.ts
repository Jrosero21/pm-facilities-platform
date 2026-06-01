import "server-only";

import { readdirSync, realpathSync } from "node:fs";
import path from "node:path";

// ── Phase 16 (16d) — the single filesystem chokepoint for the assistant ───────────────
// EVERY filesystem read the chatbot agent performs routes through resolveDocPath(). The
// agent never touches an agent-supplied path directly — it gets back a safe absolute path
// or a thrown DOC_PATH_FORBIDDEN. Knowledge is PLATFORM-level (docs/ is shared product
// knowledge, not tenant data), so this guard is about path-traversal containment, not
// tenant isolation (that lives on the operational read tools, later slices).

/** Thrown on ANY path-guard failure (traversal, absolute, non-.md, escapes docs/). */
export class DocPathForbiddenError extends Error {
  constructor(reason: string) {
    super(`DOC_PATH_FORBIDDEN: ${reason}`);
    this.name = "DocPathForbiddenError";
  }
}

// The canonical absolute realpath of the repo docs/ dir, resolved ONCE at module load.
// realpathSync collapses any symlinks so the containment check below compares canonical
// paths, not raw strings.
export const DOCS_ROOT: string = realpathSync(path.resolve(process.cwd(), "docs"));

/**
 * The guard. Returns a safe absolute path INSIDE docs/ (a real .md file) or throws
 * DocPathForbiddenError. Reading is the caller's job — this only authorizes the path.
 *
 * Defense layers (each independently sufficient):
 *   1. reject absolute inputs and any '..' segment outright (before touching the fs);
 *   2. reject non-.md extensions;
 *   3. join against DOCS_ROOT and realpathSync (resolves symlinks → canonical path);
 *   4. assert the canonical path is contained in DOCS_ROOT + path.sep (NOT a raw-string
 *      prefix on the user input — a canonical containment check).
 */
export function resolveDocPath(userPath: string): string {
  if (typeof userPath !== "string" || userPath.length === 0) {
    throw new DocPathForbiddenError("empty or non-string path");
  }
  // 1a. no absolute paths (covers '/etc/passwd', 'C:\…', leading-slash escapes).
  if (path.isAbsolute(userPath)) {
    throw new DocPathForbiddenError(`absolute path rejected: ${userPath}`);
  }
  // 1b. no '..' segments anywhere (covers '../.env', 'a/../../etc', 'roadmap/../../pkg').
  const segments = userPath.split(/[\\/]+/);
  if (segments.includes("..")) {
    throw new DocPathForbiddenError(`parent-traversal segment rejected: ${userPath}`);
  }
  // 2. .md only — checked on the raw input before any fs touch.
  if (path.extname(userPath).toLowerCase() !== ".md") {
    throw new DocPathForbiddenError(`non-markdown extension rejected: ${userPath}`);
  }

  // 3. resolve against the canonical docs root, then realpath (collapses symlinks).
  const candidate = path.resolve(DOCS_ROOT, userPath);
  let real: string;
  try {
    real = realpathSync(candidate);
  } catch {
    // Missing file / broken symlink — do not leak existence; treat as forbidden.
    throw new DocPathForbiddenError(`path does not resolve to a real file: ${userPath}`);
  }

  // 4. canonical containment — the realpath MUST live under DOCS_ROOT + separator.
  if (real !== DOCS_ROOT && !real.startsWith(DOCS_ROOT + path.sep)) {
    throw new DocPathForbiddenError(`path escapes docs/: ${userPath}`);
  }
  // Re-assert .md on the realpath (a symlink could point md→non-md).
  if (path.extname(real).toLowerCase() !== ".md") {
    throw new DocPathForbiddenError(`resolved target is not markdown: ${userPath}`);
  }
  return real;
}

/**
 * The curated knowledge corpus — every 07-chatbot-knowledge.md under docs/, discovered at
 * call time, returned as paths RELATIVE to docs/ (so they pass back through resolveDocPath
 * and are citable). Sorted for deterministic ordering.
 */
export function listKnowledgeDocs(): string[] {
  const entries = readdirSync(DOCS_ROOT, { recursive: true, encoding: "utf8" });
  return entries
    .filter((rel) => path.basename(rel) === "07-chatbot-knowledge.md")
    .map((rel) => rel.split(path.sep).join("/"))
    .sort();
}
