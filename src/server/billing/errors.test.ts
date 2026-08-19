import { describe, expect, it } from "vitest";

import {
  ActivationTargetMismatch,
  ChangeOrderNotApprovable,
  ChangeOrderNotEditable,
  ChangeOrderNotWithdrawable,
  ClientInvoiceNotEditable,
  ClientInvoiceNotSendable,
  ClientInvoiceNotVoidable,
  JobAlreadyBillingClosed,
  PaymentAmountInvalid,
  PaymentDirectionMismatch,
  PaymentInvoiceRefInvalid,
  PaymentInvoiceNotPayable,
  ProposalChainHasLiveRevision,
  ProposalNotDraft,
  ProposalNotSent,
  ProposalNotWithdrawable,
  SingleActiveInvariantViolated,
  VendorInvoiceNotApprovable,
  VendorInvoiceNotDisputable,
  VendorInvoiceNotEditable,
} from "@/server/billing/errors";

describe("ProposalNotDraft", () => {
  it("builds message + name from inputs", () => {
    const err = new ProposalNotDraft("p-123", "submitted");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ProposalNotDraft);
    expect(err.name).toBe("ProposalNotDraft");
    expect(err.message).toBe("Proposal p-123 is not draft (status=submitted)");
  });

  it("pins edge: empty id and empty status", () => {
    const err = new ProposalNotDraft("", "");
    expect(err.name).toBe("ProposalNotDraft");
    expect(err.message).toBe("Proposal  is not draft (status=)");
  });
});

describe("ProposalNotSent", () => {
  it("builds message + name from inputs", () => {
    const err = new ProposalNotSent("p-123", "draft");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ProposalNotSent);
    expect(err.name).toBe("ProposalNotSent");
    expect(err.message).toBe("Proposal p-123 is not sent (status=draft)");
  });

  it("pins edge: empty id and status", () => {
    const err = new ProposalNotSent("", "");
    expect(err.name).toBe("ProposalNotSent");
    expect(err.message).toBe("Proposal  is not sent (status=)");
  });
});

describe("ProposalNotWithdrawable", () => {
  it("builds message + name from inputs", () => {
    const err = new ProposalNotWithdrawable("p-123", "declined");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ProposalNotWithdrawable);
    expect(err.name).toBe("ProposalNotWithdrawable");
    expect(err.message).toBe("Proposal p-123 is not withdrawable (terminal status=declined)");
  });

  it("pins edge: empty id and status", () => {
    const err = new ProposalNotWithdrawable("", "");
    expect(err.name).toBe("ProposalNotWithdrawable");
    expect(err.message).toBe("Proposal  is not withdrawable (terminal status=)");
  });
});

describe("ProposalChainHasLiveRevision", () => {
  it("builds message + name from representative inputs", () => {
    const err = new ProposalChainHasLiveRevision("root-1", 2);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ProposalChainHasLiveRevision);
    expect(err.name).toBe("ProposalChainHasLiveRevision");
    expect(err.message).toBe(
      "Proposal chain root-1 has 2 live revision(s); cannot create another (expected the one being superseded or none)"
    );
  });

  it("pins numeric boundary sides around representative 0 vs 1", () => {
    const err0 = new ProposalChainHasLiveRevision("root-1", 0);
    expect(err0.name).toBe("ProposalChainHasLiveRevision");
    expect(err0.message).toBe(
      "Proposal chain root-1 has 0 live revision(s); cannot create another (expected the one being superseded or none)"
    );

    const err1 = new ProposalChainHasLiveRevision("root-1", 1);
    expect(err1.name).toBe("ProposalChainHasLiveRevision");
    expect(err1.message).toBe(
      "Proposal chain root-1 has 1 live revision(s); cannot create another (expected the one being superseded or none)"
    );
  });
});

describe("ChangeOrderNotEditable", () => {
  it("builds message + name from inputs", () => {
    const err = new ChangeOrderNotEditable("c-9", "submitted");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ChangeOrderNotEditable);
    expect(err.name).toBe("ChangeOrderNotEditable");
    expect(err.message).toBe("Change order c-9 is not editable (status=submitted)");
  });

  it("pins edge: empty id/status", () => {
    const err = new ChangeOrderNotEditable("", "");
    expect(err.name).toBe("ChangeOrderNotEditable");
    expect(err.message).toBe("Change order  is not editable (status=)");
  });
});

describe("ChangeOrderNotApprovable", () => {
  it("builds message + name from inputs", () => {
    const err = new ChangeOrderNotApprovable("c-9", "approved");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ChangeOrderNotApprovable);
    expect(err.name).toBe("ChangeOrderNotApprovable");
    expect(err.message).toBe("Change order c-9 is not approvable (status=approved)");
  });

  it("pins edge: empty id/status", () => {
    const err = new ChangeOrderNotApprovable("", "");
    expect(err.name).toBe("ChangeOrderNotApprovable");
    expect(err.message).toBe("Change order  is not approvable (status=)");
  });
});

