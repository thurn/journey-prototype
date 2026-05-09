import { stableStringify } from "../../util/stableJson.js";
import type { JourneyContext } from "../../quest/context.js";
import {
  SITE_TYPES,
  STATUS_SCOPES,
} from "../effects.js";
import type {
  GeneratedObjectDefinition,
  JourneyManifest,
  JourneyOperation,
  ResourceAmountSemantics,
} from "../manifest.js";
import { validateDreamsignPayload } from "./dreamsignPayloads.js";
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

  if (
    typeof payload.returnScene.referencesAnchor === "string" &&
    payload.returnScene.referencesAnchor !== payload.anchor
  ) {
    return fail("invalid_paired_return_reference", "Paired return scenes must reference the created anchor");
  }

  if (payload.futureCost === undefined || payload.returnReward === undefined) {
    return fail("invalid_paired_return_contract", "Paired returns require structured futureCost and returnReward payloads");
  }

  if (
    payload.returnScene.futureCost !== undefined &&
    stableStringify(payload.returnScene.futureCost) !== stableStringify(payload.futureCost)
  ) {
    return fail("invalid_paired_return_contract", "Paired return futureCost must match returnScene", { field: "futureCost" });
  }

  if (
    payload.returnScene.returnReward !== undefined &&
    stableStringify(payload.returnScene.returnReward) !== stableStringify(payload.returnReward)
  ) {
    return fail("invalid_paired_return_contract", "Paired return returnReward must match returnScene", { field: "returnReward" });
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

function validateResourceSemanticsContract(
  operation: JourneyOperation,
): ValidationResult {
  const semantics = operation.resourceSemantics;

  if (!semantics) {
    return { ok: true };
  }

  const amountKinds = new Set<ResourceAmountSemantics["amountKind"]>([
    "fixed",
    "maximum",
    "restore_to_maximum",
    "percentage_of_current",
    "percentage_of_maximum",
    "all_remaining",
    "random_range",
    "cap_change",
    "reward_reduction",
  ]);

  if (
    !["essence", "omens", "maxEssence"].includes(semantics.resource) ||
    !amountKinds.has(semantics.amountKind)
  ) {
    return fail("invalid_resource_semantics", "Resource operations require a supported resource and amount kind");
  }

  if (
    semantics.amountKind === "fixed" &&
    (typeof semantics.amount !== "number" || semantics.amount < 0)
  ) {
    return fail("invalid_resource_amount", "Fixed resource operations require a nonnegative amount");
  }

  if (
    (semantics.amountKind === "percentage_of_current" ||
      semantics.amountKind === "percentage_of_maximum") &&
    (typeof semantics.percentage !== "number" ||
      semantics.percentage <= 0 ||
      semantics.percentage > 100)
  ) {
    return fail("invalid_resource_percentage", "Percentage resource operations require a percentage in 1..100");
  }

  if (
    semantics.amountKind === "random_range" &&
    (typeof semantics.minimum !== "number" ||
      typeof semantics.maximum !== "number" ||
      semantics.minimum < 0 ||
      semantics.minimum > semantics.maximum)
  ) {
    return fail("invalid_resource_random_range", "Random resource ranges require nonnegative minimum <= maximum");
  }

  if (
    semantics.amountKind === "cap_change" &&
    (typeof semantics.capDelta !== "number" || semantics.capDelta === 0)
  ) {
    return fail("invalid_resource_cap_change", "Resource cap changes require a nonzero cap delta");
  }

  if (
    semantics.amountKind === "reward_reduction" &&
    (typeof semantics.amount !== "number" || semantics.amount <= 0)
  ) {
    return fail("invalid_resource_reward_reduction", "Reward reductions require a positive resource amount");
  }

  if (
    operation.operationKind === "cost" &&
    semantics.amountKind === "fixed" &&
    operation.amount !== semantics.amount
  ) {
    return fail("incoherent_resource_cost_semantics", "Cost operation amount must match fixed resource semantics");
  }

  return { ok: true };
}

function validateCardOperationContract(operation: JourneyOperation): ValidationResult {
  if (operation.operationKind !== "reward") {
    return { ok: true };
  }

  const kind = operation.rewardKind;
  const payload = operation.payload;

  if (!kind.startsWith("card_") && kind !== "starter_cleanup" && kind !== "starter_replacement") {
    return { ok: true };
  }

  if (
    kind === "card_duplicate" &&
    payload.copyCount !== undefined &&
    (typeof payload.copyCount !== "number" || payload.copyCount < 1)
  ) {
    return fail("card_duplicate_count_invalid", "Card duplicate operations require a positive copy count");
  }

  if (
    (kind === "card_transform" || kind === "card_replace") &&
    payload.resultSelection !== "hidden_random" &&
    typeof payload.resultCardId !== "string" &&
    typeof payload.resultCardName !== "string" &&
    typeof payload.newCardId !== "string" &&
    typeof payload.newCardName !== "string"
  ) {
    return fail("card_operation_result_missing", "Card transform and replace operations require a structured result card");
  }

  if (
    (kind === "card_keyword_add" || kind === "card_keyword_remove") &&
    typeof payload.keyword !== "string"
  ) {
    return fail("card_keyword_operation_invalid", "Card keyword operations require a controlled keyword");
  }

  if (
    kind === "card_type_change" &&
    typeof payload.newCardType !== "string" &&
    typeof payload.newSubtype !== "string"
  ) {
    return fail("card_type_change_invalid", "Card type-change operations require a new type or subtype");
  }

  if (
    (kind === "card_text_modification" || kind === "card_rewrite") &&
    typeof payload.field !== "string" &&
    typeof payload.modificationKind !== "string" &&
    typeof payload.textModification !== "string" &&
    typeof payload.keyword !== "string" &&
    payload.removeTargetRestriction !== true
  ) {
    return fail("card_text_operation_invalid", "Card text operations require a structured field or modification kind");
  }

  if (
    (kind === "card_opening_hand" ||
      kind === "card_temporary_copy") &&
    typeof payload.duration !== "string" &&
    !isRecord(payload.duration)
  ) {
    return fail("card_temporary_window_missing", "Temporary or delayed card operations require duration metadata");
  }

  if (
    kind === "card_delayed_transformation" &&
    typeof payload.duration !== "string" &&
    !isRecord(payload.duration) &&
    typeof payload.trigger !== "string"
  ) {
    return fail("card_temporary_window_missing", "Temporary or delayed card operations require duration metadata");
  }

  if (
    kind === "card_merge" &&
    typeof payload.mergeMode !== "string" &&
    payload.cardOperationKind !== "merge"
  ) {
    return fail("card_merge_mode_missing", "Card merge operations require a merge mode");
  }

  if (
    kind === "card_split" &&
    typeof payload.splitMode !== "string" &&
    payload.cardOperationKind !== "split"
  ) {
    return fail("card_split_mode_missing", "Card split operations require a split mode");
  }

  return { ok: true };
}

function validateBaneOperationContract(operation: JourneyOperation): ValidationResult {
  const payload = operation.payload;
  const baneKind = operation.operationKind === "reward"
    ? operation.rewardKind
    : operation.operationKind === "burden"
      ? operation.burdenKind
      : "";

  if (!baneKind.startsWith("bane_")) {
    return { ok: true };
  }

  if (typeof payload.baneName === "string" && payload.baneName.trim().length === 0) {
    return fail("bane_name_missing", "Bane operations require a nonempty Bane name");
  }

  if (payload.count !== undefined && (typeof payload.count !== "number" || payload.count < 1)) {
    return fail("bane_count_invalid", "Bane operations require a positive count");
  }

  if (
    (baneKind === "bane_temporary" || payload.temporary === true) &&
    typeof payload.duration !== "string" &&
    !isRecord(payload.duration)
  ) {
    return fail("bane_temporary_duration_missing", "Temporary Bane operations require duration metadata");
  }

  if (
    baneKind === "bane_delayed" &&
    typeof payload.timing !== "string" &&
    !isRecord(operation.timing)
  ) {
    return fail("bane_delayed_timing_missing", "Delayed Bane operations require timing metadata");
  }

  if (
    baneKind === "bane_replace" &&
    typeof payload.newBaneName !== "string" &&
    typeof payload.replacementKind !== "string"
  ) {
    return fail("bane_replacement_missing", "Bane replacement operations require a replacement Bane or relief target");
  }

  if (
    baneKind === "bane_transform_to_card" &&
    typeof payload.cardId !== "string" &&
    typeof payload.cardName !== "string" &&
    typeof payload.resultCardId !== "string" &&
    typeof payload.resultCardName !== "string"
  ) {
    return fail("bane_transform_result_missing", "Bane-to-card transformations require a result card");
  }

  return { ok: true };
}

function validateBattleWindowContract(operation: JourneyOperation): ValidationResult {
  if (
    !(
      operation.operationKind === "reward" &&
      operation.rewardKind === "battle_window_modifier"
    ) &&
    !(operation.legacyKind === "battle_window_modifier")
  ) {
    return { ok: true };
  }

  const payload = operation.payload;

  if (
    typeof payload.battleWindowOperationKind !== "string" &&
    typeof payload.windowModifier !== "string" &&
    typeof payload.modifier !== "string"
  ) {
    return fail("battle_window_operation_missing", "Battle-window modifiers require an operation kind");
  }

  if (
    payload.affectedPlayer !== undefined &&
    payload.affectedPlayer !== "you" &&
    payload.affectedPlayer !== "player" &&
    payload.affectedPlayer !== "opponent" &&
    payload.affectedPlayer !== "both_players" &&
    payload.affectedPlayer !== "both"
  ) {
    return fail("battle_window_player_invalid", "Battle-window modifiers require player, opponent, or both-player targeting");
  }

  if (
    payload.polarity !== undefined &&
    payload.polarity !== "positive" &&
    payload.polarity !== "negative" &&
    payload.polarity !== "neutral" &&
    payload.polarity !== "mixed"
  ) {
    return fail("battle_window_polarity_invalid", "Battle-window modifiers require positive, negative, neutral, or mixed polarity");
  }

  if (typeof payload.duration !== "string" && !isRecord(payload.duration)) {
    return fail("battle_window_duration_missing", "Battle-window modifiers require duration metadata");
  }

  return { ok: true };
}

function validateDreamwellWindowContract(operation: JourneyOperation): ValidationResult {
  const isDreamwell =
    operation.legacyKind === "dreamwell_modifier" ||
    (
      operation.operationKind === "reward" &&
      operation.rewardKind === "dreamwell_modifier"
    ) ||
    (
      operation.operationKind === "burden" &&
      operation.burdenKind === "dreamwell_modifier"
    );

  if (!isDreamwell) {
    return { ok: true };
  }

  const payload = operation.payload;

  if (
    payload.dreamwellScope !== "next_battle" &&
    payload.dreamwellScope !== "battle_window" &&
    payload.dreamwellScope !== "future_dreamwell"
  ) {
    return fail("dreamwell_scope_invalid", "Dreamwell modifiers require a next-battle, battle-window, or future-Dreamwell scope");
  }

  if (
    typeof payload.dreamwellOperationKind !== "string" ||
    payload.dreamwellOperationKind.length === 0
  ) {
    return fail("dreamwell_operation_missing", "Dreamwell modifiers require an operation kind");
  }

  if (payload.count !== undefined && (typeof payload.count !== "number" || payload.count < 1)) {
    return fail("dreamwell_count_invalid", "Dreamwell modifiers require a positive count when count is present");
  }

  return { ok: true };
}

function validateShopContract(operation: JourneyOperation): ValidationResult {
  if (
    !(
      operation.operationKind === "reward" &&
      operation.rewardKind === "shop_economy_modifier"
    )
  ) {
    return { ok: true };
  }

  const payload = operation.payload;

  if (
    typeof payload.shopOperationKind !== "string" &&
    typeof payload.shopRuleKind !== "string" &&
    typeof payload.economyOperationKind !== "string"
  ) {
    return fail("shop_operation_missing", "Shop modifiers require a structured shop operation kind");
  }

  if (
    payload.priceMultiplier !== undefined &&
    (typeof payload.priceMultiplier !== "number" || payload.priceMultiplier <= 0)
  ) {
    return fail("shop_price_modifier_invalid", "Shop price multipliers must be positive");
  }

  if (
    payload.rerollOmenCap !== undefined &&
    (typeof payload.rerollOmenCap !== "number" || payload.rerollOmenCap < 0)
  ) {
    return fail("shop_reroll_cap_invalid", "Shop reroll omen caps must be nonnegative");
  }

  return { ok: true };
}

function validateGeneratedObjectOperationContract(
  operation: JourneyOperation,
): ValidationResult {
  if (operation.operationKind !== "generated_object") {
    return { ok: true };
  }

  const generatedObject = operation.generatedObject;

  if (!isRecord(generatedObject)) {
    return fail("invalid_generated_object_operation", "Generated-object operations require a local definition");
  }

  if (
    typeof operation.payload.generatedObjectId === "string" &&
    operation.payload.generatedObjectId !== generatedObject.generatedObjectId
  ) {
    return fail("generated_object_operation_mismatch", "Generated-object operation payload must reference its local definition");
  }

  if (
    typeof operation.payload.generatedObjectKind === "string" &&
    operation.payload.generatedObjectKind !== generatedObject.generatedObjectKind
  ) {
    return fail("generated_object_operation_mismatch", "Generated-object operation kind must match its local definition");
  }

  return { ok: true };
}

function generatedObjectOperationDefinitions(
  operation: JourneyOperation,
): GeneratedObjectDefinition[] {
  return operation.operationKind === "generated_object" && isRecord(operation.generatedObject)
    ? [operation.generatedObject]
    : [];
}

export function flattenOperationContracts(operations: readonly JourneyOperation[]): JourneyOperation[] {
  return operations.flatMap((operation) => [
    operation,
    ...(operation.operationKind === "delayed_hook" && Array.isArray(operation.rewardOperations)
      ? flattenOperationContracts(operation.rewardOperations)
      : []),
  ]);
}

export function validateTypedPayloadContracts(
  manifest: JourneyManifest,
  context: JourneyContext,
): ValidationResult {
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
    const resourceResult = validateResourceSemanticsContract(operation);

    if (!resourceResult.ok) {
      return resourceResult;
    }

    const cardResult = validateCardOperationContract(operation);

    if (!cardResult.ok) {
      return cardResult;
    }

    const baneResult = validateBaneOperationContract(operation);

    if (!baneResult.ok) {
      return baneResult;
    }

    const battleWindowResult = validateBattleWindowContract(operation);

    if (!battleWindowResult.ok) {
      return battleWindowResult;
    }

    const dreamwellWindowResult = validateDreamwellWindowContract(operation);

    if (!dreamwellWindowResult.ok) {
      return dreamwellWindowResult;
    }

    const shopResult = validateShopContract(operation);

    if (!shopResult.ok) {
      return shopResult;
    }

    const generatedObjectResult = validateGeneratedObjectOperationContract(operation);

    if (!generatedObjectResult.ok) {
      return generatedObjectResult;
    }

    if (operation.operationKind === "reward") {
      const dreamsignResult = validateDreamsignPayload(
        operation.payload,
        context,
        Number(operation.payload.optionNumber ?? 0),
      );

      if (!dreamsignResult.ok) {
        return dreamsignResult;
      }
    }

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

  for (const generatedObject of operations.flatMap(generatedObjectOperationDefinitions)) {
    const generatedObjectResult = validateGeneratedObjectOperationContract({
      operationId: `generated-object:${generatedObject.generatedObjectId}`,
      operationKind: "generated_object",
      role: "generated_object",
      visibility: "debug",
      generatedObject,
      payload: {
        generatedObjectId: generatedObject.generatedObjectId,
        generatedObjectKind: generatedObject.generatedObjectKind,
      },
    });

    if (!generatedObjectResult.ok) {
      return generatedObjectResult;
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
