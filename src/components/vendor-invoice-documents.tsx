"use client";

import { useActionState } from "react";
import {
  attachVendorInvoiceDocumentAction,
  type VendorInvoiceActionState,
} from "@/app/(app)/jobs/[id]/vendor-invoices/actions";

// ── Phase (iii) Part 1 — vendor-invoice attached-documents section ─────────────────────
// Lists the documents attached to a vendor invoice (each with a presigned download link, resolved
// server-side and passed in) + a tagged upload form. PERMISSIVE file types; the operator tags each
// doc (invoice / sign-off / receipt / photo / other). The Part-3 cost-plus gate looks for an
// 'invoice'-tagged doc. Mirrors the vendor-invoice-line-items-editor form/styling.

const DOC_TAGS = ["invoice", "signoff", "receipt", "photo", "other"] as const;
const TAG_LABEL: Record<string, string> = {
  invoice: "Invoice document",
  signoff: "Sign-off",
  receipt: "Receipt",
  photo: "Photo",
  other: "Other",
};
const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

export type VendorInvoiceDocItem = {
  id: string;
  title: string;
  attachmentType: string;
  sizeBytes: number | null;
  url: string | null;
};

function fmtSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VendorInvoiceDocuments({
  vendorInvoiceId,
  jobId,
  docs,
}: {
  vendorInvoiceId: string;
  jobId: string;
  docs: VendorInvoiceDocItem[];
}) {
  const action = attachVendorInvoiceDocumentAction.bind(null, vendorInvoiceId, jobId);
  const [state, formAction, pending] = useActionState<VendorInvoiceActionState, FormData>(action, null);

  return (
    <div className="space-y-4">
      {docs.length > 0 && (
        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900">{d.title}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-700">{d.attachmentType}</span>
                  {d.sizeBytes != null && <span className="ml-2">{fmtSize(d.sizeBytes)}</span>}
                </p>
              </div>
              {d.url ? (
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-500"
                >
                  View
                </a>
              ) : (
                <span className="shrink-0 text-xs text-neutral-400">unavailable</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="grid gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-neutral-600">
          Document type
          <select name="tag" required defaultValue="invoice" className={inputClass}>
            {DOC_TAGS.map((t) => (
              <option key={t} value={t}>
                {TAG_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-neutral-600">
          File
          <input type="file" name="file" required className={inputClass} />
          <span className="mt-1 block text-[11px] font-normal text-neutral-400">
            PDF, Word, Excel, images, etc. (max 15 MB). Executables/scripts are blocked.
          </span>
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Uploading…" : "Attach document"}
          </button>
          {state?.error && (
            <p role="alert" className="mt-1 text-sm text-red-600">
              {state.error}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
