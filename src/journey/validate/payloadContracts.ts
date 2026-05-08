import { stableStringify } from "../../util/stableJson.js";
import {
  SITE_TYPES,
  STATUS_SCOPES,
} from "../effects.js";
import type { JourneyManifest, JourneyOperation } from "../manifest.js";
import { isRecord } from "./guards.js";
import { validateRandomEnvelopePayload } from "./randomContracts.js";
import { fail, type ValidationResult } from "./result.js";

export const ROUTE_OPERATION_KINDS = new Set([
  "add_site",
  "remove_site",
  "replace_site",
  "purge_site",
  "probability_adjustment",
]);

export const ROUTE_SCOPES = new Set([
  "current_dreamscape",
  "next_dreamscape",
  "future_dreamscapes",
  "full_atlas",
]);

export const ROUTE_POLARITIES = new Set(["positive", "negative", "neutral"]);

export const SITE_TYPE_SET = new Set<string>(SITE_TYPES);
export const STATUS_SCOPE_SET = new Set<string>(STATUS_SCOPES);

export function validateRoutePayloadContract(payload: Record<string, unknown>): ValidationResult {
  const operationKind = payload.routeOperationKind;

  if (typeof operationKind !== "string" || !ROUTE_OPERATION_KINDS.has(operationKind)) {
    return fail("unsupported_route_operation", "Route edits require a supported route operation kind");
  }

  if (typeof payload.routeScope !== "string" || !ROUTE_SCOPES.has(payload.routeScope)) {
    return fail("unsupported_route_scope", "Route edits require current, next, future, or full-atlas scope");
  }

  if (typeof payload.routePolarity !== "string" || !ROUTE_POLARITIES.has(payload.routePolarity)) {
    return fail("invalid_route_polarity", "Route edits require positive, negative, or neutral polarity");
  }

  const siteNames = [
    payload.siteType,
    payload.fromSite,
    payload.toSite,
    payload.affectedSite,
  ].filter((entry): entry is string => typeof entry === "string");

  if (siteNames.length === 0) {
    return fail("invalid_route_site_type", "Route edits require at least one controlled site type");
  }

  const invalidSite = siteNames.find((siteName) => !SITE_TYPE_SET.has(siteName));
  if (invalidSite) {
    return fail("invalid_route_site_type", `Unknown route site type: ${invalidSite}`);
  }

  if (operationKind === "replace_site" && (typeof payload.fromSite !== "string" || typeof payload.toSite !== "string")) {
    return fail("incoherent_route_mutation", "Route replacement requires fromSite and toSite");
  }

  if (
    operationKind === "probability_adjustment" &&
    (typeof payload.probabilityDeltaPercent !== "number" || payload.probabilityDeltaPercent === 0)
  ) {
    return fail("incoherent_route_mutation", "Route probability adjustments require a nonzero probability delta");
  }

  return { ok: true };
}

