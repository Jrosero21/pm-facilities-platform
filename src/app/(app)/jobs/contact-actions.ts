"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/server/auth-context";
import { createJobContact } from "@/server/job-contacts";
import type { ContactActionState } from "@/components/contact-form";

function parseContact(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    title: String(formData.get("title") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    isPrimary: formData.get("isPrimary") === "on",
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

export async function createJobContactAction(
  jobId: string,
  _prev: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const ctx = await requireTenant();
  const c = parseContact(formData);
  if (!c.name) return { error: "Name is required." };

  try {
    await createJobContact({
      tenantId: ctx.activeTenant.tenantId,
      jobId,
      ...c,
      createdByUserId: ctx.user.id,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "JOB_NOT_FOUND") {
      return { error: "Job not found in this tenant." };
    }
    throw err;
  }

  revalidatePath(`/jobs/${jobId}`);
  return null;
}
