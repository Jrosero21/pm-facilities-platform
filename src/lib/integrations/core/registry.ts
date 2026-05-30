// ── Phase 12 batch 12f — EXTERNAL INTEGRATION CORE: adapter registry (the seam) ───────
// The provider → adapter lookup, mirroring the agents/registry.ts enumeration-seam spirit
// (Phase 16 will ask "which integrations are available?"). Unlike the agents registry
// (a static metadata Record), adapters SELF-REGISTER at their own import time — so this
// registry is a mutable map populated by adapters calling registerAdapter(), not a literal.
//
// §2.1 INVARIANT (load-bearing): core NEVER imports a concrete adapter. No provider is
// named here. The servicechannel adapter (12j) will call registerAdapter("servicechannel",
// …) from its own index.ts at import time. Adding a provider = a new adapter folder + one
// self-registration call, with ZERO change to core.
//
// provider is a string keyed off external_systems.provider (varchar, F3) — new providers
// need no enum migration.

import type { PortalAdapter } from "./types";

const ADAPTERS = new Map<string, PortalAdapter>();

/** Register an adapter under its provider key. Adapters call this at import time. */
export function registerAdapter(provider: string, adapter: PortalAdapter): void {
  ADAPTERS.set(provider, adapter);
}

/**
 * Resolve the adapter for a provider. Throws UNKNOWN_PROVIDER if none is registered
 * (the adapter module wasn't imported, or the provider key is wrong).
 */
export function getAdapter(provider: string): PortalAdapter {
  const adapter = ADAPTERS.get(provider);
  if (!adapter) {
    throw new Error(`UNKNOWN_PROVIDER: no adapter registered for "${provider}"`);
  }
  return adapter;
}

/** True iff an adapter is registered for `provider`. */
export function hasAdapter(provider: string): boolean {
  return ADAPTERS.has(provider);
}

/** The registered provider keys — the enumeration seam (Phase 16). */
export function listRegisteredProviders(): string[] {
  return [...ADAPTERS.keys()];
}