export function validateStatusPayloadContract(payload: Record<string, unknown>): ValidationResult {
  if (typeof payload.statusScope !== "string" || !STATUS_SCOPE_SET.has(payload.statusScope)) {
    return fail("unsupported_status_scope", "Status and rule mutations require a supported status scope");
  }

  if (typeof payload.duration !== "string" || payload.duration.length === 0) {
    return fail("invalid_status_duration", "Status and rule mutations require a structured duration");
  }

  if (typeof payload.ruleMutationKind !== "string" || payload.ruleMutationKind.length === 0) {
    return fail("incoherent_rule_mutation", "Status and rule mutations require a rule mutation kind");
  }

  if (
    (payload.ruleMutationKind === "reward_replacement" ||
      payload.ruleMutationKind === "next_victory_reward_replacement") &&
    typeof payload.replacement !== "string"
  ) {
    return fail("incoherent_rule_mutation", "Reward replacement statuses require a replacement");
  }

  if (
    payload.ruleMutationKind === "next_victory_reward_replacement" &&
    (payload.statusScope !== "reward" ||
      payload.duration !== "one_time" ||
      payload.rewardTrigger !== "next_victory" ||
      payload.replacedRewardKind !== "card_rewards" ||
      (payload.replacementKind !== "dreamsign_draft" &&
        payload.replacementKind !== "resource" &&
        payload.replacementKind !== "route_reward"))
  ) {
    return fail("incoherent_rule_mutation", "Next-victory reward replacement statuses require a one-time card-reward replacement");
  }

  if (
    payload.ruleMutationKind === "battle_reward_reduction" &&
    (payload.statusScope !== "reward" ||
      payload.rewardTrigger !== "battle" ||
      payload.replacedRewardKind !== "battle_rewards" ||
      typeof payload.amount !== "number" ||
      payload.amount <= 0)
  ) {
    return fail("incoherent_rule_mutation", "Battle reward reductions require reward scope and a positive reduction amount");
  }

  if (
    payload.ruleMutationKind === "essence_site_reward_reduction" &&
    (payload.statusScope !== "reward" ||
      payload.rewardTrigger !== "essence_site" ||
      payload.replacedRewardKind !== "essence_site_rewards" ||
      payload.resource !== "essence" ||
      typeof payload.amount !== "number" ||
      payload.amount <= 0)
  ) {
    return fail("incoherent_rule_mutation", "Essence-site reward reductions require essence-site scope and a positive essence reduction");
  }

  if (
    payload.ruleMutationKind === "shop_rule" &&
    (payload.statusScope !== "shop" ||
      payload.cappedAction !== "reroll" ||
      typeof payload.rerollOmenCap !== "number" ||
      payload.rerollOmenCap < 0)
  ) {
    return fail("incoherent_rule_mutation", "Shop rule statuses require a structured reroll omen cap");
  }

  if (
    payload.ruleMutationKind === "dreamwell_rule" &&
    (payload.statusScope !== "dreamwell" ||
      typeof payload.dreamwellRuleKind !== "string" ||
      payload.dreamwellRuleKind.length === 0)
  ) {
    return fail("incoherent_rule_mutation", "Dreamwell rule statuses require Dreamwell scope and a rule kind");
  }

  if (
    payload.ruleMutationKind === "both_player_battle_rule" &&
    (payload.statusScope !== "battle" || payload.affectedPlayer !== "both_players")
  ) {
    return fail("incoherent_rule_mutation", "Both-player battle rules require battle scope and both-player targeting");
  }

  if (
    (payload.ruleMutationKind === "deck_size_constraint" ||
      payload.ruleMutationKind === "deck_size_floor" ||
      payload.ruleMutationKind === "exact_deck_size_mandate") &&
    (typeof payload.exactDeckSize !== "number" || payload.exactDeckSize < 1)
  ) {
    return fail("incoherent_rule_mutation", "Deck-size constraints require a positive exact deck size");
  }

  if (
    payload.ruleMutationKind === "deck_size_floor" &&
    (payload.statusScope !== "quest" ||
      payload.duration !== "persistent" ||
      typeof payload.minDeckSize !== "number" ||
      payload.minDeckSize < 1 ||
      payload.minDeckSize !== payload.exactDeckSize)
  ) {
    return fail("incoherent_rule_mutation", "Deck-size floors require a persistent quest floor matching the deck size");
  }

  if (
    payload.ruleMutationKind === "exact_deck_size_mandate" &&
    (payload.statusScope !== "quest" || payload.duration !== "persistent")
  ) {
    return fail("incoherent_rule_mutation", "Exact deck-size mandates require persistent quest scope");
  }

  if (
    payload.prohibitionKind !== undefined &&
    (typeof payload.prohibitionKind !== "string" ||
      typeof payload.prohibitedAction !== "string" ||
      payload.prohibitedAction.length === 0)
  ) {
    return fail("incoherent_rule_mutation", "Prohibition statuses require a prohibited action");
  }

  if (
    payload.prohibitionKind === "deck_cut_floor" &&
    ((
      payload.ruleMutationKind !== "deck_size_constraint" &&
      payload.ruleMutationKind !== "deck_size_floor"
    ) ||
      payload.prohibitedAction !== "voluntary_deck_cut" ||
      typeof payload.deckCutFloor !== "number" ||
      payload.deckCutFloor < 1 ||
      payload.deckCutFloor !== payload.exactDeckSize)
  ) {
    return fail("incoherent_rule_mutation", "Deck-cut prohibitions require a floor matching the exact deck size");
  }

  if (
    payload.ruleMutationKind === "persistent_prohibition" &&
    (payload.statusScope !== "quest" ||
      payload.duration !== "persistent" ||
      payload.polarity !== "negative")
  ) {
    return fail("incoherent_rule_mutation", "Persistent prohibitions require persistent negative quest scope");
  }

  if (
    payload.ruleMutationKind === "persistent_prohibition" &&
    !(
      (payload.prohibitionKind === "resource_gain" &&
        payload.prohibitedAction === "gain_essence" &&
        payload.resource === "essence") ||
      (payload.prohibitionKind === "deck_modification" &&
        payload.prohibitedAction === "modify_deck") ||
      (payload.prohibitionKind === "card_transfiguration" &&
        payload.prohibitedAction === "transfigure_cards")
    )
  ) {
    return fail("incoherent_rule_mutation", "Persistent prohibitions require a supported prohibited action");
  }

  return { ok: true };
}

