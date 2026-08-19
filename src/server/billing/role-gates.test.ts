import { describe, expect, it } from "vitest";

import { isAccountingRole } from "@/server/billing/role-gates";

describe("isAccountingRole", () => {
  it("returns true for a representative non-empty roleKeys that includes accounting when isSuperAdmin is false", () => {
    const result = isAccountingRole(["invoicing", "accounting", "something-else"], false);
    expect(result).toBe(true);
  });

  it("returns false for empty roleKeys when isSuperAdmin is false", () => {
    const result = isAccountingRole([], false);
    expect(result).toBe(false);
  });

  it("returns true for empty roleKeys when isSuperAdmin is true (super_admin overrides the accounting role gate)", () => {
    const result = isAccountingRole([], true);
    expect(result).toBe(true);
  });

  it("returns false for a non-accounting role when isSuperAdmin is false", () => {
    const result = isAccountingRole(["tenant_admin"], false);
    expect(result).toBe(false);
  });

  it("returns true for a non-accounting role when isSuperAdmin is true", () => {
    const result = isAccountingRole(["tenant_admin"], true);
    expect(result).toBe(true);
  });

  it("is case-sensitive: does not treat ACCOUNTING as the accounting role key", () => {
    const result = isAccountingRole(["ACCOUNTING"], false);
    expect(result).toBe(false);
  });
});
