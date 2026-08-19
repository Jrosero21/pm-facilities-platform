import { describe, expect, it, vi } from "vitest";

import type { PortalAdapter } from "./types";

function minimalAdapterFixture(overrides: Partial<PortalAdapter> = {}): PortalAdapter {
  // The module only needs a PortalAdapter object type for the registry to store.
  // Use a minimally-shaped object and merge in overrides as needed by the current PortalAdapter definition.
  // If PortalAdapter has required members, TypeScript will force us to supply them via overrides.
  return {
    ...overrides,
  } as PortalAdapter;
}

describe("src/lib/integrations/core/registry", () => {
  async function loadFreshRegistryModule() {
    vi.resetModules();
    const mod = await import("./registry");
    return mod as typeof import("./registry");
  }

  function pickFreshProviderKey(existingProviders: string[]): string {
    // Ensure we don't collide with adapters registered by other test files.
    // Since we reset modules, this should always be empty, but keep it deterministic.
    const base = "__registry_test_provider__";
    let i = 0;
    while (existingProviders.includes(`${base}_${i}`)) i += 1;
    return `${base}_${i}`;
  }

  it("registerAdapter(): registering then getAdapter/hasAdapter/listRegisteredProviders reflect the provider", async () => {
    const registry = await loadFreshRegistryModule();

    const provider = pickFreshProviderKey(registry.listRegisteredProviders());
    const adapter1: PortalAdapter = minimalAdapterFixture({});

    // Before registration
    expect(registry.listRegisteredProviders()).toEqual([]);
    expect(registry.hasAdapter(provider)).toBe(false);

    // Register
    registry.registerAdapter(provider, adapter1);

    // After registration
    expect(registry.hasAdapter(provider)).toBe(true);
    expect(registry.listRegisteredProviders()).toEqual([provider]);
    expect(registry.getAdapter(provider)).toBe(adapter1);
  });

  it("hasAdapter(): unknown provider returns false", async () => {
    const registry = await loadFreshRegistryModule();

    const existingProviders = registry.listRegisteredProviders();
    const knownProviderKey = pickFreshProviderKey(existingProviders);
    const unknownProviderKey = pickFreshProviderKey([...existingProviders, knownProviderKey]);

    expect(registry.hasAdapter(unknownProviderKey)).toBe(false);
  });

  it("getAdapter(): unknown provider throws exact UNKNOWN_PROVIDER message", async () => {
    const registry = await loadFreshRegistryModule();

    const existingProviders = registry.listRegisteredProviders();
    const knownProviderKey = pickFreshProviderKey(existingProviders);
    const unknownProviderKey = pickFreshProviderKey([...existingProviders, knownProviderKey]);

    expect(() => registry.getAdapter(unknownProviderKey)).toThrow(
      `UNKNOWN_PROVIDER: no adapter registered for "${unknownProviderKey}"`,
    );
  });

  it("registerAdapter(): registering the same provider twice overwrites the stored adapter", async () => {
    const registry = await loadFreshRegistryModule();

    const provider = pickFreshProviderKey(registry.listRegisteredProviders());
    const adapter1: PortalAdapter = minimalAdapterFixture({});
    const adapter2: PortalAdapter = minimalAdapterFixture({});

    registry.registerAdapter(provider, adapter1);

    expect(registry.hasAdapter(provider)).toBe(true);
    expect(registry.listRegisteredProviders()).toEqual([provider]);
    expect(registry.getAdapter(provider)).toBe(adapter1);

    registry.registerAdapter(provider, adapter2);

    // Still exactly one provider key; Map.set overwrites the value.
    expect(registry.hasAdapter(provider)).toBe(true);
    expect(registry.listRegisteredProviders()).toEqual([provider]);
    expect(registry.getAdapter(provider)).toBe(adapter2);
  });
});
