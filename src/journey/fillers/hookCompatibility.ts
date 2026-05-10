import type { TriggerEntry } from "./hookTriggers.js";
import type { ResolutionEntry, HookStage } from "./hookResolutions.js";

/**
 * Decides whether a (trigger, resolution, stage) tuple is permitted to surface
 * as a delayed-hook candidate. The predicate captures the high-level alignment
 * rules implicit in the historical enumerated list:
 *
 *  - Stage compatibility (a resolution may opt into specific journey stages).
 *  - Resource alignment (a resolution that requires a specific resource needs
 *    a trigger that either emits that resource or is "none"-permissive).
 *  - Site-scoped scope (e.g. shop resolutions only follow shop triggers).
 *
 * Resolutions are still free to return `undefined` from `producesPayload`
 * for finer-grained, content-driven rejections. The predicate only encodes
 * the structural shape rules.
 */
export function hookCompatibility(
  trigger: TriggerEntry,
  resolution: ResolutionEntry,
  stage: HookStage,
): boolean {
  if (!resolution.compatibleStages.includes(stage)) return false;

  // Resource alignment: a resolution that requires a specific resource needs
  // a trigger that emits that resource (or "none", which is permissive).
  if (resolution.requiresResource !== "none" && trigger.emitsResource !== "none") {
    if (resolution.requiresResource !== trigger.emitsResource) return false;
  }

  // Shop-targeted resolutions only fire after a shop-related trigger.
  if (resolution.kind.startsWith("future_shop") && trigger.kind !== "future_shop") {
    return false;
  }

  // Dream-journey-scoped resolutions only fire after a dream-journey trigger.
  if (
    (resolution.kind === "future_journey_option" ||
      resolution.kind === "future_journey_route_edit" ||
      resolution.kind === "status_reward_replacement") &&
    trigger.kind !== "future_dream_journey"
  ) {
    return false;
  }

  // The site-visit reward is by construction tied to site-visit triggers.
  if (resolution.kind === "site_visit_reward" && trigger.kind !== "site_visit") {
    return false;
  }

  // Delayed bane arrival models "after a real in-battle / dreamscape event".
  // Only triggers that fire on a directly observable scene are eligible.
  if (
    resolution.kind === "delayed_bane_arrival" &&
    trigger.kind !== "battle" &&
    trigger.kind !== "victory" &&
    trigger.kind !== "dreamscape"
  ) {
    return false;
  }

  return true;
}
