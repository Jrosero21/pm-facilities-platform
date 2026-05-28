// ── Phase 8 batch 8c — billing data-layer error module ───────────────────────────────
// MIXED module (as of 8c.5): re-exports the generic single-active F3 errors (still serving the
// NTE substrate, 8c.1) PLUS billing-domain F3 classes defined here. Billing code imports all of
// its errors from this one surface (not by reaching into agents/config).
//
// 8b's named "NteRuleAlreadyActive" IS SingleActiveInvariantViolated applied to client_nte_rules
// — no distinct class (8c-D1).
export {
  ActivationTargetMismatch,
  SingleActiveInvariantViolated,
} from "@/server/agents/config/errors";

// ── Proposal state-machine F3 errors (8c.5) ──────────────────────────────────────────
// Real billing-domain errors (state guards), NOT programmer errors — reachable via tests that
// assert by class, so the class names + constructor signatures are stable. Mirror the
// agents/config/errors.ts pattern (extends Error + explicit this.name). Carry the proposal id +
// the offending status (or live count) for debuggability.

/** A draft-only operation (edit / line CRUD / send) hit a non-draft proposal. */
export class ProposalNotDraft extends Error {
  constructor(id: string, status: string) {
    super(`Proposal ${id} is not draft (status=${status})`);
    this.name = "ProposalNotDraft";
  }
}

/** recordProposalAcceptance hit a proposal that is not in `sent`. */
export class ProposalNotSent extends Error {
  constructor(id: string, status: string) {
    super(`Proposal ${id} is not sent (status=${status})`);
    this.name = "ProposalNotSent";
  }
}

/** withdrawProposal hit a terminal proposal (declined/expired/superseded/withdrawn). */
export class ProposalNotWithdrawable extends Error {
  constructor(id: string, status: string) {
    super(`Proposal ${id} is not withdrawable (terminal status=${status})`);
    this.name = "ProposalNotWithdrawable";
  }
}

/** createProposalRevision found a live revision in the chain that is not the one being
 *  superseded (single-live-revision invariant, R-7.1-style, data-layer-enforced). */
export class ProposalChainHasLiveRevision extends Error {
  constructor(rootId: string, liveCount: number) {
    super(`Proposal chain ${rootId} has ${liveCount} live revision(s); cannot create another (expected the one being superseded or none)`);
    this.name = "ProposalChainHasLiveRevision";
  }
}

// ── Change-order state-machine F3 errors (8c.6) ──────────────────────────────────────

/** A draft-only operation (edit / line CRUD / submit) hit a non-draft change order. */
export class ChangeOrderNotEditable extends Error {
  constructor(id: string, status: string) {
    super(`Change order ${id} is not editable (status=${status})`);
    this.name = "ChangeOrderNotEditable";
  }
}

/** approve/decline hit a change order that is not in `submitted`. */
export class ChangeOrderNotApprovable extends Error {
  constructor(id: string, status: string) {
    super(`Change order ${id} is not approvable (status=${status})`);
    this.name = "ChangeOrderNotApprovable";
  }
}

/** withdraw hit a change order that is not draft/submitted (approved is a commitment; declined/withdrawn are terminal). */
export class ChangeOrderNotWithdrawable extends Error {
  constructor(id: string, status: string) {
    super(`Change order ${id} is not withdrawable (status=${status})`);
    this.name = "ChangeOrderNotWithdrawable";
  }
}

// ── Vendor-invoice (AP) state-machine F3 errors (8c.7) ────────────────────────────────

/** A draft-edit operation (line CRUD) hit a non-editable vendor invoice (only received/under_review edit). */
export class VendorInvoiceNotEditable extends Error {
  constructor(id: string, status: string) {
    super(`Vendor invoice ${id} is not editable (status=${status})`);
    this.name = "VendorInvoiceNotEditable";
  }
}

/** approveVendorInvoice hit an invoice not in received/under_review (approve is the operator commit point). */
export class VendorInvoiceNotApprovable extends Error {
  constructor(id: string, status: string) {
    super(`Vendor invoice ${id} is not approvable (status=${status})`);
    this.name = "VendorInvoiceNotApprovable";
  }
}

/** disputeVendorInvoice hit an invoice not in received/under_review (dispute is pre-approval). */
export class VendorInvoiceNotDisputable extends Error {
  constructor(id: string, status: string) {
    super(`Vendor invoice ${id} is not disputable (status=${status})`);
    this.name = "VendorInvoiceNotDisputable";
  }
}

// ── Client-invoice (AR) state-machine F3 errors (8c.8) ────────────────────────────────

/** A draft-edit operation (line CRUD) hit a non-draft client invoice. */
export class ClientInvoiceNotEditable extends Error {
  constructor(id: string, status: string) {
    super(`Client invoice ${id} is not editable (status=${status})`);
    this.name = "ClientInvoiceNotEditable";
  }
}

/** sendClientInvoice hit an invoice not in `draft` (issuing requires a draft). */
export class ClientInvoiceNotSendable extends Error {
  constructor(id: string, status: string) {
    super(`Client invoice ${id} is not sendable (status=${status})`);
    this.name = "ClientInvoiceNotSendable";
  }
}

/** voidClientInvoice hit an invoice not in `sent` (void retracts an issued invoice; drafts can't be voided). */
export class ClientInvoiceNotVoidable extends Error {
  constructor(id: string, status: string) {
    super(`Client invoice ${id} is not voidable (status=${status})`);
    this.name = "ClientInvoiceNotVoidable";
  }
}

// ── Payment-record (8c.9) F3 errors ───────────────────────────────────────────────────

/** recordPayment did not reference EXACTLY ONE invoice (both set, or neither). The XOR invariant. */
export class PaymentInvoiceRefInvalid extends Error {
  constructor() {
    super("Payment must reference exactly one invoice (a vendor invoice OR a client invoice, not both or neither)");
    this.name = "PaymentInvoiceRefInvalid";
  }
}

/** The payment direction disagrees with the invoice reference set (outbound↔vendor, inbound↔client). */
export class PaymentDirectionMismatch extends Error {
  constructor(direction: string) {
    super(`Payment direction "${direction}" does not match the invoice reference set`);
    this.name = "PaymentDirectionMismatch";
  }
}

/** recordPayment hit an invoice not in a payable status (vendor must be approved; client must be sent). */
export class PaymentInvoiceNotPayable extends Error {
  constructor(id: string, status: string) {
    super(`Invoice ${id} is not payable (status=${status})`);
    this.name = "PaymentInvoiceNotPayable";
  }
}

/** Payment amount was not a positive decimal(12,2). */
export class PaymentAmountInvalid extends Error {
  constructor(amount: string) {
    super(`Payment amount "${amount}" is invalid (must be a positive decimal)`);
    this.name = "PaymentAmountInvalid";
  }
}

// ── Billing-close (8c.10) F3 error ────────────────────────────────────────────────────

/** markBillingClosed hit a job already in the CLOSED_BILLED terminal status (idempotency guard). */
export class JobAlreadyBillingClosed extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} is already billing-closed`);
    this.name = "JobAlreadyBillingClosed";
  }
}
