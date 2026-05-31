// ── Phase 13 batch 13f — EMAIL-INGESTION CORE: reader contract (types only) ───────────
// core defines the reader contract; readers depend on core, never the reverse (§2.1 — the
// platform is source-agnostic; email is one intake channel among many, exactly as the
// external-portal family is). This file is PURE TYPES — no runtime logic, no DB, no
// "server-only" — so it is importable from anywhere (core, readers, server ingest layer).
// It mirrors src/lib/integrations/core/types.ts (the PortalAdapter contract).
//
// NEVER-THROWS CONTRACT (load-bearing, mirrors mapping.ts's never-throw): parse() ALWAYS
// returns an EmailParseDraft, even for an unreadable message — it returns a failed/0-
// confidence draft rather than throwing. parseOutcome + confidence ARE the review-routing
// mechanism: 'failed'/'partial' (or low confidence) routes the email to the operator
// review queue. An exception would lose the audit trail; a failed draft preserves it.
//
// MAPPING IS NOT A READER CONCERN (D-7, mirrors F8): a reader extracts the provider's
// CODES as plain strings (extractedClientCode etc.) — it does NO id-resolution and NO DB
// work. Turning extractedClientCode into a client id happens later via the frozen Phase-12
// external_client_mappings resolver (core/mapping.ts); the reader never resolves, so the
// one-resolution-system invariant holds.
//
// STUB NOTE (CF-13.3): both registered readers (deterministic, ai_assist) are no-op stubs
// this phase — real field-extraction rules + the AI-assist prompt land once sample emails
// exist to tune against. confidence + matchedFormat are carried NOW so the future
// high-confidence auto-create branch (CF-13.1) has the data it needs without a schema change.

/** The two reader kinds — mirrors email_parse_results.parser_kind (0034). */
export type EmailParserKind = "deterministic" | "ai_assist";

/** Parse outcome — mirrors email_parse_results.parse_outcome (0034); drives review routing. */
export type EmailParseOutcome = "parsed" | "partial" | "failed";

/** The provenance discriminator — mirrors the D-6 source_type enum (carried onto the job). */
export type EmailSourceType = "email_ingestion" | "forwarded_email";

/**
 * Optional location detail a reader can extract from an email body, for the later SF-2
 * location-auto-stub path (mirrors NormalizedWorkOrder's location-detail block). All
 * optional — a genuinely-absent field stays undefined; the ingest layer never invents data.
 */
export type EmailLocationDetail = {
  locationName?: string;
  addressLine1?: string;
  city?: string;
  stateProvince?: string;
  postalCode?: string;
  country?: string;
};

/**
 * The neutral, reader-agnostic shape parse() returns. The ingest mapper (later batch)
 * consumes this: it resolves the extracted_* codes to internal ids via the frozen
 * core/mapping.ts resolvers, then drives the draft→job path. Fields are deliberately
 * limited to what the inbound path can use — `raw` carries the original message for
 * email_payload/audit. This is the email analog of NormalizedWorkOrder.
 */
export type EmailParseDraft = {
  /** Which reader produced this draft → email_parse_results.parser_kind. */
  parserKind: EmailParserKind;
  /** Parse outcome → email_parse_results.parse_outcome; 'failed'/'partial' route to review. */
  parseOutcome: EmailParseOutcome;
  /** 0..1 continuous confidence → email_parse_results.confidence decimal(5,4) (CF-13.1). */
  confidence: number;
  /** The format/rule key matched (deterministic) → email_parse_results.matched_format. */
  matchedFormat?: string;
  /** Parsed CLIENT code as a PLAIN string (D-7 — NOT a resolved id). Feeds the frozen
   *  external_client_mappings resolver later; never resolved here. */
  extractedClientCode?: string;
  /** Parsed location code → feeds external_location_mappings later. */
  extractedLocationCode?: string;
  /** Parsed status code → feeds external_status_mappings later. */
  extractedStatusCode?: string;
  /** Parsed trade code → feeds external_trade_mappings later. */
  extractedTradeCode?: string;
  /** Parsed priority code → feeds external_priority_mappings later (tenant-scoped, F5). */
  extractedPriorityCode?: string;
  /** Location detail for the SF-2 auto-stub path (later). */
  locationDetail?: EmailLocationDetail;
  /** Free-text problem description → jobs.problem_description (via the draft). */
  problemDescription?: string;
  /** Provenance (D-6) — carried onto the job's source_type at approval. */
  sourceType: EmailSourceType;
  /** The original message, preserved (never re-shaped) — mirrors NormalizedWorkOrder.raw. */
  raw?: unknown;
};

/**
 * The neutral input a reader reads. Deliberately DB-free (NOT the drizzle inbound_emails
 * row type) so this file stays import-light and the reader contract is independent of the
 * storage shape. The ingest layer maps an inbound_emails row into this before calling parse().
 */
export type EmailReaderInput = {
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  fromAddress?: string;
  /** Parsed header map (the ingest layer parses the stored raw_headers json at the read
   *  boundary — the MariaDB-JSON gotcha — before handing it here). */
  rawHeaders?: Record<string, unknown>;
  /** Provenance carried from the ingestion account (D-6). */
  sourceType: EmailSourceType;
  /** The original message, passed through to the draft's `raw`. */
  raw?: unknown;
};

/**
 * The reader contract — ONE method (the seam is read-only parsing; mailbox fetch/receive is
 * the receiver layer, deferred — CF-13.2). A reader translates an email's content into the
 * neutral EmailParseDraft; it does NO id-mapping and NO DB work (D-7).
 *   - parse: email content → EmailParseDraft. SYNC, like normalizePayload. NEVER throws —
 *            an unreadable email returns a failed/0-confidence draft (the review-routing path).
 */
export interface EmailReader {
  parse(input: EmailReaderInput): EmailParseDraft;
}
