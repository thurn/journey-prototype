import type { JourneyContext } from "../quest/context.js";
import { RENDERER_VERSION } from "../render/theme.js";
import { stableStringify } from "../util/stableJson.js";
import {
  EFFECT_CATALOG_VERSION,
  SITE_TYPES,
  STATUS_SCOPES,
  isBaneName,
  isImmediateCostPayable,
  generatedObjectResolverPool,
  resolveCardTargets,
  resolveDreamsignTargets,
  resolveTargetSelector,
  STANDARD_TRANSFIGURATIONS,
  validateNamedReferences,
  type CardTargetPredicate,
  type DreamsignTargetPredicate,
  type ImmediateCost,
} from "./effects.js";
import type {
  JourneyManifest,
  JourneyOperation,
  JourneyOption,
  GeneratedObjectDefinition,
  TargetResolutionMetadata,
  TargetSelector,
  ValidationCheckedPayload,
  ValidationReport,
  ValidationRuleOutcome,
} from "./manifest.js";
import {
  MANIFEST_CONTRACT_VERSION,
  MANIFEST_SCHEMA_VERSION,
} from "./manifest.js";
import {
  getShapeDefinition,
  JOURNEY_SHAPE_CATALOG_VERSION,
} from "./shapes.js";
import {
  LOSS_CHOICE_VALUE_CONSTANTS,
  POSITIVE_MENU_VALUE_CONSTANTS,
  VALUE_MODEL_VERSION,
} from "./value.js";

export const VALIDATION_CONTRACT_VERSION = "validation:v1";

export type ValidationResult =
  | { ok: true }
  | { ok: false; rule: string; message: string; debug?: Record<string, unknown> };

