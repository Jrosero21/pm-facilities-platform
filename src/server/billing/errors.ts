// ── Phase 8 batch 8c — billing data-layer error module ───────────────────────────────
// Re-export shim (8c-D1): billing code imports the generic single-active F3 errors from
// HERE, not by reaching into agents/config. Keeping one import surface for the billing
// domain means billing-SPECIFIC errors (ProposalNotDraft, PaymentDirectionMismatch, …)
// added from 8c.5 onward live alongside these without a later import churn.
//
// 8b's named "NteRuleAlreadyActive" IS SingleActiveInvariantViolated applied to
// client_nte_rules — no distinct class (8c-D1).
export {
  ActivationTargetMismatch,
  SingleActiveInvariantViolated,
} from "@/server/agents/config/errors";