export const HOOK_TRIGGER_KINDS = new Set([
  "battle",
  "victory",
  "each_battle",
  "dreamscape",
  "site_visit",
  "named_card_play",
  "dreamsign_trigger",
  "card_added",
  "essence_payment",
  "future_shop",
  "future_dream_journey",
]);

export const HOOK_EXPIRATION_POLICIES = new Set([
  "forfeit_reward",
  "resolve_partial",
  "pay_cost",
  "return_unchanged",
  "discard_obligation",
]);

export const HOOK_DURATION_KINDS = new Set([
  "battle_count",
  "dreamscape_count",
  "shop_count",
  "journey_count",
  "until_trigger",
]);

export const HOOK_CONTROLLED_SCENES = new Set(["reward", "cost", "transformation", "trade", "return"]);

export function validateHookTriggerSelector(value: unknown): ValidationResult {
  if (!isRecord(value)) {
    return fail("invalid_hook_trigger", "Delayed hooks require a structured trigger selector");
  }

  if (typeof value.triggerKind !== "string" || !HOOK_TRIGGER_KINDS.has(value.triggerKind)) {
    return fail("invalid_hook_trigger", "Delayed hooks require a legal trigger kind");
  }

  if (typeof value.label !== "string" || value.label.length === 0) {
    return fail("invalid_hook_trigger", "Delayed hook trigger selectors require a player-facing label");
  }

  if (
    (value.triggerKind === "named_card_play" || value.triggerKind === "card_added") &&
    (typeof value.cardId !== "string" || typeof value.cardName !== "string")
  ) {
    return fail("invalid_hook_trigger", "Card-play and card-addition hooks require a named card reference");
  }

  if (
    value.triggerKind === "dreamsign_trigger" &&
    (typeof value.dreamsignId !== "string" || typeof value.dreamsignName !== "string")
  ) {
    return fail("invalid_hook_trigger", "Dreamsign-trigger hooks require a named Dreamsign reference");
  }

  if (value.triggerKind === "site_visit" && typeof value.siteType !== "string") {
    return fail("invalid_hook_trigger", "Site-visit hooks require a site type");
  }

  if (value.triggerKind === "essence_payment" && (typeof value.amount !== "number" || value.amount <= 0)) {
    return fail("invalid_hook_trigger", "Essence-payment hooks require a positive payment threshold");
  }

  return { ok: true };
}

export function validateHookDuration(value: unknown): ValidationResult {
  if (!isRecord(value)) {
    return fail("invalid_hook_duration", "Delayed hooks require a bounded duration");
  }

  if (typeof value.durationKind !== "string" || !HOOK_DURATION_KINDS.has(value.durationKind)) {
    return fail("invalid_hook_duration", "Delayed hooks require a legal duration kind");
  }

  if (typeof value.label !== "string" || value.label.length === 0) {
    return fail("invalid_hook_duration", "Delayed hook durations require a player-facing label");
  }

  if (
    value.durationKind !== "until_trigger" &&
    (typeof value.count !== "number" || value.count < 1 || value.count > 3)
  ) {
    return fail("invalid_hook_duration", "Delayed hook durations must be bounded to 1..3 units");
  }

  return { ok: true };
}

export function validateHookExpiration(value: unknown): ValidationResult {
  if (!isRecord(value)) {
    return fail("invalid_hook_expiration", "Delayed hooks require an expiration policy");
  }

  if (typeof value.policyKind !== "string" || !HOOK_EXPIRATION_POLICIES.has(value.policyKind)) {
    return fail("invalid_hook_expiration", "Delayed hooks require a legal expiration policy");
  }

  if (typeof value.label !== "string" || value.label.length === 0) {
    return fail("invalid_hook_expiration", "Delayed hook expiration policies require a player-facing label");
  }

  return { ok: true };
}

