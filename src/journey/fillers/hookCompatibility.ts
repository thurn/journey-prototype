import type { TriggerEntry } from "./hookTriggers.js";
import type { ResolutionEntry, HookStage } from "./hookResolutions.js";

/**
 * Triggers that require additional structural data (cardId, dreamsignId,
 * siteType, essence amount...) on their selector. A pairing where the
 * resolution does not supply that data will fail downstream validation, so we
 * gate them at the predicate level: only a resolution explicitly authored
 * against the narrow trigger may pair with it.
 */
const NARROW_TRIGGERS: ReadonlySet<TriggerEntry["kind"]> = new Set([
  "named_card_play",
  "card_added",
  "dreamsign_trigger",
  "site_visit",
  "essence_payment",
  "future_shop",
  "future_dream_journey",
]);

/**
 * Resolutions that are explicitly authored against one or more narrow
 * triggers. Pairings outside this map for narrow triggers are rejected by
 * `hookCompatibility`.
 */
const NARROW_TRIGGER_RESOLUTIONS: Readonly<
  Record<TriggerEntry["kind"], ReadonlySet<ResolutionEntry["kind"]>>
> = {
  battle: new Set([]),
  victory: new Set([]),
  each_battle: new Set([]),
  dreamscape: new Set([]),
  named_card_play: new Set(["essence_gain", "card_duplicate"]),
  card_added: new Set(["card_transform", "bane_transform_to_card"]),
  dreamsign_trigger: new Set(["omen_gain"]),
  site_visit: new Set(["site_visit_reward"]),
  essence_payment: new Set(["dreamsign_transform"]),
  future_shop: new Set([
    "future_shop_discount",
    "future_shop_trade_hook",
    "bane_transform_to_card",
  ]),
  future_dream_journey: new Set([
    "future_journey_option",
    "future_journey_route_edit",
    "status_reward_replacement",
  ]),
};

/**
 * Decides whether a (trigger, resolution, stage) tuple is permitted to surface
 * as a delayed-hook candidate. The predicate captures the high-level alignment
 * rules implicit in the historical enumerated list:
 *
 *  - Stage compatibility (a resolution may opt into specific journey stages).
 *  - Resource alignment (a resolution that requires a specific resource needs
 *    a trigger that either emits that resource or is "none"-permissive).
 *  - Narrow-trigger gating (triggers carrying structural data only pair with
 *    resolutions explicitly authored against them).
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

  // Narrow triggers only accept resolutions explicitly authored for them.
  if (NARROW_TRIGGERS.has(trigger.kind)) {
    if (!NARROW_TRIGGER_RESOLUTIONS[trigger.kind].has(resolution.kind)) {
      return false;
    }
    return true;
  }

  // Resolutions scoped to a specific narrow trigger never fire off a
  // generic trigger (e.g. site_visit_reward only fires after site_visit).
  for (const narrowKind of NARROW_TRIGGERS) {
    if (NARROW_TRIGGER_RESOLUTIONS[narrowKind].has(resolution.kind)) {
      // Resolution is authored against narrowKind only; reject general triggers.
      return false;
    }
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

  // The named_dreamsign_grant resolution is authored against `victory`.
  if (
    resolution.kind === "named_dreamsign_grant" &&
    trigger.kind !== "victory"
  ) {
    return false;
  }

  // The named_card_grant resolution is authored against `dreamscape`.
  if (resolution.kind === "named_card_grant" && trigger.kind !== "dreamscape") {
    return false;
  }

  return true;
}
