"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireVendor } from "@/server/auth-context";
import { submitVendorInvoice } from "@/server/vendor/submit-vendor-invoice";

type LineItem = {
  category: string;
  description: string;
  quantity: string;
  unit?: string;
  unitPrice: string;
};

/**
 * Parses indexed FormData line-item keys (lineItems[N].field) into an array.
 * HTML form submission natively produces this shape from
 * <input name="lineItems[0].description">. Empty-description rows are skipped.
 */
function parseLineItems(formData: FormData): LineItem[] {
  const indexed = new Map<number, Record<string, string>>();
  for (const [key, value] of formData.entries()) {
    const match = /^lineItems\[(\d+)\]\.(\w+)$/.exec(key);
    if (!match || typeof value !== "string") continue;
    const idx = Number(match[1]);
    if (!indexed.has(idx)) indexed.set(idx, {});
    indexed.get(idx)![match[2]] = value;
  }
  const items: LineItem[] = [];
  for (const idx of [...indexed.keys()].sort((a, b) => a - b)) {
    const row = indexed.get(idx)!;
    if (!row.description?.trim()) continue;
    items.push({
      category: row.category ?? "other",
      description: row.description.trim(),
      quantity: row.quantity ?? "1",
      unit: row.unit?.trim() || undefined,
      unitPrice: row.unitPrice ?? "0",
    });
  }
  return items;
}

export async function submitVendorInvoiceAction(
  assignmentId: string,
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const ctx = await requireVendor();

  const invoiceNumber = formData.get("invoiceNumber");
  const invoiceDateRaw = formData.get("invoiceDate");
  const notes = formData.get("notes");

  const lineItems = parseLineItems(formData);
  if (lineItems.length === 0) {
    return { error: "At least one line item is required." };
  }

  let invoiceDate: Date | undefined;
  if (typeof invoiceDateRaw === "string" && invoiceDateRaw.length > 0) {
    const parsed = new Date(invoiceDateRaw);
    if (Number.isNaN(parsed.getTime())) return { error: "Invalid invoice date." };
    invoiceDate = parsed;
  }

  try {
    await submitVendorInvoice({
      assignmentId,
      tenantId: ctx.activeTenant.tenantId,
      vendorScope: ctx.vendorScope,
      actor: { kind: "user", userId: ctx.user.id },
      invoiceNumber:
        typeof invoiceNumber === "string" && invoiceNumber.length > 0
          ? invoiceNumber
          : undefined,
      invoiceDate,
      notes: typeof notes === "string" && notes.length > 0 ? notes : undefined,
      lineItems,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message === "INVOICE_REQUIRES_LINE_ITEMS" ||
      message === "ASSIGNMENT_NOT_FOUND" ||
      message === "VENDOR_SCOPE_MISMATCH"
    ) {
      return { error: message };
    }
    throw err;
  }

  revalidatePath(`/vendor/jobs/${assignmentId}`);
  redirect(`/vendor/jobs/${assignmentId}`);
}