export function validateHookVisibility(value: unknown): ValidationResult {
  if (!isRecord(value)) {
    return fail("invalid_hook_visibility", "Delayed hooks require a visibility policy");
  }

  if (
    value.outcomeVisibility !== "visible" &&
    value.outcomeVisibility !== "hidden_until_resolution" &&
    value.outcomeVisibility !== "debug_only"
  ) {
    return fail("invalid_hook_visibility", "Delayed hook visibility must be visible, hidden-until-resolution, or debug-only");
  }

  if (typeof value.disclosure !== "string" || value.disclosure.length === 0) {
    return fail("hidden_outcome_disclosure", "Delayed hooks require disclosure text for their outcome visibility");
  }

  return { ok: true };
}

export function validateHookControlledScene(value: unknown): ValidationResult {
  if (!isRecord(value)) {
    return fail("invalid_hook_resolution", "Delayed hooks require a controlled reward, cost, transformation, trade, or return scene");
  }

  if (typeof value.sceneKind !== "string" || !HOOK_CONTROLLED_SCENES.has(value.sceneKind)) {
    return fail("invalid_hook_resolution", "Delayed hook controlled scenes require a legal scene kind");
  }

  if (typeof value.label !== "string" || value.label.length === 0) {
    return fail("invalid_hook_resolution", "Delayed hook controlled scenes require a player-facing label");
  }

  return { ok: true };
}

export function validateDelayedHookContractPayload(
  payload: Record<string, unknown>,
  hasResolvedPayload = false,
): ValidationResult {
  const triggerResult = validateHookTriggerSelector(payload.triggerSelector);
  if (!triggerResult.ok) {
    return triggerResult;
  }

  if (typeof payload.trackedCondition !== "string" || payload.trackedCondition.length === 0) {
    return fail("invalid_hook_tracking", "Delayed hooks require a tracked condition");
  }

  if (typeof payload.resolution !== "string" || payload.resolution.length === 0) {
    return fail("invalid_hook_resolution", "Delayed hooks require a resolution description");
  }

  const expirationResult = validateHookExpiration(payload.expiration);
  if (!expirationResult.ok) {
    return expirationResult;
  }

  const durationResult = validateHookDuration(payload.duration);
  if (!durationResult.ok) {
    return durationResult;
  }

  const sceneResult = validateHookControlledScene(payload.controlledScene);
  if (!sceneResult.ok) {
    return sceneResult;
  }

  const visibilityResult = validateHookVisibility(payload.visibilityPolicy);
  if (!visibilityResult.ok) {
    return visibilityResult;
  }

  if (typeof payload.hookBudgetCost !== "number" || payload.hookBudgetCost < 0 || payload.hookBudgetCost > 1) {
    return fail("invalid_hook_budget", "Each delayed hook contract must cost 0 or 1 hook budget");
  }

  if (payload.reward === undefined && !isRecord(payload.returnScene) && !hasResolvedPayload) {
    return fail("invalid_hook_resolution", "Delayed hooks require a reward, cost, transformation, trade, or return payload");
  }

  return { ok: true };
}

export function validatePairedReturnContractPayload(payload: Record<string, unknown>): ValidationResult {
  if (typeof payload.pairedReturnId !== "string" || payload.pairedReturnId.length === 0) {
    return fail("invalid_paired_return_reference", "Paired returns require a stable pairedReturnId");
  }

  if (typeof payload.anchor !== "string" || payload.anchor.length === 0) {
    return fail("invalid_paired_return_reference", "Paired returns require an anchor");
  }

  if (!isRecord(payload.created) || typeof payload.created.referenceId !== "string") {
    return fail("invalid_paired_return_reference", "Paired returns require a created object, status, cost, or promise reference");
  }

  if (!isRecord(payload.returnScene) || payload.returnScene.referencesCreatedId !== payload.created.referenceId) {
    return fail("invalid_paired_return_reference", "Paired return scenes must reference the created object, status, cost, or promise");
  }

  const triggerResult = validateHookTriggerSelector(payload.returnScene.triggerSelector);
  if (!triggerResult.ok) {
    return triggerResult;
  }

  const expirationResult = validateHookExpiration(payload.returnScene.expiration);
  if (!expirationResult.ok) {
    return expirationResult;
  }

  const durationResult = validateHookDuration(payload.returnScene.duration);
  if (!durationResult.ok) {
    return durationResult;
  }

  const mirroredReturnSceneFields: [string, unknown, unknown][] = [
    ["triggerSelector", payload.triggerSelector, payload.returnScene.triggerSelector],
    ["resolution", payload.resolution, payload.returnScene.resolution],
    ["expiration", payload.expiration, payload.returnScene.expiration],
    ["duration", payload.duration, payload.returnScene.duration],
  ];
  for (const [field, mirroredValue, returnSceneValue] of mirroredReturnSceneFields) {
    if (mirroredValue !== undefined && stableStringify(mirroredValue) !== stableStringify(returnSceneValue)) {
      return fail("invalid_paired_return_contract", "Paired return delayed fields must match returnScene", { field });
    }
  }

  const visibilityResult = validateHookVisibility(payload.visibilityPolicy);
  if (!visibilityResult.ok) {
    return visibilityResult;
  }

  return { ok: true };
}

