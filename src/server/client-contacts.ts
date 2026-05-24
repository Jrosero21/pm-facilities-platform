import "server-only";

import { and, desc, eq, ne } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { writeAuditLog } from "@/server/audit";
import { getClient } from "@/server/clients";
import { db } from "@/server/db";
import { clientContacts } from "@/server/schema";

export type ClientContactRow = typeof clientContacts.$inferSelect;

/** Non-archived contacts for a client, primary first then by name. */
export async function listClientContacts(
  tenantId: string,
  clientId: string,
): Promise<ClientContactRow[]> {
  return db
    .select()
    .from(clientContacts)
    .where(
      and(
        eq(clientContacts.tenantId, tenantId),
        eq(clientContacts.clientId, clientId),
        ne(clientContacts.status, "archived"),
      ),
    )
    .orderBy(desc(clientContacts.isPrimary), clientContacts.name);
}

export type CreateClientContactInput = {
  tenantId: string;
  clientId: string;
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary?: boolean;
  notes?: string | null;
  createdByUserId: string;
};

/** Create a client contact (guards that the client is in the tenant). */
export async function createClientContact(
  input: CreateClientContactInput,
): Promise<ClientContactRow> {
  const client = await getClient(input.tenantId, input.clientId);
  if (!client) throw new Error("CLIENT_NOT_FOUND");

  const id = uuidv7();
  await db.insert(clientContacts).values({
    id,
    tenantId: input.tenantId,
    clientId: input.clientId,
    name: input.name,
    title: input.title ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    isPrimary: input.isPrimary ?? false,
    notes: input.notes ?? null,
    createdByUserId: input.createdByUserId,
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    userId: input.createdByUserId,
    action: "client_contact.created",
    targetType: "client_contact",
    targetId: id,
    metadata: { clientId: input.clientId, name: input.name },
  });

  const rows = await db
    .select()
    .from(clientContacts)
    .where(and(eq(clientContacts.tenantId, input.tenantId), eq(clientContacts.id, id)))
    .limit(1);
  if (!rows[0]) throw new Error("Contact insert succeeded but row could not be reloaded.");
  return rows[0];
}
