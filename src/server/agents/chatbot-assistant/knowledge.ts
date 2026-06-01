import "server-only";

import { readFileSync } from "node:fs";
import { DOCS_ROOT, resolveDocPath, listKnowledgeDocs } from "./doc-access";
import path from "node:path";

// ── Phase 16 (16d) — knowledge retrieval (F16-A: keyword over the curated layer) ──────
// searchKnowledge does a simple case-insensitive substring match over the 16 curated
// 07-chatbot-knowledge.md files (878 lines total — small enough to scan at query time; NO
// embeddings / RAG). Matches are returned WITH their source-doc path so the assistant can
// cite (§2.5 citation pattern). readDoc fetches a full doc on demand. BOTH route every
// filesystem access through resolveDocPath — no raw agent-supplied path is ever read.

/** A matched block of knowledge with its citable source path (relative to docs/). */
export type KnowledgeMatch = {
  /** Path relative to docs/, e.g. "phase-5-dispatch/07-chatbot-knowledge.md". */
  sourcePath: string;
  /** The matching section — a small window of lines around the hit, for citation. */
  excerpt: string;
  /** 1-based line number of the first matching line within the source doc. */
  line: number;
};

export type SearchKnowledgeResult = {
  query: string;
  matchCount: number;
  matches: KnowledgeMatch[];
};

export type ReadDocResult = {
  /** The relative path that was requested (echoed for citation). */
  path: string;
  content: string;
};

// A knowledge doc is short; a match window of a few lines keeps excerpts citable without
// dumping the whole file. Sections are delimited by markdown headings where possible.
const CONTEXT_LINES = 3;
const MAX_MATCHES = 20;

/**
 * Case-insensitive substring search over the curated knowledge layer. Returns up to
 * MAX_MATCHES excerpts, each tagged with its source doc path + line. Empty query → no
 * matches (not an error). Reads every doc via resolveDocPath (containment-guarded).
 */
export function searchKnowledge(query: string): SearchKnowledgeResult {
  const needle = (query ?? "").trim().toLowerCase();
  if (needle.length === 0) {
    return { query: query ?? "", matchCount: 0, matches: [] };
  }

  const matches: KnowledgeMatch[] = [];
  for (const relPath of listKnowledgeDocs()) {
    const abs = resolveDocPath(relPath); // guard re-validates every corpus path
    const lines = readFileSync(abs, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(needle)) {
        const start = Math.max(0, i - CONTEXT_LINES);
        const end = Math.min(lines.length, i + CONTEXT_LINES + 1);
        matches.push({
          sourcePath: relPath,
          excerpt: lines.slice(start, end).join("\n"),
          line: i + 1,
        });
        if (matches.length >= MAX_MATCHES) {
          return { query, matchCount: matches.length, matches };
        }
        // Skip ahead past this window so a dense paragraph isn't reported line-by-line.
        i = end - 1;
      }
    }
  }
  return { query, matchCount: matches.length, matches };
}

/**
 * Fetch a full doc on demand. relPath is relative to docs/; resolveDocPath throws
 * DOC_PATH_FORBIDDEN on anything outside docs/ or any non-.md target. Returns the requested
 * relative path (canonicalized) + the file content.
 */
export function readDoc(relPath: string): ReadDocResult {
  const abs = resolveDocPath(relPath);
  const content = readFileSync(abs, "utf8");
  // Echo the path relative to docs/ (canonical) so the caller cites a stable, in-corpus path.
  const rel = path.relative(DOCS_ROOT, abs).split(path.sep).join("/");
  return { path: rel, content };
}