export function flattenOperationContracts(operations: readonly JourneyOperation[]): JourneyOperation[] {
  return operations.flatMap((operation) => [
    operation,
    ...(operation.operationKind === "delayed_hook" && Array.isArray(operation.rewardOperations)
      ? flattenOperationContracts(operation.rewardOperations)
      : []),
  ]);
}

export function validateTypedPayloadContracts(manifest: JourneyManifest): ValidationResult {
  for (const random of manifest.precommitted.random ?? []) {
    const result = validateRandomEnvelopePayload(random);

    if (!result.ok) {
      return result;
    }
  }

  const optionRouteEffects = manifest.options.flatMap((option) =>
    isRecord(option) && Array.isArray(option.routeEffects) ? option.routeEffects : []
  );
  const routePayloads = [
    ...optionRouteEffects,
    ...(manifest.precommitted.routeEdits ?? []),
  ];

  for (const payload of routePayloads) {
    if (!isRecord(payload)) {
      continue;
    }

    if (typeof payload.routeOperationKind === "string" || typeof payload.kind === "string" && payload.kind.startsWith("route_")) {
      const result = validateRoutePayloadContract(payload);

      if (!result.ok) {
        return result;
      }
    }
  }

  const operations = flattenOperationContracts([
    ...manifest.options.flatMap((option) =>
      isRecord(option) && Array.isArray(option.operations) ? option.operations : []
    ),
    ...(manifest.precommitted.operations ?? []),
    ...(manifest.rewardPool?.operations ?? []),
    ...(manifest.tree?.nodes.flatMap((node) =>
      node.branches.flatMap((branch) => [
        ...branch.operations,
        ...(branch.terminal?.operations ?? []),
      ])
    ) ?? []),
  ]);

  for (const operation of operations) {
    if (
      operation.operationKind === "route_edit" &&
      (
        typeof operation.payload.routeOperationKind === "string" ||
        (typeof operation.payload.kind === "string" && operation.payload.kind.startsWith("route_"))
      )
    ) {
      const result = validateRoutePayloadContract(operation.payload);

      if (!result.ok) {
        return result;
      }
    }

    if (operation.operationKind === "status") {
      const result = validateStatusPayloadContract(operation.payload);

      if (!result.ok) {
        return result;
      }
    }

    if (
      operation.operationKind === "delayed_hook" &&
      (
        operation.payload.kind === "delayed_hook_contract" ||
        operation.payload.kind === "paired_return_contract" ||
        operation.triggerSelector !== undefined
      )
    ) {
      const result = validateDelayedHookContractPayload(
        operation.payload,
        Array.isArray(operation.rewardOperations) && operation.rewardOperations.length > 0,
      );

      if (!result.ok) {
        return result;
      }
    }

    if (
      operation.operationKind === "paired_return" &&
      (operation.payload.kind === "paired_return_contract" || operation.contract !== undefined)
    ) {
      const result = validatePairedReturnContractPayload(operation.payload);

      if (!result.ok) {
        return result;
      }
    }
  }

  return { ok: true };
}

export function routeEffectNeedsTiming(routeEffect: unknown): boolean {
  if (!isRecord(routeEffect) || typeof routeEffect.kind !== "string") {
    return false;
  }

  return routeEffect.kind.includes("future") || routeEffect.kind.includes("next");
}

export function validateRouteEffects(routeEffects: readonly unknown[]): ValidationResult {
  for (const routeEffect of routeEffects) {
    if (!isRecord(routeEffect) || typeof routeEffect.kind !== "string") {
      return fail("invalid_route_effect", "Route effects must be structured manifest records");
    }

    if (
      !("routeOperationKind" in routeEffect) &&
      (routeEffect.kind.includes("addition") || routeEffect.kind.includes("add"))
    ) {
      return fail("route_addition_standalone_positive_reward", "Route addition cannot be a standalone route edit");
    }

    if (routeEffectNeedsTiming(routeEffect) && typeof routeEffect.timing !== "string") {
      return fail("route_edit_without_committed_timing", "Future route edits require explicit committed timing");
    }
  }

  return { ok: true };
}
