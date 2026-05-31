// ── Phase 12 batch 12j — SERVICECHANNEL REGISTRATION ──────────────────────────────────
// Importing this module registers the ServiceChannel adapter into the core seam. This is
// THE one line that wires a provider — no core change was needed to add it (§2.1
// demonstrated): a new provider = a new folder (adapter.ts) + this self-registration.
// The provider key 'servicechannel' matches external_systems.provider (varchar, F3).

import { registerAdapter } from "../core/registry";
import { serviceChannelAdapter } from "./adapter";

registerAdapter("servicechannel", serviceChannelAdapter);

export { serviceChannelAdapter };
