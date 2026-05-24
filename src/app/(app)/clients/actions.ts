"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { createClient } from "@/server/clients";

export type CreateClientState = { error: string } | null;

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    ((err as { code?: string }).code === "ER_DUP_ENTRY" ||
      (err as { errno?: number }).errno === 1062)
  );
}

export async function createClientAction(
  _prev: CreateClientState,
  formData: FormData,
): Promise<CreateClientState> {
  const ctx = await requireTenant();

  const name = String(formData.get("name") ?? "").trim();
  const clientCode = String(formData.get("clientCode") ?? "").trim() || null;

  if (!name) return { error: "Name is required." };

  let newId: string;
  try {
    const created = await createClient({
      tenantId: ctx.activeTenant.tenantId,
      name,
      clientCode,
      createdByUserId: ctx.user.id,
    });
    newId = created.id;
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return { error: "A client with that name or code already exists in this tenant." };
    }
    throw err;
  }

  revalidatePath("/clients");
  redirect(`/clients/${newId}`);
}
