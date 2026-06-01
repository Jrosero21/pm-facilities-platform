// ── Phase 15 batch 15d — SNOW EVENT-FIRE ENGINE barrel ────────────────────────────────
// The three engine entrypoints. dispatchSnowEventSites is the shared inner workhorse (the
// autonomy seam); declareSnowEvent (the trigger) and confirmSnowDispatches (the §2.5 gate)
// both route through it. (No src/server/pm/index.ts exists — PM is imported by path; the snow
// engine adds this barrel for its own callers and is likewise not re-exported in a server barrel.)

export {
  declareSnowEvent,
  type DeclareSnowEventResult,
} from "./declare-event";
export {
  dispatchSnowEventSites,
  type DispatchSnowEventSitesResult,
} from "./dispatch-sites";
export { confirmSnowDispatches } from "./confirm-dispatches";
