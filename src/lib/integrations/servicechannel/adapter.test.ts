import { describe, expect, it } from "vitest";

import { serviceChannelAdapter } from "@/lib/integrations/servicechannel/adapter";

import type { NormalizedStatusPush } from "@/lib/integrations/core/types";
import type { ExternalAccount } from "@/lib/integrations/core/types";

describe("serviceChannelAdapter.normalizePayload", () => {
  it("maps a fully-populated realistic payload field-by-field", () => {
    const raw = {
      Id: 987,
      WorkOrderId: "wo-ignored-because-Id-trims-first",
      SubscriberId: "sub-123",
      Location: {
        LocationId: "loc-777",
        StoreId: "store-ignored-because-LocationId-trims-first",
        Name: "Main Shop",
        Address: "100 ServiceChannel Way",
        Address1: "200 Override St",
        City: "Metropolis",
        StateProvince: "CA",
        PostalCode: "94000",
        Zip: "94001-ignored-because-PostalCode-trims-first",
        Country: "US",
      },
      Status: "OPEN",
      TradeName: "Plumbing",
      Trade: "Trade-ignored-because-TradeName-trims-first",
      Priority: "HIGH",
      Description: "Leaky pipe under sink",
      someExtraField: 123,
    } satisfies Record<string, unknown>;

    const normalized = serviceChannelAdapter.normalizePayload(raw);

    expect(normalized).toEqual({
      externalWoId: "987",
      externalClientCode: "sub-123",
      externalLocationCode: "loc-777",
      externalStatusCode: "OPEN",
      externalTradeCode: "Plumbing",
      externalPriorityCode: "HIGH",
      problemDescription: "Leaky pipe under sink",
      locationName: "Main Shop",
      addressLine1: "200 Override St",
      city: "Metropolis",
      stateProvince: "CA",
      postalCode: "94000",
      country: "US",
      raw,
    });
  });

  it("uses optional field fallbacks when location codes/details are missing", () => {
    const raw = {
      WorkOrderId: "wo-only",
      SubscriberId: 0,
      Location: {
        StoreId: "store-55",
      },
    } satisfies Record<string, unknown>;

    const normalized = serviceChannelAdapter.normalizePayload(raw);

    // str(0) => "0" (trimmed, non-empty)
    expect(normalized).toEqual({
      externalWoId: "wo-only",
      externalClientCode: "0",
      externalLocationCode: "store-55",
      externalStatusCode: undefined,
      externalTradeCode: undefined,
      externalPriorityCode: undefined,
      problemDescription: undefined,
      locationName: undefined,
      addressLine1: undefined,
      city: undefined,
      stateProvince: undefined,
      postalCode: undefined,
      country: undefined,
      raw,
    });
  });

  it("handles null raw by treating it as an empty object and preserving raw", () => {
    const normalized = serviceChannelAdapter.normalizePayload(null);

    expect(normalized).toEqual({
      externalWoId: "",
      externalClientCode: "",
      externalLocationCode: "",
      externalStatusCode: undefined,
      externalTradeCode: undefined,
      externalPriorityCode: undefined,
      problemDescription: undefined,
      locationName: undefined,
      addressLine1: undefined,
      city: undefined,
      stateProvince: undefined,
      postalCode: undefined,
      country: undefined,
      raw: null,
    });
  });

  it("handles undefined raw by treating it as an empty object and preserving raw", () => {
    const normalized = serviceChannelAdapter.normalizePayload(undefined);

    expect(normalized).toEqual({
      externalWoId: "",
      externalClientCode: "",
      externalLocationCode: "",
      externalStatusCode: undefined,
      externalTradeCode: undefined,
      externalPriorityCode: undefined,
      problemDescription: undefined,
      locationName: undefined,
      addressLine1: undefined,
      city: undefined,
      stateProvince: undefined,
      postalCode: undefined,
      country: undefined,
      raw: undefined,
    });
  });

  it("handles a string raw by treating it as an empty payload object and preserving raw", () => {
    const normalized = serviceChannelAdapter.normalizePayload("not-an-object");

    expect(normalized).toEqual({
      externalWoId: "",
      externalClientCode: "",
      externalLocationCode: "",
      externalStatusCode: undefined,
      externalTradeCode: undefined,
      externalPriorityCode: undefined,
      problemDescription: undefined,
      locationName: undefined,
      addressLine1: undefined,
      city: undefined,
      stateProvince: undefined,
      postalCode: undefined,
      country: undefined,
      raw: "not-an-object",
    });
  });

  it("handles an empty object raw (all fields missing)", () => {
    const raw = {} satisfies Record<string, unknown>;
    const normalized = serviceChannelAdapter.normalizePayload(raw);

    expect(normalized).toEqual({
      externalWoId: "",
      externalClientCode: "",
      externalLocationCode: "",
      externalStatusCode: undefined,
      externalTradeCode: undefined,
      externalPriorityCode: undefined,
      problemDescription: undefined,
      locationName: undefined,
      addressLine1: undefined,
      city: undefined,
      stateProvince: undefined,
      postalCode: undefined,
      country: undefined,
      raw,
    });
  });

  it("coerces wrongly-typed field values using String(...) trim rules (and can produce \">\"/empty-string fallbacks)", () => {
    const raw = {
      // Different type boundaries
      Id: "  ", // => str("  ") => undefined
      WorkOrderId: 5,
      SubscriberId: "  ",
      Status: 0,
      TradeName: "   ",
      Trade: 123,
      Priority: "\n",
      Description: false,
      Location: {
        LocationId: "   ",
        StoreId: "loc-store",
        Name: "  ",
        Address: "",
        Address1: "  addr1  ",
        City: 0,
        State: " ",
        StateProvince: "  OR ",
        PostalCode: "",
        Zip: "  ",
        Country: 1,
      },
    } satisfies Record<string, unknown>;

    const normalized = serviceChannelAdapter.normalizePayload(raw);

    expect(normalized).toEqual({
      externalWoId: "5",
      externalClientCode: "",
      externalLocationCode: "loc-store",
      externalStatusCode: "0",
      externalTradeCode: "123",
      externalPriorityCode: undefined,
      problemDescription: "false",
      locationName: undefined,
      addressLine1: "addr1",
      city: "0",
      stateProvince: "OR",
      postalCode: undefined,
      country: "1",
      raw,
    });
  });
});