describe("ChangeOrderNotWithdrawable", () => {
  it("builds message + name from inputs", () => {
    const err = new ChangeOrderNotWithdrawable("c-9", "withdrawn");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ChangeOrderNotWithdrawable);
    expect(err.name).toBe("ChangeOrderNotWithdrawable");
    expect(err.message).toBe("Change order c-9 is not withdrawable (status=withdrawn)");
  });

  it("pins edge: empty id/status", () => {
    const err = new ChangeOrderNotWithdrawable("", "");
    expect(err.name).toBe("ChangeOrderNotWithdrawable");
    expect(err.message).toBe("Change order  is not withdrawable (status=)");
  });
});

describe("VendorInvoiceNotEditable", () => {
  it("builds message + name from inputs", () => {
    const err = new VendorInvoiceNotEditable("v-1", "under_review");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(VendorInvoiceNotEditable);
    expect(err.name).toBe("VendorInvoiceNotEditable");
    expect(err.message).toBe("Vendor invoice v-1 is not editable (status=under_review)");
  });

  it("pins edge: empty id/status", () => {
    const err = new VendorInvoiceNotEditable("", "");
    expect(err.name).toBe("VendorInvoiceNotEditable");
    expect(err.message).toBe("Vendor invoice  is not editable (status=)");
  });
});

describe("VendorInvoiceNotApprovable", () => {
  it("builds message + name from inputs", () => {
    const err = new VendorInvoiceNotApprovable("v-1", "sent");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(VendorInvoiceNotApprovable);
    expect(err.name).toBe("VendorInvoiceNotApprovable");
    expect(err.message).toBe("Vendor invoice v-1 is not approvable (status=sent)");
  });

  it("pins edge: empty id/status", () => {
    const err = new VendorInvoiceNotApprovable("", "");
    expect(err.name).toBe("VendorInvoiceNotApprovable");
    expect(err.message).toBe("Vendor invoice  is not approvable (status=)");
  });
});

describe("VendorInvoiceNotDisputable", () => {
  it("builds message + name from inputs", () => {
    const err = new VendorInvoiceNotDisputable("v-1", "approved");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(VendorInvoiceNotDisputable);
    expect(err.name).toBe("VendorInvoiceNotDisputable");
    expect(err.message).toBe("Vendor invoice v-1 is not disputable (status=approved)");
  });

  it("pins edge: empty id/status", () => {
    const err = new VendorInvoiceNotDisputable("", "");
    expect(err.name).toBe("VendorInvoiceNotDisputable");
    expect(err.message).toBe("Vendor invoice  is not disputable (status=)");
  });
});

describe("ClientInvoiceNotEditable", () => {
  it("builds message + name from inputs", () => {
    const err = new ClientInvoiceNotEditable("ci-3", "sent");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ClientInvoiceNotEditable);
    expect(err.name).toBe("ClientInvoiceNotEditable");
    expect(err.message).toBe("Client invoice ci-3 is not editable (status=sent)");
  });

  it("pins edge: empty id/status", () => {
    const err = new ClientInvoiceNotEditable("", "");
    expect(err.name).toBe("ClientInvoiceNotEditable");
    expect(err.message).toBe("Client invoice  is not editable (status=)");
  });
});

describe("ClientInvoiceNotSendable", () => {
  it("builds message + name from inputs", () => {
    const err = new ClientInvoiceNotSendable("ci-3", "draft");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ClientInvoiceNotSendable);
    expect(err.name).toBe("ClientInvoiceNotSendable");
    expect(err.message).toBe("Client invoice ci-3 is not sendable (status=draft)");
  });

  it("pins edge: empty id/status", () => {
    const err = new ClientInvoiceNotSendable("", "");
    expect(err.name).toBe("ClientInvoiceNotSendable");
    expect(err.message).toBe("Client invoice  is not sendable (status=)");
  });
});

describe("ClientInvoiceNotVoidable", () => {
  it("builds message + name from inputs", () => {
    const err = new ClientInvoiceNotVoidable("ci-3", "draft");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ClientInvoiceNotVoidable);
    expect(err.name).toBe("ClientInvoiceNotVoidable");
    expect(err.message).toBe("Client invoice ci-3 is not voidable (status=draft)");
  });

  it("pins edge: empty id/status", () => {
    const err = new ClientInvoiceNotVoidable("", "");
    expect(err.name).toBe("ClientInvoiceNotVoidable");
    expect(err.message).toBe("Client invoice  is not voidable (status=)");
  });
});

