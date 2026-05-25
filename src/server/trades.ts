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
