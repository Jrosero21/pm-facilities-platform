import { describe, expect, it } from "vitest";

import {
  canActOnAssignment,
  canSeeFinancials,
  canSeeOperations,
  canSubmitVendorInvoice,
  hasAnyRole,
  isClientUser,
  isVendorUser,
  type RoleCtx,
} from "@/server/role-predicates";

describe("hasAnyRole", () => {
  it("returns false when not super admin and roleKeys has none of allowed", () => {
    const ctx: RoleCtx = { roleKeys: ["operator"], isSuperAdmin: false };
    expect(hasAnyRole(ctx, ["accounting", "tenant_admin"])).toBe(false);
  });

  it("returns true when roleKeys includes one of allowed", () => {
    const ctx: RoleCtx = { roleKeys: ["tenant_admin"], isSuperAdmin: false };
    expect(hasAnyRole(ctx, ["accounting", "tenant_admin"])).toBe(true);
  });

  it("treats empty allowed as no match", () => {
    const ctx: RoleCtx = { roleKeys: ["tenant_admin"], isSuperAdmin: false };
    expect(hasAnyRole(ctx, [])).toBe(false);
  });

  it("with empty roleKeys, super admin override returns true", () => {
    const ctx: RoleCtx = { roleKeys: [], isSuperAdmin: true };
    expect(hasAnyRole(ctx, ["vendor_user"])).toBe(true);
  });

  it("with empty roleKeys and isSuperAdmin false returns false", () => {
    const ctx: RoleCtx = { roleKeys: [], isSuperAdmin: false };
    expect(hasAnyRole(ctx, ["vendor_user"])).toBe(false);
  });
});

describe("canSeeOperations", () => {
  it("returns true when roleKeys contains tenant_admin", () => {
    const ctx: RoleCtx = { roleKeys: ["tenant_admin"], isSuperAdmin: false };
    expect(canSeeOperations(ctx)).toBe(true);
  });

  it("with empty roleKeys and isSuperAdmin false returns false", () => {
    const ctx: RoleCtx = { roleKeys: [], isSuperAdmin: false };
    expect(canSeeOperations(ctx)).toBe(false);
  });

  it("with empty roleKeys and isSuperAdmin true returns true", () => {
    const ctx: RoleCtx = { roleKeys: [], isSuperAdmin: true };
    expect(canSeeOperations(ctx)).toBe(true);
  });

  it("returns false when roleKeys has no matching roles", () => {
    const ctx: RoleCtx = { roleKeys: ["accounting"], isSuperAdmin: false };
    expect(canSeeOperations(ctx)).toBe(false);
  });

  it("returns true when roleKeys contains operator", () => {
    const ctx: RoleCtx = { roleKeys: ["operator"], isSuperAdmin: false };
    expect(canSeeOperations(ctx)).toBe(true);
  });
});

describe("canSeeFinancials", () => {
  it("returns true when roleKeys contains accounting", () => {
    const ctx: RoleCtx = { roleKeys: ["accounting"], isSuperAdmin: false };
    expect(canSeeFinancials(ctx)).toBe(true);
  });

  it("returns true when roleKeys contains tenant_admin", () => {
    const ctx: RoleCtx = { roleKeys: ["tenant_admin"], isSuperAdmin: false };
    expect(canSeeFinancials(ctx)).toBe(true);
  });

  it("with empty roleKeys and isSuperAdmin false returns false", () => {
    const ctx: RoleCtx = { roleKeys: [], isSuperAdmin: false };
    expect(canSeeFinancials(ctx)).toBe(false);
  });

  it("with empty roleKeys and isSuperAdmin true returns true", () => {
    const ctx: RoleCtx = { roleKeys: [], isSuperAdmin: true };
    expect(canSeeFinancials(ctx)).toBe(true);
  });

  it("returns false when roleKeys has no matching roles", () => {
    const ctx: RoleCtx = { roleKeys: ["operator", "vendor_user"], isSuperAdmin: false };
    expect(canSeeFinancials(ctx)).toBe(false);
  });
});

describe("isVendorUser", () => {
  it("returns true when roleKeys contains vendor_user", () => {
    const ctx: RoleCtx = { roleKeys: ["vendor_user"], isSuperAdmin: false };
    expect(isVendorUser(ctx)).toBe(true);
  });

  it("with empty roleKeys and isSuperAdmin false returns false", () => {
    const ctx: RoleCtx = { roleKeys: [], isSuperAdmin: false };
    expect(isVendorUser(ctx)).toBe(false);
  });

  it("with empty roleKeys and isSuperAdmin true returns true", () => {
    const ctx: RoleCtx = { roleKeys: [], isSuperAdmin: true };
    expect(isVendorUser(ctx)).toBe(true);
  });

  it("returns false when roleKeys has no matching roles", () => {
    const ctx: RoleCtx = { roleKeys: ["client_user", "tenant_admin"], isSuperAdmin: false };
    expect(isVendorUser(ctx)).toBe(false);
  });
});

describe("isClientUser", () => {
  it("returns true when roleKeys contains client_user", () => {
    const ctx: RoleCtx = { roleKeys: ["client_user"], isSuperAdmin: false };
    expect(isClientUser(ctx)).toBe(true);
  });

  it("with empty roleKeys and isSuperAdmin false returns false", () => {
    const ctx: RoleCtx = { roleKeys: [], isSuperAdmin: false };
    expect(isClientUser(ctx)).toBe(false);
  });

  it("with empty roleKeys and isSuperAdmin true returns true", () => {
    const ctx: RoleCtx = { roleKeys: [], isSuperAdmin: true };
    expect(isClientUser(ctx)).toBe(true);
  });

  it("returns false when roleKeys has no matching roles", () => {
    const ctx: RoleCtx = { roleKeys: ["vendor_user", "tenant_admin"], isSuperAdmin: false };
    expect(isClientUser(ctx)).toBe(false);
  });
});

describe("canActOnAssignment", () => {
  const assignment: { tenantId: string; vendorId: string } = {
    tenantId: "tenant_123",
    vendorId: "vendor_456",
  };

  it("returns true when assignment.tenantId matches and scope contains vendorId", () => {
    const scope: Set<string> = new Set(["vendor_456"]);
    expect(canActOnAssignment(scope, assignment, "tenant_123")).toBe(true);
  });

  it("returns false when assignment.tenantId does not match tenantId", () => {
    const scope: Set<string> = new Set(["vendor_456"]);
    expect(canActOnAssignment(scope, assignment, "tenant_other")).toBe(false);
  });

  it("returns false when tenantId matches but scope does not contain vendorId", () => {
    const scope: Set<string> = new Set(["vendor_other"]);
    expect(canActOnAssignment(scope, assignment, "tenant_123")).toBe(false);
  });
});

describe("canSubmitVendorInvoice", () => {
  const assignment: { tenantId: string; vendorId: string } = {
    tenantId: "tenant_123",
    vendorId: "vendor_456",
  };

  it("returns true when assignment.tenantId matches and scope contains vendorId", () => {
    const scope: Set<string> = new Set(["vendor_456"]);
    expect(canSubmitVendorInvoice(scope, assignment, "tenant_123")).toBe(true);
  });

  it("returns false when assignment.tenantId does not match tenantId", () => {
    const scope: Set<string> = new Set(["vendor_456"]);
    expect(canSubmitVendorInvoice(scope, assignment, "tenant_other")).toBe(false);
  });

  it("returns false when tenantId matches but scope does not contain vendorId", () => {
    const scope: Set<string> = new Set(["vendor_other"]);
    expect(canSubmitVendorInvoice(scope, assignment, "tenant_123")).toBe(false);
  });
});
