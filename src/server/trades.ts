import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { trades } from "@/server/schema";

export type TradeRow = typeof trades.$inferSelect;

/**
 * All active trades, alphabetical. trades is a GLOBAL reference table (no
 * tenant_id), so this is intentionally not tenant-scoped. Used to populate
 * trade pickers (e.g. the coverage screen).
 */
export async function listActiveTrades(): Promise<TradeRow[]> {
  return db
    .select()
    .from(trades)
    .where(eq(trades.status, "active"))
    .orderBy(trades.name);
}

/**
 * One trade by id. trades is GLOBAL, so no tenant parameter (matches
 * getJobStatusByCode's shape). Null if it does not exist. Used for "does this
 * trade exist?" existence guards (createJob now; Phase 5 dispatch / Phase 8
 * billing later).
 */
export async function getTrade(id: string): Promise<TradeRow | null> {
  const rows = await db.select().from(trades).where(eq(trades.id, id)).limit(1);
  return rows[0] ?? null;
}