describe("serviceChannelAdapter.fetchWorkOrders", () => {
  it("returns an empty list (stub) for a representative account and since", async () => {
    const account = {
      id: "acct-1",
      tenantId: "tenant-1",
      externalSystemId: "ext-sys-1",
      externalAccountRef: "ext-acc-ref-1",
      status: "active",
      config: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    } satisfies ExternalAccount;

    // fetchWorkOrders is a stub and does no date arithmetic; we just need a valid since.
    
    const result = await serviceChannelAdapter.fetchWorkOrders(
      account,
      new Date("2026-01-02T03:04:05.000Z"),
    );

    expect(result).toEqual([]);
  });

  it("returns an empty list (stub) when since is omitted", async () => {
    const account = {
      id: "acct-2",
      tenantId: "tenant-2",
      externalSystemId: "ext-sys-2",
      externalAccountRef: "ext-acc-ref-2",
      status: "active",
      config: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    } satisfies ExternalAccount;

    const result = await serviceChannelAdapter.fetchWorkOrders(account);
    expect(result).toEqual([]);
  });
});

describe("serviceChannelAdapter.pushStatus", () => {
  it("returns stub success with exact externalRef", async () => {
    const account = {
      id: "acct-3",
      tenantId: "tenant-3",
      externalSystemId: "ext-sys-3",
      externalAccountRef: "ext-acc-ref-3",
      status: "active",
      config: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    } satisfies ExternalAccount;

    const push = {
      externalWoId: "wo-1",
      externalStatusCode: "DONE",
      note: undefined,
    } satisfies NormalizedStatusPush;

    const result = await serviceChannelAdapter.pushStatus(account, push);

    expect(result).toEqual({ ok: true, externalRef: "noop-skeleton" });
  });
});