describe("PaymentInvoiceRefInvalid", () => {
  it("builds the fixed message + name", () => {
    const err = new PaymentInvoiceRefInvalid();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PaymentInvoiceRefInvalid);
    expect(err.name).toBe("PaymentInvoiceRefInvalid");
    expect(err.message).toBe(
      "Payment must reference exactly one invoice (a vendor invoice OR a client invoice, not both or neither)"
    );
  });
});

describe("PaymentDirectionMismatch", () => {
  it("builds message + name from representative direction", () => {
    const err = new PaymentDirectionMismatch("outbound");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PaymentDirectionMismatch);
    expect(err.name).toBe("PaymentDirectionMismatch");
    expect(err.message).toBe(
      "Payment direction \"outbound\" does not match the invoice reference set"
    );
  });

  it("pins edge: empty direction", () => {
    const err = new PaymentDirectionMismatch("");
    expect(err.name).toBe("PaymentDirectionMismatch");
    expect(err.message).toBe('Payment direction "" does not match the invoice reference set');
  });
});

describe("PaymentInvoiceNotPayable", () => {
  it("builds message + name from inputs", () => {
    const err = new PaymentInvoiceNotPayable("inv-7", "approved");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PaymentInvoiceNotPayable);
    expect(err.name).toBe("PaymentInvoiceNotPayable");
    expect(err.message).toBe("Invoice inv-7 is not payable (status=approved)");
  });

  it("pins edge: empty id/status", () => {
    const err = new PaymentInvoiceNotPayable("", "");
    expect(err.name).toBe("PaymentInvoiceNotPayable");
    expect(err.message).toBe("Invoice  is not payable (status=)");
  });
});

describe("PaymentAmountInvalid", () => {
  it("builds message + name from representative amount", () => {
    const err = new PaymentAmountInvalid("-10.00");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PaymentAmountInvalid);
    expect(err.name).toBe("PaymentAmountInvalid");
    expect(err.message).toBe('Payment amount "-10.00" is invalid (must be a positive decimal)');
  });

  it("pins edge: zero-like string", () => {
    const err = new PaymentAmountInvalid("0.00");
    expect(err.name).toBe("PaymentAmountInvalid");
    expect(err.message).toBe('Payment amount "0.00" is invalid (must be a positive decimal)');
  });
});

describe("JobAlreadyBillingClosed", () => {
  it("builds message + name from representative job id", () => {
    const err = new JobAlreadyBillingClosed("job-1");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(JobAlreadyBillingClosed);
    expect(err.name).toBe("JobAlreadyBillingClosed");
    expect(err.message).toBe("Job job-1 is already billing-closed");
  });

  it("pins edge: empty job id", () => {
    const err = new JobAlreadyBillingClosed("");
    expect(err.name).toBe("JobAlreadyBillingClosed");
    expect(err.message).toBe("Job  is already billing-closed");
  });
});

describe("ActivationTargetMismatch", () => {
  it("builds message + name from representative inputs", () => {
    const err = new ActivationTargetMismatch("agents", "agent-5");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ActivationTargetMismatch);
    expect(err.name).toBe("ActivationTargetMismatch");
    expect(err.message).toBe(
      "ACTIVATION_TARGET_MISMATCH: agents row id=agent-5 missing or key mismatch (promote affected != 1)"
    );
  });

  it("pins edge: empty strings", () => {
    const err = new ActivationTargetMismatch("", "");
    expect(err.name).toBe("ActivationTargetMismatch");
    expect(err.message).toBe(
      "ACTIVATION_TARGET_MISMATCH:  row id= missing or key mismatch (promote affected != 1)"
    );
  });
});

describe("SingleActiveInvariantViolated", () => {
  it("builds message + name from representative violation", () => {
    const err = new SingleActiveInvariantViolated("client_nte_rules", "key-1", 2);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SingleActiveInvariantViolated);
    expect(err.name).toBe("SingleActiveInvariantViolated");
    expect(err.message).toBe(
      "SINGLE_ACTIVE_INVARIANT_VIOLATED: client_nte_rules had 2 active rows for key-1 before activation (expected <= 1)"
    );
  });

  it("pins numeric boundary sides around expected <= 1: foundActive=1 vs 2", () => {
    const err1 = new SingleActiveInvariantViolated("client_nte_rules", "key-1", 1);
    expect(err1.name).toBe("SingleActiveInvariantViolated");
    expect(err1.message).toBe(
      "SINGLE_ACTIVE_INVARIANT_VIOLATED: client_nte_rules had 1 active rows for key-1 before activation (expected <= 1)"
    );

    const err2 = new SingleActiveInvariantViolated("client_nte_rules", "key-1", 2);
    expect(err2.name).toBe("SingleActiveInvariantViolated");
    expect(err2.message).toBe(
      "SINGLE_ACTIVE_INVARIANT_VIOLATED: client_nte_rules had 2 active rows for key-1 before activation (expected <= 1)"
    );
  });
});