function fail(rule: string, message: string, debug?: Record<string, unknown>): ValidationResult {
  return { ok: false, rule, message, ...(debug ? { debug } : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function targetResolutionFromDebug(debug: Record<string, unknown> | undefined): TargetResolutionMetadata | undefined {
  const targetResolution = debug?.targetResolution;

  return isRecord(targetResolution) &&
    typeof targetResolution.selectorKind === "string" &&
    typeof targetResolution.sourcePool === "string" &&
    typeof targetResolution.candidateCount === "number" &&
    Array.isArray(targetResolution.selected)
    ? targetResolution as TargetResolutionMetadata
    : undefined;
}

function payloadFamilyFor(manifest: JourneyManifest): string {
  return manifest.debug.debugPayload?.familyId ?? "adapter";
}

function manifestCheckedPayloads(manifest: JourneyManifest): ValidationCheckedPayload[] {
  const payloadFamily = payloadFamilyFor(manifest);
  const checked: ValidationCheckedPayload[] = [
    {
      path: "$",
      scope: "manifest",
      shapeId: manifest.shapeId,
      payloadFamily,
    },
    ...manifest.options.map((option, index) => ({
      path: `$.options[${
        isRecord(option) && typeof option.number === "number"
          ? option.number - 1
          : index
      }]`,
      scope: "option" as const,
      ...(isRecord(option) && typeof option.number === "number" ? { optionNumber: option.number } : {}),
      shapeId: manifest.shapeId,
      payloadFamily,
    })),
  ];

  if (manifest.tree) {
    for (const node of manifest.tree.nodes) {
      for (const branch of node.branches) {
        checked.push({
          path: `$.tree.nodes.${node.id}.branches.${branch.id}`,
          scope: "tree_branch",
          shapeId: manifest.shapeId,
          payloadFamily,
        });

        if (branch.terminal) {
          checked.push({
            path: `$.tree.nodes.${node.id}.branches.${branch.id}.terminal`,
            scope: "tree_terminal",
            shapeId: manifest.shapeId,
            payloadFamily,
          });
        }
      }
    }
  }

  if (manifest.rewardPool) {
    checked.push({
      path: "$.rewardPool",
      scope: "reward_pool",
      shapeId: manifest.shapeId,
      payloadFamily,
    });
  }

  checked.push({
    path: "$.precommitted",
    scope: "precommitted",
    shapeId: manifest.shapeId,
    payloadFamily,
  });

  return checked;
}

function resultToOutcome(
  ruleId: string,
  result: ValidationResult,
  checked: ValidationCheckedPayload[],
  passMessage: string,
): ValidationRuleOutcome {
  const targetResolution = !result.ok ? targetResolutionFromDebug(result.debug) : undefined;
  const checkedWithTarget = targetResolution
    ? checked.map((entry) => ({ ...entry, targetResolution }))
    : checked;

  return result.ok
    ? {
        ruleId,
        severity: "error",
        status: "pass",
        message: passMessage,
        checked,
      }
    : {
        ruleId: result.rule,
        severity: "error",
        status: "fail",
        message: result.message,
        checked: checkedWithTarget,
        ...(result.debug ? { debug: result.debug } : {}),
      };
}

function buildReport(rules: ValidationRuleOutcome[]): ValidationReport {
  const firstFailure = rules.find((rule) => rule.status === "fail");

  return {
    ok: firstFailure === undefined,
    passed: rules.filter((rule) => rule.status === "pass").length,
    failed: rules.filter((rule) => rule.status === "fail").length,
    ...(firstFailure
      ? {
          firstFailure: {
            ruleId: firstFailure.ruleId,
            message: firstFailure.message,
            severity: firstFailure.severity,
            checked: firstFailure.checked,
          },
        }
      : {}),
    rules,
  };
}

function asImmediateCost(value: unknown): ImmediateCost | null {
  if (!isRecord(value)) {
    return null;
  }

  const amount = typeof value.amount === "number" ? value.amount : 0;

  if (value.kind === "essence") {
    return { essence: amount };
  }

  if (value.kind === "omens") {
    return { omens: amount };
  }

  return null;
}

function stringEntries(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function immediateCostFromOperation(operation: JourneyOperation): ImmediateCost | null {
  if (operation.operationKind !== "cost") {
    return null;
  }

  return operation.resource === "essence"
    ? { essence: operation.amount }
    : { omens: operation.amount };
}

function baneTargetContext(value: Record<string, unknown>): "current_state" | "future_burden" | "manifest_obligation" {
  return value.baneTargetContext === "current_state"
    ? "current_state"
    : value.baneTargetContext === "manifest_obligation"
      ? "manifest_obligation"
      : "future_burden";
}

function isBaneCurrentStateRequirement(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const kind = typeof value.kind === "string" ? value.kind : "";

  return (
    kind === "bane_purge" ||
    kind === "bane_random_purge" ||
    kind === "bane_chosen_purge" ||
    kind === "bane_replace" ||
    kind === "bane_transform_to_card"
  ) && baneTargetContext(value) === "current_state";
}

function operationPayloadCount(value: {
  costs?: readonly unknown[];
  effects?: readonly unknown[];
  burdens?: readonly unknown[];
  targets?: readonly unknown[];
  triggers?: readonly unknown[];
  routeEffects?: readonly unknown[];
}): number {
  return (value.costs?.length ?? 0) +
    (value.effects?.length ?? 0) +
    (value.burdens?.length ?? 0) +
    (value.targets?.length ?? 0) +
    (value.triggers?.length ?? 0) +
    (value.routeEffects?.length ?? 0);
}

function validateOperationsShape(
  operations: readonly JourneyOperation[] | undefined,
  path: string,
  legacyPayloadCount: number,
): ValidationResult {
  if (legacyPayloadCount > 0 && (!Array.isArray(operations) || operations.length === 0)) {
    return fail("missing_semantic_operations", `${path} has legacy payload records without typed semantic operations`);
  }

  for (const [index, operation] of (operations ?? []).entries()) {
    if (!isRecord(operation) || typeof operation.operationKind !== "string" || typeof operation.role !== "string") {
      return fail("invalid_semantic_operation", `${path} operation ${index + 1} must be a typed semantic operation`);
    }
  }

  return { ok: true };
}

function validateSemanticOperations(manifest: JourneyManifest): ValidationResult {
  for (const option of manifest.options) {
    const result = validateOperationsShape(
      option.operations,
      `Option ${option.number}`,
      operationPayloadCount(option),
    );

    if (!result.ok) {
      return result;
    }
  }

  for (const node of manifest.tree?.nodes ?? []) {
    for (const branch of node.branches) {
      const branchResult = validateOperationsShape(
        branch.operations,
        `Tree branch ${branch.id}`,
        operationPayloadCount(branch),
      );

      if (!branchResult.ok) {
        return branchResult;
      }

      if (branch.terminal) {
        const terminalResult = validateOperationsShape(
          branch.terminal.operations,
          `Tree branch ${branch.id} terminal`,
          operationPayloadCount(branch.terminal),
        );

        if (!terminalResult.ok) {
          return terminalResult;
        }
      }
    }
  }

  if (manifest.rewardPool) {
    const result = validateOperationsShape(
      manifest.rewardPool.operations,
      "Reward pool",
      manifest.rewardPool.rewards.length,
    );

    if (!result.ok) {
      return result;
    }
  }

  const precommittedLegacyCount =
    (manifest.precommitted.random?.length ?? 0) +
    (manifest.precommitted.delayed?.length ?? 0) +
    (manifest.precommitted.pairedReturn?.length ?? 0) +
    (manifest.precommitted.routeEdits?.length ?? 0);
  const precommittedResult = validateOperationsShape(
    manifest.precommitted.operations,
    "Precommitted outcomes",
    precommittedLegacyCount,
  );

  if (!precommittedResult.ok) {
    return precommittedResult;
  }

  return { ok: true };
}

const ROUTE_OPERATION_KINDS = new Set([
  "add_site",
  "remove_site",
  "replace_site",
  "purge_site",
  "probability_adjustment",
]);

const ROUTE_SCOPES = new Set([
  "current_dreamscape",
  "next_dreamscape",
  "future_dreamscapes",
  "full_atlas",
]);

const ROUTE_POLARITIES = new Set(["positive", "negative", "neutral"]);

const SITE_TYPE_SET = new Set<string>(SITE_TYPES);
const STATUS_SCOPE_SET = new Set<string>(STATUS_SCOPES);

function validateRoutePayloadContract(payload: Record<string, unknown>): ValidationResult {
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

function validateStatusPayloadContract(payload: Record<string, unknown>): ValidationResult {
  if (typeof payload.statusScope !== "string" || !STATUS_SCOPE_SET.has(payload.statusScope)) {
    return fail("unsupported_status_scope", "Status and rule mutations require a supported status scope");
  }

  if (typeof payload.duration !== "string" || payload.duration.length === 0) {
    return fail("invalid_status_duration", "Status and rule mutations require a structured duration");
  }

  if (typeof payload.ruleMutationKind !== "string" || payload.ruleMutationKind.length === 0) {
    return fail("incoherent_rule_mutation", "Status and rule mutations require a rule mutation kind");
  }

  if (payload.ruleMutationKind === "reward_replacement" && typeof payload.replacement !== "string") {
    return fail("incoherent_rule_mutation", "Reward replacement statuses require a replacement");
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
    payload.ruleMutationKind === "deck_size_constraint" &&
    (typeof payload.exactDeckSize !== "number" || payload.exactDeckSize < 1)
  ) {
    return fail("incoherent_rule_mutation", "Deck-size constraints require a positive exact deck size");
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
    (payload.ruleMutationKind !== "deck_size_constraint" ||
      payload.prohibitedAction !== "voluntary_deck_cut" ||
      typeof payload.deckCutFloor !== "number" ||
      payload.deckCutFloor < 1 ||
      payload.deckCutFloor !== payload.exactDeckSize)
  ) {
    return fail("incoherent_rule_mutation", "Deck-cut prohibitions require a floor matching the exact deck size");
  }

  return { ok: true };
}

const HOOK_TRIGGER_KINDS = new Set([
  "battle",
  "victory",
  "each_battle",
  "site_visit",
  "named_card_play",
  "dreamsign_trigger",
  "card_added",
  "essence_payment",
  "future_shop",
  "future_dream_journey",
]);

const HOOK_EXPIRATION_POLICIES = new Set([
  "forfeit_reward",
  "resolve_partial",
  "pay_cost",
  "return_unchanged",
  "discard_obligation",
]);

const HOOK_DURATION_KINDS = new Set([
  "battle_count",
  "dreamscape_count",
  "shop_count",
  "journey_count",
  "until_trigger",
]);

const HOOK_CONTROLLED_SCENES = new Set(["reward", "cost", "transformation", "trade", "return"]);

function validateHookTriggerSelector(value: unknown): ValidationResult {
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

function validateHookDuration(value: unknown): ValidationResult {
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

function validateHookExpiration(value: unknown): ValidationResult {
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

function validateHookVisibility(value: unknown): ValidationResult {
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

function validateHookControlledScene(value: unknown): ValidationResult {
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

function validateDelayedHookContractPayload(
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

function validatePairedReturnContractPayload(payload: Record<string, unknown>): ValidationResult {
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

function flattenOperationContracts(operations: readonly JourneyOperation[]): JourneyOperation[] {
  return operations.flatMap((operation) => [
    operation,
    ...(operation.operationKind === "delayed_hook" && Array.isArray(operation.rewardOperations)
      ? flattenOperationContracts(operation.rewardOperations)
      : []),
  ]);
}

function validateTypedPayloadContracts(manifest: JourneyManifest): ValidationResult {
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

function validateVersionMetadata(manifest: JourneyManifest, context: JourneyContext): ValidationResult {
  if (!isRecord(manifest.versions)) {
    return fail("manifest_version_metadata", "Manifest version metadata is required");
  }

  const expected: JourneyManifest["versions"] = {
    contentVersion: context.contentVersion,
    shapeCatalogVersion: JOURNEY_SHAPE_CATALOG_VERSION,
    effectCatalogVersion: EFFECT_CATALOG_VERSION,
    valueModelVersion: VALUE_MODEL_VERSION,
    rendererVersion: RENDERER_VERSION,
    manifestContractVersion: MANIFEST_CONTRACT_VERSION,
    validationContractVersion: VALIDATION_CONTRACT_VERSION,
  };

  for (const [key, value] of Object.entries(expected)) {
    if (manifest.versions[key as keyof JourneyManifest["versions"]] !== value) {
      return fail("manifest_version_metadata", `Manifest version metadata ${key} must be ${value}`);
    }
  }

  return { ok: true };
}

function validateReferences(manifest: JourneyManifest, context: JourneyContext): ValidationResult {
  const structuredReferences = collectStructuredReferences([
    Array.isArray(manifest.generatedObjects) ? manifest.generatedObjects : [],
    manifest.options,
    manifest.tree,
    manifest.rewardPool,
    manifest.precommitted,
  ]);
  const result = validateNamedReferences(context.content, {
    cards: [...manifest.references.cardIds, ...structuredReferences.cards],
    dreamsigns: [
      ...manifest.references.dreamsignIds,
      ...structuredReferences.dreamsigns,
    ],
    dreamcallers: [
      ...manifest.references.dreamcallerIds,
      ...structuredReferences.dreamcallers,
    ],
    banes: [...manifest.references.baneNames, ...structuredReferences.banes],
    rules: structuredReferences.rules,
  });

  if (!result.ok) {
    return fail("unresolved_reference", result.errors[0] ?? "Unresolved reference");
  }

  return { ok: true };
}

function validateGeneratedObjectDefinitions(
  manifest: JourneyManifest,
  context: JourneyContext,
): ValidationResult {
  const seen = new Set<string>();

  for (const generatedObject of generatedObjectResolverPool(manifest)) {
    if (!isRecord(generatedObject)) {
      return fail("invalid_generated_object_definition", "Generated object definitions must be structured records");
    }

    if (!generatedObject.generatedObjectId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(generatedObject.generatedObjectId)) {
      return fail("invalid_generated_object_id", "Generated object IDs must be stable kebab-case IDs");
    }

    if (seen.has(generatedObject.generatedObjectId)) {
      return fail("duplicate_generated_object_id", `Duplicate generated object ID: ${generatedObject.generatedObjectId}`);
    }
    seen.add(generatedObject.generatedObjectId);

    if (!["card", "dreamsign", "status", "transfiguration"].includes(generatedObject.generatedObjectKind)) {
      return fail("invalid_generated_object_kind", `Invalid generated object kind: ${generatedObject.generatedObjectKind}`);
    }

    if (typeof generatedObject.name !== "string" || generatedObject.name.trim().length === 0) {
      return fail("invalid_generated_object_name", `Generated object ${generatedObject.generatedObjectId} requires a display name`);
    }

    if (typeof generatedObject.objectType !== "string" || generatedObject.objectType.trim().length === 0) {
      return fail("invalid_generated_object_type", `Generated object ${generatedObject.generatedObjectId} requires an object type`);
    }

    if (typeof generatedObject.rulesText !== "string" || generatedObject.rulesText.trim().length < 10) {
      return fail("invalid_generated_object_rules", `Generated object ${generatedObject.generatedObjectId} requires compact rules text`);
    }

    if (!Array.isArray(generatedObject.tags) || generatedObject.tags.length === 0) {
      return fail("invalid_generated_object_tags", `Generated object ${generatedObject.generatedObjectId} requires tags`);
    }

    if (!isRecord(generatedObject.references)) {
      return fail("invalid_generated_object_references", `Generated object ${generatedObject.generatedObjectId} requires references`);
    }

    const referenceResult = validateNamedReferences(context.content, {
      cards: stringEntries(generatedObject.references.cards),
      dreamsigns: stringEntries(generatedObject.references.dreamsigns),
      dreamcallers: stringEntries(generatedObject.references.dreamcallers),
      banes: stringEntries(generatedObject.references.banes),
      rules: stringEntries(generatedObject.references.rules),
    });

    if (!referenceResult.ok) {
      return fail("generated_object_unresolved_reference", referenceResult.errors[0] ?? "Generated object reference is unresolved");
    }

    if (generatedObject.duration !== undefined) {
      if (
        !isRecord(generatedObject.duration) ||
        typeof generatedObject.duration.durationKind !== "string" ||
        typeof generatedObject.duration.label !== "string" ||
        (generatedObject.duration.count !== undefined &&
          (typeof generatedObject.duration.count !== "number" || generatedObject.duration.count < 1))
      ) {
        return fail("invalid_generated_object_duration", `Generated object ${generatedObject.generatedObjectId} has an invalid duration`);
      }
    }

    if (
      generatedObject.lifetime !== undefined &&
      !["one_time", "temporary", "persistent", "until_returned", "journey_only"].includes(generatedObject.lifetime)
    ) {
      return fail("invalid_generated_object_lifetime", `Generated object ${generatedObject.generatedObjectId} has an invalid lifetime`);
    }

    if (
      !isRecord(generatedObject.valueEstimate) ||
      typeof generatedObject.valueEstimate.convertedEssence !== "number" ||
      !["low", "medium", "high"].includes(String(generatedObject.valueEstimate.confidence)) ||
      typeof generatedObject.valueEstimate.basis !== "string"
    ) {
      return fail("invalid_generated_object_value", `Generated object ${generatedObject.generatedObjectId} requires value metadata`);
    }

    if (
      !isRecord(generatedObject.validation) ||
      generatedObject.validation.source !== "generated_manifest_local" ||
      !["validated", "unvalidated"].includes(String(generatedObject.validation.status)) ||
      !Array.isArray(generatedObject.validation.ruleIds)
    ) {
      return fail("invalid_generated_object_validation", `Generated object ${generatedObject.generatedObjectId} requires validation metadata`);
    }
  }

  return { ok: true };
}

function collectStructuredReferences(value: unknown): {
  cards: string[];
  dreamsigns: string[];
  dreamcallers: string[];
  banes: string[];
  rules: string[];
} {
  const references = {
    cards: [] as string[],
    dreamsigns: [] as string[],
    dreamcallers: [] as string[],
    banes: [] as string[],
    rules: [] as string[],
  };

  function visit(nested: unknown): void {
    if (Array.isArray(nested)) {
      nested.forEach(visit);
      return;
    }

    if (!isRecord(nested)) {
      return;
    }

    if (typeof nested.selectorKind === "string") {
      if (nested.selectorKind === "card") {
        references.cards.push(...stringEntries(nested.ids), ...stringEntries(nested.names));
      } else if (nested.selectorKind === "dreamsign") {
        references.dreamsigns.push(...stringEntries(nested.ids), ...stringEntries(nested.names));
      } else if (nested.selectorKind === "dreamcaller") {
        references.dreamcallers.push(...stringEntries(nested.ids), ...stringEntries(nested.names));
      } else if (nested.selectorKind === "bane") {
        references.banes.push(...stringEntries(nested.names));
      } else if (nested.selectorKind === "route_site") {
        references.rules.push(...stringEntries(nested.siteTypes));
        if (typeof nested.siteType === "string") {
          references.rules.push(nested.siteType);
        }
      } else if (nested.selectorKind === "status") {
        if (typeof nested.scope === "string") {
          references.rules.push(nested.scope);
        }
      } else if (nested.selectorKind === "generated_object") {
        if (typeof nested.generatedObjectKind === "string") {
          references.rules.push(nested.generatedObjectKind);
        }
        if (typeof nested.generatedObjectReferenceKind === "string") {
          references.rules.push(nested.generatedObjectReferenceKind);
        }
      }
    }

    for (const [key, entry] of Object.entries(nested)) {
      if (Array.isArray(entry)) {
        if (key === "cards") {
          references.cards.push(...stringEntries(entry));
        } else if (key === "dreamsigns") {
          references.dreamsigns.push(...stringEntries(entry));
        } else if (key === "dreamcallers") {
          references.dreamcallers.push(...stringEntries(entry));
        } else if (key === "banes") {
          references.banes.push(...stringEntries(entry));
        } else if (key === "rules") {
          references.rules.push(...stringEntries(entry));
        }
      }

      if (typeof entry === "string") {
        if (
          key === "cardName" ||
          key === "cardId" ||
          key === "oldCardName" ||
          key === "oldCardId" ||
          key === "newCardName" ||
          key === "newCardId" ||
          key === "targetCardName" ||
          key === "targetCardId" ||
          key === "resultCardName" ||
          key === "resultCardId" ||
          key === "secondTargetCardName" ||
          key === "secondTargetCardId"
        ) {
          references.cards.push(entry);
        } else if (
          key === "dreamsignName" ||
          key === "dreamsignId" ||
          key === "newDreamsignName" ||
          key === "newDreamsignId" ||
          key === "targetDreamsignName" ||
          key === "targetDreamsignId" ||
          key === "resultDreamsignName" ||
          key === "resultDreamsignId" ||
          key === "giveDreamsignName" ||
          key === "giveDreamsignId" ||
          key === "receiveDreamsignName" ||
          key === "receiveDreamsignId"
        ) {
          references.dreamsigns.push(entry);
        } else if (key === "dreamcallerName" || key === "dreamcallerId") {
          references.dreamcallers.push(entry);
        } else if (key === "baneName" || key === "newBaneName") {
          references.banes.push(entry);
        } else if (
          key === "transfigurationName" ||
          key === "keyword" ||
          key === "fromSite" ||
          key === "toSite" ||
          key === "siteType" ||
          key === "statusScope" ||
          key === "generatedObjectKind" ||
          key === "generatedObjectReferenceKind"
        ) {
          references.rules.push(entry);
        }
      }

      visit(entry);
    }
  }

  visit(value);
  return references;
}

function validateCosts(option: JourneyOption, context: JourneyContext): ValidationResult {
  const costOperations = option.operations
    .map(immediateCostFromOperation)
    .filter((entry): entry is ImmediateCost => entry !== null);

  for (const immediateCost of costOperations) {
    if (!isImmediateCostPayable(context.state.quest, immediateCost)) {
      return fail("unpayable_immediate_cost", `Option ${option.number} has an unpayable immediate cost`);
    }
  }

  for (const entry of option.costs) {
    const immediateCost = asImmediateCost(entry);

    if (immediateCost && !isImmediateCostPayable(context.state.quest, immediateCost)) {
      return fail("unpayable_immediate_cost", `Option ${option.number} has an unpayable immediate cost`);
    }
  }

  return { ok: true };
}

function validateTargetSelector(
  selector: TargetSelector,
  context: JourneyContext,
  optionNumber: number,
  generatedObjects: readonly GeneratedObjectDefinition[] = [],
): ValidationResult {
  if (!("required" in selector) || selector.required !== true) {
    return { ok: true };
  }

  const resolution = resolveTargetSelector(context.content, context.state.quest, selector, generatedObjects);

  if (resolution.candidateCount === 0) {
    return fail(
      "zero_legal_required_targets",
      `Option ${optionNumber} has no legal ${selector.selectorKind} targets`,
      { targetResolution: resolution },
    );
  }

  return { ok: true };
}

const DECK_REQUIRED_CARD_OPERATION_KINDS = new Set([
  "card_purge",
  "card_duplicate",
  "card_transform",
  "card_replace",
  "card_transfigure",
  "card_text_modification",
  "card_type_change",
  "card_keyword_add",
  "card_keyword_remove",
  "card_opening_hand",
  "card_merge",
  "card_split",
  "card_temporary_copy",
  "card_delayed_transformation",
  "starter_cleanup",
  "starter_replacement",
]);

function isDeckRequiredNamedCardOperation(operation: JourneyOperation): boolean {
  if (operation.operationKind !== "reward") {
    return false;
  }

  return DECK_REQUIRED_CARD_OPERATION_KINDS.has(operation.rewardKind);
}

function validateNamedCardOperationTarget(
  operation: JourneyOperation,
  context: JourneyContext,
  optionNumber: number,
): ValidationResult {
  if (operation.operationKind !== "reward" || !isDeckRequiredNamedCardOperation(operation) || !operation.targetSelector) {
    return { ok: true };
  }

  const selector = operation.targetSelector;

  if (selector.selectorKind !== "card") {
    return { ok: true };
  }

  const deckSelector: Extract<TargetSelector, { selectorKind: "card" }> = {
    ...selector,
    source: "deck",
    predicate: {
      ...(typeof selector.predicate === "object" && selector.predicate !== null ? selector.predicate : {}),
      source: "deck",
    },
  };
  const resolution = resolveTargetSelector(context.content, context.state.quest, deckSelector);

  if (resolution.candidateCount === 0) {
    return fail(
      "named_card_target_unavailable",
      `Option ${optionNumber} ${operation.rewardKind} requires a named card in the simulated deck`,
      { targetResolution: resolution },
    );
  }

  return { ok: true };
}

function validateOperationTargetSelectors(
  operations: readonly JourneyOperation[] | undefined,
  context: JourneyContext,
  location: string,
  generatedObjects: readonly GeneratedObjectDefinition[] = [],
): ValidationResult {
  for (const [index, operation] of (operations ?? []).entries()) {
    if (!("targetSelector" in operation) || !operation.targetSelector) {
      continue;
    }

    const namedCardResult = validateNamedCardOperationTarget(operation, context, index + 1);

    if (!namedCardResult.ok) {
      return fail(namedCardResult.rule, `${location} operation ${index + 1}: ${namedCardResult.message}`, namedCardResult.debug);
    }

    if (
      operation.targetSelector.selectorKind === "bane" &&
      operation.targetSelector.source === "state"
    ) {
      const resolution = resolveTargetSelector(context.content, context.state.quest, operation.targetSelector);

      if (resolution.candidateCount === 0) {
        return fail(
          "bane_current_state_target_unavailable",
          `${location} operation ${index + 1}: Current-state Bane operations require tracked Banes in state`,
          { targetResolution: resolution },
        );
      }
    }

    const result = validateTargetSelector(operation.targetSelector, context, index + 1, generatedObjects);

    if (!result.ok) {
      return fail(result.rule, `${location} operation ${index + 1}: ${result.message}`, result.debug);
    }
  }

  return { ok: true };
}

function validateRequiredTarget(
  target: Record<string, unknown>,
  context: JourneyContext,
  optionNumber: number,
): ValidationResult {
  if (target.required !== true) {
    return { ok: true };
  }

  if (target.kind === "card") {
    const matches = resolveCardTargets(
      context.content,
      context.state.quest,
      (target.predicate ?? {}) as CardTargetPredicate,
    );

    if (matches.length === 0) {
      return fail(
        "zero_legal_required_targets",
        `Option ${optionNumber} has no legal card targets`,
        {
          targetResolution: resolveTargetSelector(context.content, context.state.quest, {
            selectorKind: "card",
            selection: "predicate",
            referenceKind: "content",
            ...((target.predicate as CardTargetPredicate | undefined)?.source
              ? { source: (target.predicate as CardTargetPredicate).source }
              : {}),
            predicate: target.predicate,
            required: true,
          }),
        },
      );
    }
  }

  if (target.kind === "dreamsign") {
    const matches = resolveDreamsignTargets(
      context.content,
      context.state.quest,
      (target.predicate ?? {}) as DreamsignTargetPredicate,
    );

    if (matches.length === 0) {
      return fail(
        "zero_legal_required_targets",
        `Option ${optionNumber} has no legal Dreamsign targets`,
        {
          targetResolution: resolveTargetSelector(context.content, context.state.quest, {
            selectorKind: "dreamsign",
            selection: "predicate",
            referenceKind: "content",
            ...((target.predicate as DreamsignTargetPredicate | undefined)?.source
              ? { source: (target.predicate as DreamsignTargetPredicate).source }
              : {}),
            predicate: target.predicate,
            required: true,
          }),
        },
      );
    }
  }

  return { ok: true };
}

function scanIllegalStructuredValue(value: unknown): ValidationResult {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const result = scanIllegalStructuredValue(entry);

      if (!result.ok) {
        return result;
      }
    }

    return { ok: true };
  }

  if (!isRecord(value)) {
    return { ok: true };
  }

  const kind = typeof value.kind === "string" ? value.kind : "";
  const type = typeof value.type === "string" ? value.type : "";

  if (
    value.custom === true ||
    kind.startsWith("custom_") ||
    type.startsWith("custom_") ||
    kind === "custom-card" ||
    kind === "custom-dreamsign"
  ) {
    return fail("custom_content", "Custom cards, Dreamsigns, and generated content are not legal");
  }

  if (kind === "status" || type === "status") {
    return fail("custom_status", "Custom statuses are not legal Journey output");
  }

  if (kind === "battlefield_mutation" || type === "battlefield_mutation") {
    return fail("custom_battlefield_mutation", "Battlefield mutations are not legal Journey output");
  }

  if (kind === "dreamcaller_ability_mutation" || type === "dreamcaller_ability_mutation") {
    return fail("custom_dreamcaller_mutation", "Dreamcaller ability mutations are not legal Journey output");
  }

  if (typeof value.transfigurationName === "string" && !STANDARD_TRANSFIGURATIONS.includes(value.transfigurationName as never)) {
    return fail("invalid_transfiguration", `Invalid transfiguration: ${value.transfigurationName}`);
  }

  if (typeof value.baneName === "string" && !isBaneName(value.baneName)) {
    return fail("invalid_bane_name", `Invalid Bane name: ${value.baneName}`);
  }

  if (typeof value.newBaneName === "string" && !isBaneName(value.newBaneName)) {
    return fail("invalid_bane_name", `Invalid Bane name: ${value.newBaneName}`);
  }

  if (
    typeof value.minimum === "number" &&
    typeof value.maximum === "number" &&
    value.minimum > value.maximum
  ) {
    return fail("invalid_resource_random_range", "Resource random range minimum cannot exceed maximum");
  }

  if (
    typeof value.percentage === "number" &&
    (value.percentage < 0 || value.percentage > 100)
  ) {
    return fail("invalid_resource_percentage", "Resource percentage must be between 0 and 100");
  }

  if (value.hidden === true && (value.important === true || value.importance === "important")) {
    return fail("hidden_important_outcome", "Important outcomes cannot be hidden");
  }

  for (const nested of Object.values(value)) {
    const result = scanIllegalStructuredValue(nested);

    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}

function dreamsignPredicateFromPayload(
  payload: Record<string, unknown>,
  fields: { id: string; name: string; source?: string },
): DreamsignTargetPredicate {
  const source = fields.source && (
    payload[fields.source] === "catalog" ||
    payload[fields.source] === "active" ||
    payload[fields.source] === "pool"
  )
    ? payload[fields.source] as DreamsignTargetPredicate["source"]
    : undefined;

  return {
    ...(source ? { source } : {}),
    ...(typeof payload[fields.id] === "string" ? { ids: [payload[fields.id] as string] } : {}),
    ...(typeof payload[fields.name] === "string" ? { names: [payload[fields.name] as string] } : {}),
  };
}

function resolveDreamsignPayloadField(
  payload: Record<string, unknown>,
  context: JourneyContext,
  fields: { id: string; name: string; source?: string },
) {
  const predicate = dreamsignPredicateFromPayload(payload, fields);

  return resolveDreamsignTargets(context.content, context.state.quest, predicate);
}

function validateDreamsignPayload(
  payload: Record<string, unknown>,
  context: JourneyContext,
  optionNumber: number,
): ValidationResult {
  const kind = typeof payload.kind === "string" ? payload.kind : "";

  if (!kind.startsWith("dreamsign_")) {
    return { ok: true };
  }

  const sourcePredicate = dreamsignPredicateFromPayload(payload, {
    id: "dreamsignId",
    name: "dreamsignName",
    source: "source",
  });
  const sourceMatches = sourcePredicate.ids || sourcePredicate.names
    ? resolveDreamsignTargets(context.content, context.state.quest, sourcePredicate)
    : [];

  if (
    [
      "dreamsign_purchase",
      "dreamsign_gain",
      "dreamsign_loss",
      "dreamsign_purge",
      "dreamsign_duplicate",
      "dreamsign_copy_gain",
      "dreamsign_temporary_grant",
      "dreamsign_transform",
      "dreamsign_pool_edit",
      "dreamsign_trigger_counter",
      "dreamsign_random_reward",
      "dreamsign_trade_hook",
    ].includes(kind) &&
    sourceMatches.length === 0
  ) {
    return fail("dreamsign_target_unavailable", `Option ${optionNumber} ${kind} requires a resolvable Dreamsign target`);
  }

  if (kind === "dreamsign_transform") {
    const resultPredicate = dreamsignPredicateFromPayload(payload, {
      id: "newDreamsignId",
      name: "newDreamsignName",
      source: "resultSource",
    });
    const resultMatches = resolveDreamsignTargets(context.content, context.state.quest, resultPredicate);

    if (resultMatches.length === 0) {
      return fail("dreamsign_transform_destination_unavailable", `Option ${optionNumber} Dreamsign transformation requires a resolvable destination`);
    }

    if (sourceMatches[0]?.id === resultMatches[0]?.id) {
      return fail("dreamsign_transform_same_target", `Option ${optionNumber} Dreamsign transformation requires distinct source and destination`);
    }
  }

  if (
    (kind === "dreamsign_duplicate" || kind === "dreamsign_copy_gain") &&
    (typeof payload.copyCount !== "number" || payload.copyCount < 1)
  ) {
    return fail("dreamsign_copy_count_invalid", `Option ${optionNumber} Dreamsign copy operation requires a positive copy count`);
  }

  if (
    kind === "dreamsign_temporary_grant" &&
    (typeof payload.duration !== "string" || payload.duration.length === 0)
  ) {
    return fail("dreamsign_temporary_duration_missing", `Option ${optionNumber} temporary Dreamsign grant requires a duration`);
  }

  if (kind === "dreamsign_pool_edit") {
    const operation = typeof payload.poolOperation === "string" ? payload.poolOperation : "";
    const resultPredicate = dreamsignPredicateFromPayload(payload, {
      id: "resultDreamsignId",
      name: "resultDreamsignName",
      source: "resultSource",
    });
    const resultMatches = resolveDreamsignTargets(context.content, context.state.quest, resultPredicate);

    if (!["add", "remove", "replace"].includes(operation)) {
      return fail("dreamsign_pool_edit_operation_invalid", `Option ${optionNumber} Dreamsign pool edit requires add, remove, or replace`);
    }

    if (resultMatches.length === 0) {
      return fail("dreamsign_pool_edit_target_unavailable", `Option ${optionNumber} Dreamsign pool edit requires a resolvable result`);
    }
  }

  if (
    kind === "dreamsign_trigger_counter" &&
    (typeof payload.trigger !== "string" || typeof payload.count !== "number" || payload.count < 1)
  ) {
    return fail("dreamsign_trigger_counter_invalid", `Option ${optionNumber} Dreamsign trigger counter requires a trigger and positive count`);
  }

  if (
    kind === "dreamsign_random_reward" &&
    (!Array.isArray(payload.rewardPoolDreamsignIds) || payload.rewardPoolDreamsignIds.length === 0)
  ) {
    return fail("dreamsign_random_reward_pool_missing", `Option ${optionNumber} random Dreamsign reward requires a source pool`);
  }

  if (kind === "dreamsign_random_reward") {
    const rewardPoolDreamsignIds = payload.rewardPoolDreamsignIds as unknown[];

    if (
      !rewardPoolDreamsignIds.every((entry) =>
        typeof entry === "string" &&
        resolveDreamsignTargets(context.content, context.state.quest, {
          source: "pool",
          ids: [entry],
        }).length > 0
      )
    ) {
      return fail("dreamsign_random_reward_pool_unavailable", `Option ${optionNumber} random Dreamsign reward source pool must contain resolvable pool Dreamsigns`);
    }
  }

  if (
    kind === "dreamsign_trade_hook" &&
    (typeof payload.obligation !== "string" ||
      typeof payload.giveDreamsignName !== "string" ||
      typeof payload.receiveDreamsignName !== "string")
  ) {
    return fail("dreamsign_trade_hook_obligation_missing", `Option ${optionNumber} Dreamsign trade hook requires explicit give and receive obligations`);
  }

  if (kind === "dreamsign_trade_hook") {
    const giveMatches = resolveDreamsignPayloadField(payload, context, {
      id: "giveDreamsignId",
      name: "giveDreamsignName",
      source: "source",
    });
    const receiveMatches = resolveDreamsignPayloadField(payload, context, {
      id: "receiveDreamsignId",
      name: "receiveDreamsignName",
      source: "resultSource",
    });
    const resultMatches = resolveDreamsignPayloadField(payload, context, {
      id: "resultDreamsignId",
      name: "resultDreamsignName",
      source: "resultSource",
    });

    if (giveMatches.length === 0) {
      return fail("dreamsign_trade_hook_give_unavailable", `Option ${optionNumber} Dreamsign trade hook requires a resolvable give Dreamsign`);
    }

    if (receiveMatches.length === 0 || resultMatches.length === 0) {
      return fail("dreamsign_trade_hook_receive_unavailable", `Option ${optionNumber} Dreamsign trade hook requires a resolvable receive Dreamsign`);
    }
  }

  return { ok: true };
}

function validateNormalOutputText(text: string): ValidationResult {
  if (text.includes("Shape:") || /^Shape:/u.test(text.trim())) {
    return fail("normal_output_shape_line", "Normal Journey text cannot require a top-level Shape line");
  }

  if (referencesTides(text)) {
    return fail("normal_output_tide_reference", "Normal Journey ability text cannot mention tides");
  }

  if (requiresNarrativeName(text)) {
    return fail("normal_output_narrative_name", "Normal Journey text cannot require narrative Journey names or invented event names");
  }

  return { ok: true };
}

function validateOption(
  option: JourneyOption,
  context: JourneyContext,
  generatedObjects: readonly GeneratedObjectDefinition[] = [],
): ValidationResult {
  const textResult = validateNormalOutputText(option.text);

  if (!textResult.ok) {
    return textResult;
  }

  const costResult = validateCosts(option, context);

  if (!costResult.ok) {
    return costResult;
  }

  for (const target of option.targets) {
    if (!isRecord(target)) {
      continue;
    }

    const result = validateRequiredTarget(target, context, option.number);

    if (!result.ok) {
      return result;
    }
  }

  for (const operation of option.operations) {
    if (!("targetSelector" in operation) || !operation.targetSelector) {
      continue;
    }

    const namedCardResult = validateNamedCardOperationTarget(operation, context, option.number);

    if (!namedCardResult.ok) {
      return namedCardResult;
    }

    if (
      operation.targetSelector.selectorKind === "bane" &&
      operation.targetSelector.source === "state"
    ) {
      const resolution = resolveTargetSelector(context.content, context.state.quest, operation.targetSelector);

      if (resolution.candidateCount === 0) {
        return fail(
          "bane_current_state_target_unavailable",
          `Option ${option.number} has no tracked current-state Bane targets`,
          { targetResolution: resolution },
        );
      }
    }

    const result = validateTargetSelector(operation.targetSelector, context, option.number, generatedObjects);

    if (!result.ok) {
      return result;
    }
  }

  const structuredResult = scanIllegalStructuredValue([
    option.costs,
    option.effects,
    option.burdens,
    option.targets,
    option.triggers,
    option.routeEffects,
  ]);

  if (!structuredResult.ok) {
    return structuredResult;
  }

  if (
    option.effects.some((effect) => isRecord(effect) && effect.kind === "dreamsign_loss") &&
    context.state.quest.activeDreamsigns.length === 0
  ) {
    const hasResolvableNonActiveLoss = option.effects.some((effect) =>
      isRecord(effect) &&
      effect.kind === "dreamsign_loss" &&
      effect.source !== "active" &&
      resolveDreamsignTargets(
        context.content,
        context.state.quest,
        dreamsignPredicateFromPayload(effect, {
          id: "dreamsignId",
          name: "dreamsignName",
          source: "source",
        }),
      ).length > 0
    );

    if (!hasResolvableNonActiveLoss) {
      return fail("dreamsign_loss_without_dreamsign", "Dreamsign loss requires an active or explicitly targeted Dreamsign");
    }
  }

  for (const effect of option.effects) {
    if (isRecord(effect)) {
      const result = validateDreamsignPayload(effect, context, option.number);

      if (!result.ok) {
        return result;
      }
    }
  }

  if (
    option.effects.some((effect) => isRecord(effect) && effect.kind === "starter_cleanup") &&
    context.state.quest.deck.summary.starterCards === 0
  ) {
    return fail("starter_cleanup_without_starters", "Starter cleanup requires Starter cards");
  }

  if (option.effects.some(isBaneCurrentStateRequirement)) {
    return fail("bane_current_state_target_unavailable", "Current-state Bane operations require tracked Banes in state");
  }

  if (option.operations.some((operation) =>
    operation.targetSelector?.selectorKind === "bane" &&
    operation.targetSelector.source === "state" &&
    operation.targetResolution?.candidateCount === 0
  )) {
    return fail("bane_current_state_target_unavailable", "Current-state Bane operations require tracked Banes in state");
  }

  if (
    option.netConvertedEssence > 0 &&
    option.routeEffects.some((routeEffect) => {
      if (!isRecord(routeEffect) || typeof routeEffect.kind !== "string") {
        return false;
      }

      return !("routeOperationKind" in routeEffect) &&
        (routeEffect.kind.includes("addition") || routeEffect.kind.includes("add"));
    })
  ) {
    return fail("route_addition_standalone_positive_reward", "Route addition cannot be a standalone positive reward");
  }

  return { ok: true };
}

function validateTreeBranch(
  branch: NonNullable<JourneyManifest["tree"]>["nodes"][number]["branches"][number],
  context: JourneyContext,
  generatedObjects: readonly GeneratedObjectDefinition[] = [],
): ValidationResult {
  const textResult = validateNormalOutputText(branch.text);

  if (!textResult.ok) {
    return textResult;
  }

  const costResult = validateCosts(
    {
      number: 0,
      symbols: [],
      text: branch.text,
      operations: branch.operations,
      costs: branch.costs,
      effects: branch.effects,
      burdens: branch.burdens,
      targets: branch.targets,
      triggers: branch.triggers,
      routeEffects: branch.routeEffects,
      costConvertedEssence: branch.costConvertedEssence,
      effectConvertedEssence: branch.effectConvertedEssence,
      burdenConvertedEssence: branch.burdenConvertedEssence,
      uncertaintyConvertedEssence: branch.uncertaintyConvertedEssence,
      netConvertedEssence: branch.netConvertedEssence,
      pickBehavior: "record_and_generate_next",
    },
    context,
  );

  if (!costResult.ok) {
    return costResult;
  }

  for (const target of branch.targets) {
    if (!isRecord(target)) {
      continue;
    }

    const result = validateRequiredTarget(target, context, 0);

    if (!result.ok) {
      return result;
    }
  }

  const branchSelectorResult = validateOperationTargetSelectors(
    branch.operations,
    context,
    `Tree branch ${branch.id}`,
    generatedObjects,
  );

  if (!branchSelectorResult.ok) {
    return branchSelectorResult;
  }

  if (branch.terminal) {
    const terminalSelectorResult = validateOperationTargetSelectors(
      branch.terminal.operations,
      context,
      `Tree branch ${branch.id} terminal`,
      generatedObjects,
    );

    if (!terminalSelectorResult.ok) {
      return terminalSelectorResult;
    }
  }

  return scanIllegalStructuredValue([
    branch.costs,
    branch.effects,
    branch.burdens,
    branch.targets,
    branch.triggers,
    branch.routeEffects,
    branch.terminal,
  ]);
}

function validateProbabilityLadder(manifest: JourneyManifest): ValidationResult {
  const successBranches = manifest.tree?.nodes.flatMap((node) =>
    node.branches.filter((branch) => branch.label === "Success")
  ) ?? [];

  if (successBranches.length === 0) {
    return fail("probability_ladder_missing_success", "Probability ladders require visible success outcomes");
  }

  for (const branch of successBranches) {
    if (branch.nextNodeId || !branch.terminal) {
      return fail("fixed_reward_can_be_won_once", "Probability ladder success must end the Journey");
    }

    if (branch.effects.length === 0) {
      return fail("fixed_reward_can_be_won_once", "Probability ladder success must award the fixed reward");
    }
  }

  return { ok: true };
}

function validateDecisionTree(
  manifest: JourneyManifest,
  context: JourneyContext,
  generatedObjects: readonly GeneratedObjectDefinition[] = [],
): ValidationResult {
  if (!manifest.tree) {
    return fail("missing_decision_tree", "True sequential shapes require complete tree data");
  }

  if (manifest.tree.nodes.length === 0) {
    return fail("missing_tree_levels", "Decision trees require at least one level");
  }

  const nodeIds = new Set(manifest.tree.nodes.map((node) => node.id));

  if (!nodeIds.has(manifest.tree.rootNodeId)) {
    return fail("invalid_tree_root", "Decision tree root must reference an existing node");
  }

  for (const node of manifest.tree.nodes) {
    const hasRandomOutcomes = node.branches.some((branch) => branch.kind === "random_chance");

    if (node.description) {
      const descriptionResult = validateNormalOutputText(node.description);

      if (!descriptionResult.ok) {
        return descriptionResult;
      }
    }

    if (node.branches.length === 0) {
      return fail("missing_tree_branches", `${node.id} must have outgoing branches`);
    }

    if (!node.branches.some((branch) => branch.terminal || branch.nextNodeId)) {
      return fail("missing_terminal_outcome", `${node.id} has no visible terminal or transition`);
    }

    for (const branch of node.branches) {
      if (!branch.text || !branch.label) {
        return fail("invalid_tree_branch", `${node.id} has an unlabeled branch`);
      }

      if (branch.kind === "random_chance" && !branch.odds) {
        return fail("missing_random_odds", `${branch.id} must expose odds`);
      }

      if (branch.nextNodeId && !nodeIds.has(branch.nextNodeId)) {
        return fail("invalid_tree_transition", `${branch.id} points to a missing node`);
      }

      if (!branch.nextNodeId && !branch.terminal && !(branch.kind === "player_choice" && branch.odds && hasRandomOutcomes)) {
        return fail("missing_terminal_outcome", `${branch.id} must end or transition`);
      }

      const result = validateTreeBranch(branch, context, generatedObjects);

      if (!result.ok) {
        return result;
      }
    }
  }

  if (
    manifest.shapeId === "push_your_luck" &&
    !manifest.tree.nodes.every((node) =>
      node.branches.some((branch) =>
        branch.label === "Failure" &&
        branch.terminal?.outcome === "failure" &&
        !branch.nextNodeId,
      ),
    )
  ) {
    return fail("push_failure_must_end", "Push-your-luck failures must end the Journey");
  }

  if (
    manifest.shapeId === "random_pool_draws" &&
    !manifest.rewardPool?.summary.includes("replacement")
  ) {
    return fail("missing_pool_replacement_policy", "Random pool draws must state the replacement policy");
  }

  if (manifest.shapeId === "probability_ladder") {
    const probabilityResult = validateProbabilityLadder(manifest);

    if (!probabilityResult.ok) {
      return probabilityResult;
    }
  }

  return { ok: true };
}

function validateChooseYourLossValues(nets: readonly number[]): ValidationResult {
  if (nets.some((net) => net >= 0)) {
    return fail("invalid_positive_negative_framing", "choose_your_loss options must be negative outcomes");
  }

  const magnitudes = nets
    .map((net) => Math.abs(net))
    .sort((left, right) => left - right);
  const lowest = magnitudes[0] ?? 0;
  const highest = magnitudes[magnitudes.length - 1] ?? 0;

  if (lowest < LOSS_CHOICE_VALUE_CONSTANTS.minimumComparableMagnitude) {
    return fail("loss_not_comparable", "choose_your_loss options must use meaningful loss magnitudes");
  }

  if (highest / lowest > LOSS_CHOICE_VALUE_CONSTANTS.maximumComparableRatio) {
    return fail("loss_not_comparable", "choose_your_loss options must be comparable damage-control choices");
  }

  return { ok: true };
}

function validateCommitNowFuturePayoffValues(nets: readonly number[]): ValidationResult {
  if (nets.length !== 3 || nets.some((net) => net <= 0)) {
    return fail(
      "option_values_are_comparable_for_shape",
      "commit_now_future_payoff options must all be positive commitments",
    );
  }

  const lowest = Math.min(...nets);
  const highest = Math.max(...nets);

  if (highest - lowest > 75) {
    return fail(
      "option_values_are_comparable_for_shape",
      "commit_now_future_payoff options must be comparable future-payoff choices",
    );
  }

  return { ok: true };
}

const POSITIVE_MENU_COMPARABLE_SHAPES = new Set<JourneyManifest["shapeId"]>([
  "random_allocation",
  "same_cost_different_rewards",
  "service_menu",
  "curated_reward_trio",
  "heterogeneous_pair",
  "one_target_many_operations",
  "mirrored_operations",
  "one_operation_many_targets",
  "single_reward",
  "timed_window_menu",
  "single_random_outcome",
]);

function validatePositiveMenuValues(
  shapeId: JourneyManifest["shapeId"],
  nets: readonly number[],
): ValidationResult {
  if (!POSITIVE_MENU_COMPARABLE_SHAPES.has(shapeId)) {
    return { ok: true };
  }

  const positiveNets = nets.filter((net) => net > 0);

  if (positiveNets.length < 2) {
    return { ok: true };
  }

  const lowest = Math.min(...positiveNets);
  const highest = Math.max(...positiveNets);
  const minimumComparableValue = Math.max(
    highest - POSITIVE_MENU_VALUE_CONSTANTS.maximumComparableSpread,
    highest * POSITIVE_MENU_VALUE_CONSTANTS.minimumComparableRatio,
  );

  if (lowest < minimumComparableValue) {
    return fail(
      "option_values_are_comparable_for_shape",
      `${shapeId} positive options must stay in comparable value bands`,
    );
  }

  return { ok: true };
}

function validateTimedWindowMenu(manifest: JourneyManifest): ValidationResult {
  for (const option of manifest.options.filter((entry) => entry.pickBehavior !== "leave")) {
    const records = [
      ...option.effects.filter(isRecord),
      ...option.operations.map((operation) => operation.payload),
    ];
    const hasBattleWindow = records.some((record) =>
      typeof record.duration === "string" &&
      /^next [2-9]\d* battles$/u.test(record.duration)
    );

    if (!hasBattleWindow) {
      return fail(
        "timed_window_requires_battle_window",
        "Timed window options must use a meaningful multi-battle duration",
      );
    }

    if (records.some((record) => record.kind === "gain_omens" || record.kind === "gain_essence")) {
      return fail(
        "timed_window_resource_only_reward",
        "Timed window options must alter battle play rather than grant plain resources",
      );
    }

    if (option.netConvertedEssence < 120) {
      return fail(
        "timed_window_low_impact",
        "Timed window options must be impactful enough to define upcoming battles",
      );
    }
  }

  return { ok: true };
}

function looksLikeInventedTitle(prefix: string): boolean {
  const words = prefix.trim().split(/\s+/u);

  if (words.length < 2) {
    return false;
  }

  return words.every((word) =>
    /^(?:A|An|And|At|In|Of|On|The|To)$/u.test(word) ||
    /^[A-Z][a-z]+$/u.test(word),
  );
}

function requiresNarrativeName(text: string): boolean {
  const trimmed = text.trim();

  if (/^(?:Journey|Event)(?:\s+name)?\s*:/iu.test(trimmed)) {
    return true;
  }

  if (/\b(?:Journey|Event)\s+(?:named|called)\s+["']?[A-Z][a-z]+/u.test(trimmed)) {
    return true;
  }

  const titlePrefix = trimmed.match(/^([^:.!?]{2,80}):\s+\S/u);

  return titlePrefix !== null &&
    titlePrefix[1] !== "Take" &&
    looksLikeInventedTitle(titlePrefix[1] ?? "");
}

function referencesTides(text: string): boolean {
  return /(?:selected-tide|\btidal\b|\btides?\b)/iu.test(text);
}

function validateOptionShape(option: unknown, index: number): ValidationResult {
  if (!isRecord(option) || typeof option.text !== "string") {
    return fail("invalid_option", `Option ${index + 1} must be a complete Journey option`);
  }

  return { ok: true };
}

function hasPrecommitted(precommitted: unknown[] | Record<string, unknown> | undefined): boolean {
  if (Array.isArray(precommitted)) {
    return precommitted.length > 0;
  }

  return isRecord(precommitted) && Object.keys(precommitted).length > 0;
}

function sequenceMenuKey(step: number): string {
  return `step${step}`;
}

function containsRecordWhere(value: unknown, predicate: (record: Record<string, unknown>) => boolean): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => containsRecordWhere(entry, predicate));
  }

  if (!isRecord(value)) {
    return false;
  }

  if (predicate(value)) {
    return true;
  }

  return Object.values(value).some((entry) => containsRecordWhere(entry, predicate));
}

function optionImpliesRandomOrHiddenOutcome(option: JourneyOption): boolean {
  if (option.operations.some((operation) =>
    operation.operationKind === "random_envelope" ||
    operation.operationKind === "reveal_envelope" ||
    operation.role === "random" ||
    operation.visibility === "precommitted"
  )) {
    return true;
  }

  return containsRecordWhere([
    option.costs,
    option.effects,
    option.burdens,
    option.targets,
    option.triggers,
  ], (record) => {
    const kind = typeof record.kind === "string" ? record.kind : "";
    const type = typeof record.type === "string" ? record.type : "";

    return kind.includes("random") || type.includes("random") || record.hidden === true;
  });
}

function optionImpliesDelayedOutcome(option: JourneyOption): boolean {
  if (option.operations.some((operation) =>
    operation.role === "delayed_hook" ||
    operation.role === "trigger" ||
    operation.operationKind === "delayed_hook"
  )) {
    return true;
  }

  return option.triggers.length > 0 ||
    containsRecordWhere([option.effects, option.triggers], (record) => {
      const timing = typeof record.timing === "string" ? record.timing : "";
      const trigger = typeof record.trigger === "string" ? record.trigger : "";

      return timing.includes("next") || trigger.length > 0;
    });
}

function hookBudgetCostFromPayload(value: unknown): number {
  if (!isRecord(value)) {
    return 0;
  }

  if (typeof value.hookBudgetCost === "number" && value.hookBudgetCost > 0) {
    return value.hookBudgetCost;
  }

  return typeof value.hook === "string" && value.hook.length > 0 ? 1 : 0;
}

function manifestHookBudgetCost(manifest: JourneyManifest): number {
  const rootPayloads: unknown[] = manifest.options.flatMap((option) => [
    ...option.effects,
    ...option.burdens,
    ...option.triggers,
  ]);
  const treePayloads: unknown[] = manifest.tree?.nodes.flatMap((node) =>
    node.branches.flatMap((branch) => [
      ...branch.effects,
      ...branch.burdens,
      ...branch.triggers,
      ...(branch.terminal?.effects ?? []),
      ...(branch.terminal?.burdens ?? []),
    ])
  ) ?? [];

  return [...rootPayloads, ...treePayloads].reduce<number>(
    (sum, payload) => sum + hookBudgetCostFromPayload(payload),
    0,
  );
}

function routeEffectNeedsTiming(routeEffect: unknown): boolean {
  if (!isRecord(routeEffect) || typeof routeEffect.kind !== "string") {
    return false;
  }

  return routeEffect.kind.includes("future") || routeEffect.kind.includes("next");
}

function validateRouteEffects(routeEffects: readonly unknown[]): ValidationResult {
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

function hasOdds(value: unknown): boolean {
  return isRecord(value) &&
    isRecord(value.odds) &&
    typeof value.odds.percent === "number" &&
    value.odds.percent > 0 &&
    value.odds.percent < 100;
}

function validateRandomOdds(value: unknown): ValidationResult {
  if (!isRecord(value)) {
    return fail("invalid_random_odds", "Random odds must be structured");
  }

  if (
    !isRecord(value.odds) ||
    typeof value.odds.numerator !== "number" ||
    typeof value.odds.denominator !== "number" ||
    typeof value.odds.percent !== "number" ||
    value.odds.denominator <= 0 ||
    value.odds.numerator <= 0 ||
    value.odds.numerator >= value.odds.denominator ||
    value.odds.percent <= 0 ||
    value.odds.percent >= 100
  ) {
    return fail("invalid_random_odds", "Random odds require positive bounded numerator, denominator, and percent");
  }

  return { ok: true };
}

function validateRandomVisibilityPolicy(value: unknown): ValidationResult {
  if (!isRecord(value)) {
    return fail("hidden_outcome_disclosure", "Random envelopes require an explicit visibility policy");
  }

  if (
    value.outcomeVisibility !== "visible" &&
    value.outcomeVisibility !== "hidden_until_resolution" &&
    value.outcomeVisibility !== "delayed" &&
    value.outcomeVisibility !== "pre_rolled" &&
    value.outcomeVisibility !== "resolved" &&
    value.outcomeVisibility !== "debug_only"
  ) {
    return fail("invalid_random_visibility", "Random visibility must be visible, hidden, delayed, pre-rolled, resolved, or debug-only");
  }

  if (typeof value.disclosure !== "string" || value.disclosure.length === 0) {
    return fail("hidden_outcome_disclosure", "Hidden or delayed random outcomes require disclosure text");
  }

  if (typeof value.playerVisible !== "boolean") {
    return fail("invalid_random_visibility", "Random visibility policy must state whether the outcome is player-visible");
  }

  return { ok: true };
}

function validateRandomPool(value: Record<string, unknown>): ValidationResult {
  const rewards = value.rewards;

  if (!Array.isArray(rewards) || rewards.length === 0) {
    return fail("empty_random_pool", "Random pool envelopes require at least one reward");
  }

  if (
    value.replacement !== undefined &&
    value.replacement !== "with_replacement" &&
    value.replacement !== "without_replacement" &&
    value.replacement !== "precommitted_order"
  ) {
    return fail("invalid_random_replacement_policy", "Random pool replacement policy must be with, without, or precommitted order");
  }

  return { ok: true };
}

function validateRevealEnvelope(value: Record<string, unknown>): ValidationResult {
  const poolResult = validateRandomPool(value);
  if (!poolResult.ok) {
    return poolResult;
  }

  if (
    typeof value.revealCount !== "number" ||
    value.revealCount < 1 ||
    !Array.isArray(value.rewards) ||
    value.revealCount > value.rewards.length
  ) {
    return fail("incoherent_reveal_count", "Reveal envelopes require a reveal count within the reward pool size");
  }

  return { ok: true };
}

function validateRandomRangeEnvelope(value: Record<string, unknown>): ValidationResult {
  if (
    typeof value.minimum !== "number" ||
    typeof value.maximum !== "number" ||
    value.minimum > value.maximum
  ) {
    return fail("incoherent_random_range_bounds", "Random ranges require minimum <= maximum");
  }

  if (
    typeof value.committedAmount !== "number" ||
    value.committedAmount < value.minimum ||
    value.committedAmount > value.maximum
  ) {
    return fail("incoherent_random_range_bounds", "Committed random range amount must fall within bounds");
  }

  return { ok: true };
}

function validateRandomEnvelopePayload(value: unknown): ValidationResult {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return fail("invalid_random_envelope", "Random precommits require a structured kind");
  }

  const kind = value.kind;
  const typedKinds = new Set([
    "visible_pool",
    "random_cost",
    "random_reward",
    "chance_to_gain_bane",
    "chance_to_pay_cost",
    "reveal_rewards",
    "choose_one_revealed_reward",
    "choose_one_random_revealed_reward",
    "gain_one_random_reward",
    "roll_twice_keep_one",
    "repeated_pool_draws",
    "random_range",
    "wager",
    "probability_ladder",
    "push_choice",
    "resolved_random_series",
  ]);

  if (!typedKinds.has(kind)) {
    return { ok: true };
  }

  const visibilityResult = validateRandomVisibilityPolicy(value.visibilityPolicy);
  if (!visibilityResult.ok) {
    return visibilityResult;
  }

  if (value.odds !== undefined) {
    const oddsResult = validateRandomOdds(value);
    if (!oddsResult.ok) {
      return oddsResult;
    }
  }

  if (
    kind === "visible_pool" ||
    kind === "gain_one_random_reward" ||
    kind === "repeated_pool_draws"
  ) {
    const poolResult = validateRandomPool(value);
    if (!poolResult.ok) {
      return poolResult;
    }
  }

  if (
    kind === "reveal_rewards" ||
    kind === "choose_one_revealed_reward" ||
    kind === "choose_one_random_revealed_reward"
  ) {
    const revealResult = validateRevealEnvelope(value);
    if (!revealResult.ok) {
      return revealResult;
    }
  }

  if (kind === "random_range") {
    const rangeResult = validateRandomRangeEnvelope(value);
    if (!rangeResult.ok) {
      return rangeResult;
    }
  }

  if (
    kind === "chance_to_gain_bane" ||
    kind === "chance_to_pay_cost" ||
    kind === "random_cost" ||
    kind === "wager" ||
    kind === "push_choice"
  ) {
    const oddsResult = validateRandomOdds(value);
    if (!oddsResult.ok) {
      return oddsResult;
    }
  }

  if (kind === "roll_twice_keep_one") {
    if (
      !Array.isArray(value.rolls) ||
      value.rolls.length !== 2 ||
      !value.rolls.every((roll) => typeof roll === "number") ||
      typeof value.keptRoll !== "number"
    ) {
      return fail("invalid_roll_twice_payload", "Roll-twice envelopes require two rolls and one kept roll");
    }

    if (!value.rolls.includes(value.keptRoll)) {
      return fail("invalid_roll_twice_payload", "Roll-twice kept roll must be one of the committed rolls");
    }
  }

  if (kind === "resolved_random_series" && (!Array.isArray(value.series) || value.series.length === 0)) {
    return fail("empty_random_pool", "Resolved random series requires at least one committed outcome");
  }

  return { ok: true };
}

function textSignalsDownsideEnvelope(text: string): boolean {
  const hasPercentChance =
    /\b\d+%\s+chance\b/iu.test(text) ||
    /\b(?:chance|risk)\b.*\b\d+%\b/iu.test(text) ||
    /\b\d+%\b.*\b(?:chance|risk)\b/iu.test(text);
  const hasSafeAlternative = /\botherwise\b|\bno downside\b|\bsafe\b|\bnothing\b/iu.test(text);

  return hasPercentChance && hasSafeAlternative;
}

function validateRiskOrSkip(manifest: JourneyManifest): ValidationResult {
  const acceptOptions = manifest.options.filter((option) => option.pickBehavior !== "leave");

  if (acceptOptions.length !== 1 || manifest.options.length - acceptOptions.length !== 1) {
    return fail(
      "one_take_option_and_one_refusal_option",
      "Risk-or-skip requires one accept option and one leave option",
    );
  }

  const acceptOption = acceptOptions[0]!;

  if (acceptOption.effects.length === 0 || acceptOption.effectConvertedEssence <= 0) {
    return fail(
      "accept_option_has_guaranteed_reward",
      "Risk-or-skip accept option requires a guaranteed reward",
    );
  }

  if (
    acceptOption.costs.length > 0 ||
    acceptOption.burdens.length > 0 ||
    acceptOption.costConvertedEssence > 0 ||
    acceptOption.burdenConvertedEssence < 0
  ) {
    return fail(
      "downside_is_random_inside_visible_envelope",
      "Risk-or-skip costs and burdens must be random outcomes, not guaranteed accept-option payloads",
    );
  }

  if (acceptOption.uncertaintyConvertedEssence >= 0 || !textSignalsDownsideEnvelope(acceptOption.text)) {
    return fail(
      "downside_is_random_inside_visible_envelope",
      "Risk-or-skip accept option must show bounded downside odds and a safe alternative",
    );
  }

  if (!hasPrecommitted(manifest.precommitted.random)) {
    return fail("missing_precommitted_outcomes", "Random shapes require precommitted outcomes");
  }

  const downsideRolls = manifest.precommitted.random?.filter((entry) =>
    isRecord(entry) && entry.kind === "risk_downside_roll"
  ) ?? [];

  if (downsideRolls.length < acceptOptions.length) {
    return fail(
      "downside_is_random_inside_visible_envelope",
      "Risk-or-skip precommit must store one downside roll per accept option",
    );
  }

  for (const roll of downsideRolls) {
    if (
      !isRecord(roll) ||
      !hasOdds(roll) ||
      !("downside" in roll) ||
      !("safe" in roll) ||
      (roll.committedResult !== "downside" && roll.committedResult !== "safe")
    ) {
      return fail(
        "downside_is_random_inside_visible_envelope",
        "Risk-or-skip precommit must store odds, downside and safe outcomes, and the committed roll",
      );
    }
  }

  return { ok: true };
}

function validateSingleWager(manifest: JourneyManifest): ValidationResult {
  const wagerOptions = manifest.options.filter((option) => option.pickBehavior !== "leave");

  for (const option of wagerOptions) {
    if (option.costs.length === 0) {
      return fail("known_stake_is_visible_before_commit", "Single wager requires a visible stake");
    }

    if (!/\b\d+%\s+chance\b/iu.test(option.text) || !/\botherwise\b|\bnothing\b|\bfail/iu.test(option.text)) {
      return fail(
        "reward_outcome_is_bounded_random_envelope",
        "Single wager must show odds and the failure outcome before commitment",
      );
    }
  }

  const wagers = manifest.precommitted.random?.filter((entry) =>
    isRecord(entry) && entry.kind === "wager_roll"
  ) ?? [];

  if (wagers.length < wagerOptions.length) {
    return fail(
      "reward_outcome_is_bounded_random_envelope",
      "Single wager precommit must store one committed roll per wager option",
    );
  }

  for (const wager of wagers) {
    if (
      !isRecord(wager) ||
      !hasOdds(wager) ||
      !("success" in wager) ||
      !("failure" in wager) ||
      typeof wager.committedResult !== "string"
    ) {
      return fail(
        "reward_outcome_is_bounded_random_envelope",
        "Single wager precommit must store odds, success and failure outcomes, and the committed roll",
      );
    }
  }

  return { ok: true };
}

function validateSequenceMenu(
  menu: unknown,
  context: JourneyContext,
  path: string,
  maxSteps: number | undefined,
  shapeId: JourneyManifest["shapeId"],
  generatedObjects: readonly GeneratedObjectDefinition[] = [],
): ValidationResult {
  if (!Array.isArray(menu) || menu.length === 0) {
    return fail("invalid_sequence_menu", `${path} must be a non-empty JourneyOption[]`);
  }

  const stepMatch = path.match(/step(\d+)$/u);
  const step = stepMatch ? Number.parseInt(stepMatch[1]!, 10) : undefined;

  for (const [index, option] of menu.entries()) {
    const optionShapeResult = validateOptionShape(option, index);

    if (!optionShapeResult.ok) {
      return optionShapeResult;
    }

    const result = validateOption(option, context, generatedObjects);

    if (!result.ok) {
      return result;
    }
  }

  if (!menu.some((entry) =>
    isRecord(entry) &&
    (entry.pickBehavior === "complete_sequence" || entry.pickBehavior === "leave")
  )) {
    return fail("missing_sequence_terminal_option", `${path} must include a completion or leave option`);
  }

  if (
    menu.some((entry) =>
      isRecord(entry) &&
      (entry.pickBehavior === "complete_sequence" || entry.pickBehavior === "leave") &&
      typeof entry.text === "string" &&
      /(?:no effect|refuse|strategic refusal)/iu.test(entry.text)
    )
  ) {
    return fail("fake_sequence_leave", `${path} has a fake sequence stop or leave option`);
  }

  if (
    step !== undefined &&
    maxSteps !== undefined &&
    step >= maxSteps &&
    menu.some((entry) => isRecord(entry) && entry.pickBehavior === "advance_sequence")
  ) {
    return fail("sequence_advances_past_cap", `${path} cannot advance past maxSteps`);
  }

  if (shapeId === "take_any_number") {
    for (const entry of menu) {
      if (
        !isRecord(entry) ||
        typeof entry.text !== "string" ||
        !/^take\b/iu.test(entry.text)
      ) {
        continue;
      }

      const hasLimitingStructure =
        (Array.isArray(entry.costs) && entry.costs.length > 0) ||
        (Array.isArray(entry.burdens) && entry.burdens.length > 0) ||
        (typeof entry.uncertaintyConvertedEssence === "number" &&
          entry.uncertaintyConvertedEssence < 0);

      if (!hasLimitingStructure) {
        return fail(
          "open_pick_without_limiting_structure",
          `${path} has a take option without a cost, burden, or risk`,
        );
      }
    }
  }

  return { ok: true };
}

function validateSequenceMenus(
  manifest: JourneyManifest,
  context: JourneyContext,
  generatedObjects: readonly GeneratedObjectDefinition[] = [],
): ValidationResult {
  if (!isRecord(manifest.precommitted.sequenceMenus)) {
    return fail("invalid_sequence_menu", "Sequential precommitted menus must be a record of JourneyOption[] values");
  }

  for (const [key, menu] of Object.entries(manifest.precommitted.sequenceMenus)) {
    const result = validateSequenceMenu(
      menu,
      context,
      key,
      manifest.sequence?.maxSteps,
      manifest.shapeId,
      generatedObjects,
    );

    if (!result.ok) {
      return result;
    }
  }

  const nextStep = (manifest.sequence?.step ?? 0) + 1;

  if (
    manifest.sequence?.maxSteps === undefined ||
    nextStep <= manifest.sequence.maxSteps
  ) {
    const nextMenu = manifest.precommitted.sequenceMenus[sequenceMenuKey(nextStep)];

    if (!Array.isArray(nextMenu) || nextMenu.length === 0) {
      return fail("missing_precommitted_outcomes", "Sequential shapes require the next follow-up menu to be precommitted");
    }
  }

  return { ok: true };
}

function normalizedMechanicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizedMechanicalValue);
  }

  if (!isRecord(value)) {
    return typeof value === "number" ? "#" : value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => ![
        "text",
        "description",
        "amount",
        "count",
        "choiceCount",
        "takeCount",
        "costConvertedEssence",
        "effectConvertedEssence",
        "burdenConvertedEssence",
        "uncertaintyConvertedEssence",
        "netConvertedEssence",
      ].includes(key))
      .sort(([left], [right]) => left.localeCompare(right, "en-US"))
      .map(([key, entry]) => [key, normalizedMechanicalValue(entry)]),
  );
}

function randomPrecommitForOption(manifest: JourneyManifest, optionNumber: number): unknown {
  const random = manifest.precommitted.random;

  if (!Array.isArray(random)) {
    return undefined;
  }

  return random.find((entry) =>
    isRecord(entry) && entry.optionNumber === optionNumber
  ) ?? random[optionNumber - 1];
}

function mechanicalOptionSignature(manifest: JourneyManifest, option: JourneyOption): string {
  return JSON.stringify(normalizedMechanicalValue({
    costs: option.costs,
    effects: option.effects,
    burdens: option.burdens,
    targets: option.targets,
    triggers: option.triggers,
    routeEffects: option.routeEffects,
    pickBehavior: option.pickBehavior,
    randomPrecommit: randomPrecommitForOption(manifest, option.number),
  }));
}

function validateRootMechanicalDistinction(manifest: JourneyManifest): ValidationResult {
  if (manifest.options.length < 2) {
    return { ok: true };
  }

  if (
    getShapeDefinition(manifest.shapeId).topology === "random_commit" &&
    !hasPrecommitted(manifest.precommitted.random)
  ) {
    return { ok: true };
  }

  const seen = new Map<string, number>();

  for (const option of manifest.options) {
    if (option.pickBehavior === "leave") {
      continue;
    }

    const signature = mechanicalOptionSignature(manifest, option);
    const previous = seen.get(signature);

    if (previous !== undefined) {
      return fail(
        "duplicate_root_option_mechanics",
        `Options ${previous} and ${option.number} have duplicate mechanical payloads`,
      );
    }

    seen.set(signature, option.number);
  }

  return { ok: true };
}

type ValidationPipelineOptions = {
  stopAfterFirstFailure?: boolean;
};

function rootOptionCountResult(
  manifest: JourneyManifest,
  definition: ReturnType<typeof getShapeDefinition>,
): ValidationResult {
  if (manifest.options.length === 0 && definition.topology !== "decision_tree") {
    return fail("missing_options", "Non-tree Journey manifests require at least one option");
  }

  if (
    manifest.options.length < definition.rootOptionCount.min ||
    manifest.options.length > definition.rootOptionCount.max
  ) {
    return fail("root_option_count_within_bounds", `${manifest.shapeId} has an invalid root option count`);
  }

  return { ok: true };
}

function rootOptionPayloadsResult(
  manifest: JourneyManifest,
  context: JourneyContext,
  generatedObjects: readonly GeneratedObjectDefinition[] = [],
): ValidationResult {
  for (const [index, option] of manifest.options.entries()) {
    const optionShapeResult = validateOptionShape(option, index);

    if (!optionShapeResult.ok) {
      return optionShapeResult;
    }

    const result = validateOption(option, context, generatedObjects);

    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}

function rootValueResult(manifest: JourneyManifest): ValidationResult {
  const nets = manifest.options
    .filter((journeyOption) => journeyOption.pickBehavior !== "leave")
    .map((journeyOption) => journeyOption.netConvertedEssence);

  if (manifest.shapeId === "choose_your_loss") {
    return validateChooseYourLossValues(nets);
  }

  if (manifest.shapeId === "commit_now_future_payoff") {
    return validateCommitNowFuturePayoffValues(nets);
  }

  if (nets.length > 0 && nets.every((net) => net < 0)) {
    return fail("negative_only_positive_scene", "Positive Journey scenes cannot contain only negative options");
  }

  return validatePositiveMenuValues(manifest.shapeId, nets);
}

function offerRefusalResult(
  manifest: JourneyManifest,
  definition: ReturnType<typeof getShapeDefinition>,
): ValidationResult {
  if (
    definition.topology === "single_offer_refusal" &&
    !manifest.options.some((journeyOption) => journeyOption.pickBehavior === "leave")
  ) {
    return fail("fake_strategic_refusal", "Offer shapes require a real leave option");
  }

  return { ok: true };
}

function repeatableMenuLeaveResult(
  manifest: JourneyManifest,
  definition: ReturnType<typeof getShapeDefinition>,
): ValidationResult {
  if (
    definition.topology === "repeatable_menu" &&
    !manifest.options.some((option) => option.pickBehavior === "leave")
  ) {
    return fail("missing_leave_option", "Repeatable menus require a leave option");
  }

  return { ok: true };
}

function repeatableMenuLimitResult(
  manifest: JourneyManifest,
  definition: ReturnType<typeof getShapeDefinition>,
): ValidationResult {
  if (definition.topology !== "repeatable_menu") {
    return { ok: true };
  }

  for (const option of manifest.options) {
    if (!/^take\b/iu.test(option.text)) {
      continue;
    }

    const hasLimitingStructure =
      option.costs.length > 0 ||
      option.burdens.length > 0 ||
      option.uncertaintyConvertedEssence < 0;

    if (!hasLimitingStructure) {
      return fail(
        "open_pick_without_limiting_structure",
        "Repeatable take options require a cost, burden, or risk",
      );
    }
  }

  return { ok: true };
}

function randomPrecommittedResult(
  manifest: JourneyManifest,
  definition: ReturnType<typeof getShapeDefinition>,
): ValidationResult {
  if (
    (definition.topology === "random_commit" ||
      manifest.shapeId === "risk_or_skip" ||
      manifest.options.some(optionImpliesRandomOrHiddenOutcome)) &&
    !hasPrecommitted(manifest.precommitted.random)
  ) {
    return fail("missing_precommitted_outcomes", "Random shapes require precommitted outcomes");
  }

  return { ok: true };
}

function delayedPrecommittedResult(
  manifest: JourneyManifest,
  context: JourneyContext,
  definition: ReturnType<typeof getShapeDefinition>,
): ValidationResult {
  if (
    definition.topology !== "delayed_hook" &&
    !manifest.options.some(optionImpliesDelayedOutcome)
  ) {
    return { ok: true };
  }

  if (!hasPrecommitted(manifest.precommitted.delayed)) {
    return fail("missing_precommitted_outcomes", "Delayed shapes require precommitted future outcomes");
  }

  if (manifest.shapeId === "paired_return" && !hasPrecommitted(manifest.precommitted.pairedReturn)) {
    return fail("missing_precommitted_outcomes", "Paired return shapes require precommitted return metadata");
  }

  if (context.state.quest.route.unresolvedHooks.length + manifestHookBudgetCost(manifest) > 3) {
    return fail("delayed_hook_over_persistence_budget", "Delayed hooks exceed persistence budget");
  }

  return { ok: true };
}

function routePrecommittedPresenceResult(
  manifest: JourneyManifest,
  definition: ReturnType<typeof getShapeDefinition>,
): ValidationResult {
  if (
    (definition.topology === "route_edit" ||
      manifest.options.some((option) => option.routeEffects.length > 0)) &&
    !hasPrecommitted(manifest.precommitted.routeEdits)
  ) {
    return fail("missing_precommitted_outcomes", "Route shapes require committed route edits");
  }

  return { ok: true };
}

function routePrecommittedPayloadResult(manifest: JourneyManifest): ValidationResult {
  return manifest.precommitted.routeEdits !== undefined
    ? validateRouteEffects(manifest.precommitted.routeEdits)
    : { ok: true };
}

function validationRuleOutcomes(
  manifest: JourneyManifest,
  context: JourneyContext,
  options: ValidationPipelineOptions = {},
): ValidationRuleOutcome[] {
  const checked = manifestCheckedPayloads(manifest);
  const manifestChecked = checked.filter((entry) => entry.scope === "manifest");
  const optionChecked = checked.filter((entry) => entry.scope === "option");
  const treeChecked = checked.filter((entry) =>
    entry.scope === "tree_branch" || entry.scope === "tree_terminal"
  );
  const rewardPoolChecked = checked.filter((entry) => entry.scope === "reward_pool");
  const precommittedChecked = checked.filter((entry) => entry.scope === "precommitted");
  const rules: ValidationRuleOutcome[] = [];
  const definition = getShapeDefinition(manifest.shapeId);
  const generatedObjects = generatedObjectResolverPool(manifest);
  const pushRule = (
    ruleId: string,
    result: ValidationResult,
    ruleChecked: ValidationCheckedPayload[],
    passMessage: string,
    ruleOptions: { fatal?: boolean } = {},
  ): boolean => {
    const outcome = resultToOutcome(ruleId, result, ruleChecked, passMessage);
    rules.push(outcome);

    return outcome.status === "pass" ||
      !(options.stopAfterFirstFailure || ruleOptions.fatal);
  };

  if (!pushRule(
    "manifest_schema_version",
    manifest.schemaVersion === MANIFEST_SCHEMA_VERSION
      ? { ok: true }
      : fail("manifest_schema_version", `Manifest schema version must be ${MANIFEST_SCHEMA_VERSION}`),
    manifestChecked,
    "Manifest schema version matches the active contract.",
    { fatal: true },
  )) {
    return rules;
  }

  if (!pushRule(
    "manifest_version_metadata",
    validateVersionMetadata(manifest, context),
    manifestChecked,
    "Manifest version metadata matches the content, catalog, renderer, value, and validation contracts.",
    { fatal: true },
  )) {
    return rules;
  }

  if (!pushRule(
    "journey_id_format",
    /^J-\d{6}$/u.test(manifest.journeyId)
      ? { ok: true }
      : fail("journey_id_format", "Root Journey IDs must use J-000001 formatting"),
    manifestChecked,
    "Journey ID uses the stable root Journey format.",
    { fatal: true },
  )) {
    return rules;
  }

  const optionCountResult = rootOptionCountResult(manifest, definition);
  if (!pushRule(
    "root_option_count_within_bounds",
    optionCountResult,
    optionChecked.length > 0 ? optionChecked : manifestChecked,
    "Root option count is legal for the selected shape.",
    { fatal: true },
  )) {
    return rules;
  }

  const typedPayloadContractResult = validateTypedPayloadContracts(manifest);
  if (!pushRule(
    typedPayloadContractResult.ok ? "typed_payload_contracts" : typedPayloadContractResult.rule,
    typedPayloadContractResult,
    checked,
    "Typed route, status, and rule-mutation payload contracts are coherent.",
    { fatal: true },
  )) {
    return rules;
  }

  if (!pushRule(
    "unresolved_reference",
    validateReferences(manifest, context),
    checked,
    "All manifest references resolve to known content or controlled vocabulary.",
  )) {
    return rules;
  }

  const generatedObjectResult = validateGeneratedObjectDefinitions(manifest, context);
  if (!pushRule(
    generatedObjectResult.ok ? "generated_object_definitions" : generatedObjectResult.rule,
    generatedObjectResult,
    manifestChecked,
    "Manifest-local generated object definitions are complete and coherent.",
  )) {
    return rules;
  }

  const optionResult = rootOptionPayloadsResult(manifest, context, generatedObjects);
  if (!pushRule(
    optionResult.ok ? "root_option_payloads" : optionResult.rule,
    optionResult,
    optionChecked,
    "Root option text, costs, targets, and structured payloads are legal.",
    { fatal: true },
  )) {
    return rules;
  }

  if (!pushRule(
    "duplicate_root_option_mechanics",
    validateRootMechanicalDistinction(manifest),
    optionChecked,
    "Root options are mechanically distinct where the shape requires it.",
  )) {
    return rules;
  }

  const treeBranches = manifest.tree?.nodes.flatMap((node) => node.branches) ?? [];
  if (!pushRule(
    "route_effects",
    validateRouteEffects([
      ...manifest.options.flatMap((option) => option.routeEffects),
      ...treeBranches.flatMap((branch) => branch.routeEffects),
    ]),
    checked.filter((entry) => entry.scope === "option" || entry.scope === "tree_branch"),
    "Route effects use legal route edit structures.",
  )) {
    return rules;
  }

  const riskResult = manifest.shapeId === "risk_or_skip"
    ? validateRiskOrSkip(manifest)
    : { ok: true } as const;
  if (!pushRule(
    riskResult.ok ? "risk_or_skip_envelope" : riskResult.rule,
    riskResult,
    optionChecked.length > 0 ? optionChecked : precommittedChecked,
    "Risk-or-skip envelopes expose bounded downside metadata when applicable.",
  )) {
    return rules;
  }

  const timedWindowResult = manifest.shapeId === "timed_window_menu"
    ? validateTimedWindowMenu(manifest)
    : { ok: true } as const;
  if (!pushRule(
    timedWindowResult.ok ? "timed_window_menu" : timedWindowResult.rule,
    timedWindowResult,
    optionChecked,
    "Timed window menus use multi-battle, play-changing rewards when applicable.",
  )) {
    return rules;
  }

  const valueResult = rootValueResult(manifest);
  if (!pushRule(
    valueResult.ok ? "shape_value_comparability" : valueResult.rule,
    valueResult,
    optionChecked,
    "Root option values are coherent for the selected shape.",
  )) {
    return rules;
  }

  const refusalResult = offerRefusalResult(manifest, definition);
  if (!pushRule(
    refusalResult.ok ? "offer_refusal_invariants" : refusalResult.rule,
    refusalResult,
    optionChecked,
    "Offer shapes include a real leave option when required.",
  )) {
    return rules;
  }

  const treeResult = definition.topology === "decision_tree"
    ? validateDecisionTree(manifest, context, generatedObjects)
    : { ok: true } as const;
  if (!pushRule(
    treeResult.ok ? "decision_tree_invariants" : treeResult.rule,
    treeResult,
    treeChecked.length > 0 ? treeChecked : checked,
    "Decision-tree topology is complete and legal when applicable.",
  )) {
    return rules;
  }

  const repeatableLeaveResult = repeatableMenuLeaveResult(manifest, definition);
  if (!pushRule(
    repeatableLeaveResult.ok ? "repeatable_menu_leave_option" : repeatableLeaveResult.rule,
    repeatableLeaveResult,
    optionChecked,
    "Repeatable menus include a real leave option when applicable.",
  )) {
    return rules;
  }

  const repeatableLimitResult = repeatableMenuLimitResult(manifest, definition);
  if (!pushRule(
    repeatableLimitResult.ok ? "repeatable_menu_limiting_structure" : repeatableLimitResult.rule,
    repeatableLimitResult,
    optionChecked,
    "Repeatable take options include a cost, burden, or risk when applicable.",
  )) {
    return rules;
  }

  const randomResult = randomPrecommittedResult(manifest, definition);
  if (!pushRule(
    randomResult.ok ? "random_precommitted_outcomes" : randomResult.rule,
    randomResult,
    precommittedChecked,
    "Random or hidden outcomes are precommitted when required.",
  )) {
    return rules;
  }

  const wagerResult = manifest.shapeId === "single_wager"
    ? validateSingleWager(manifest)
    : { ok: true } as const;
  if (!pushRule(
    wagerResult.ok ? "single_wager_envelope" : wagerResult.rule,
    wagerResult,
    checked,
    "Single wager options expose stakes, odds, and committed roll metadata when applicable.",
  )) {
    return rules;
  }

  const delayedResult = delayedPrecommittedResult(manifest, context, definition);
  if (!pushRule(
    delayedResult.ok ? "delayed_precommitted_outcomes" : delayedResult.rule,
    delayedResult,
    precommittedChecked,
    "Delayed outcomes are precommitted and within persistence budget when required.",
  )) {
    return rules;
  }

  const routePresenceResult = routePrecommittedPresenceResult(manifest, definition);
  if (!pushRule(
    routePresenceResult.ok ? "route_precommitted_outcomes" : routePresenceResult.rule,
    routePresenceResult,
    precommittedChecked,
    "Route edits are precommitted when required.",
  )) {
    return rules;
  }

  const routePrecommitResult = routePrecommittedPayloadResult(manifest);
  if (!pushRule(
    routePrecommitResult.ok ? "route_precommitted_payloads" : routePrecommitResult.rule,
    routePrecommitResult,
    precommittedChecked,
    "Precommitted route edits use legal route edit structures.",
  )) {
    return rules;
  }

  const rewardPoolTargetResult = manifest.rewardPool
    ? validateOperationTargetSelectors(manifest.rewardPool.operations, context, "Reward pool", generatedObjects)
    : { ok: true } as const;
  if (!pushRule(
    rewardPoolTargetResult.ok ? "reward_pool_target_selectors" : rewardPoolTargetResult.rule,
    rewardPoolTargetResult,
    rewardPoolChecked.length > 0 ? rewardPoolChecked : checked,
    "Reward pool typed operation target selectors resolve where required.",
  )) {
    return rules;
  }

  const precommittedTargetResult = validateOperationTargetSelectors(
    manifest.precommitted.operations,
    context,
    "Precommitted outcomes",
    generatedObjects,
  );
  if (!pushRule(
    precommittedTargetResult.ok ? "operation_target_selectors" : precommittedTargetResult.rule,
    precommittedTargetResult,
    precommittedChecked,
    "Precommitted typed operation target selectors resolve where required.",
  )) {
    return rules;
  }

  if (!pushRule(
    "semantic_operations",
    validateSemanticOperations(manifest),
    checked,
    "Legacy payload records have typed semantic operation counterparts.",
  )) {
    return rules;
  }

  pushRule(
    "precommitted_structured_values",
    scanIllegalStructuredValue(manifest.precommitted),
    precommittedChecked,
    "Precommitted structured values are legal.",
  );

  return rules;
}

export function validateJourneyManifest(
  manifest: JourneyManifest,
  context: JourneyContext,
): ValidationResult {
  const firstFailure = validationRuleOutcomes(
    manifest,
    context,
    { stopAfterFirstFailure: true },
  ).find((rule) => rule.status === "fail");

  if (!firstFailure) {
    return { ok: true };
  }

  return {
    ok: false,
    rule: firstFailure.ruleId,
    message: firstFailure.message,
    ...(firstFailure.debug ? { debug: firstFailure.debug } : {}),
  };
}

export function buildValidationReport(
  manifest: JourneyManifest,
  context: JourneyContext,
): ValidationReport {
  return buildReport(validationRuleOutcomes(manifest, context));
}
