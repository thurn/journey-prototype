import type { JourneyContext } from "../quest/context.js";
import { RENDERER_VERSION } from "../render/theme.js";
import {
  EFFECT_CATALOG_VERSION,
  isBaneName,
  isImmediateCostPayable,
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
          key === "newDreamsignName"
        ) {
          references.dreamsigns.push(entry);
        } else if (key === "dreamcallerName" || key === "dreamcallerId") {
          references.dreamcallers.push(entry);
        } else if (key === "baneName") {
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
): ValidationResult {
  if (!("required" in selector) || selector.required !== true) {
    return { ok: true };
  }

  const resolution = resolveTargetSelector(context.content, context.state.quest, selector);

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

  if (selector.selectorKind !== "card" || (selector.source ?? "deck") !== "deck") {
    return { ok: true };
  }

  const resolution = resolveTargetSelector(context.content, context.state.quest, selector);

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
): ValidationResult {
  for (const [index, operation] of (operations ?? []).entries()) {
    if (!("targetSelector" in operation) || !operation.targetSelector) {
      continue;
    }

    const namedCardResult = validateNamedCardOperationTarget(operation, context, index + 1);

    if (!namedCardResult.ok) {
      return fail(namedCardResult.rule, `${location} operation ${index + 1}: ${namedCardResult.message}`, namedCardResult.debug);
    }

    const result = validateTargetSelector(operation.targetSelector, context, index + 1);

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

function validateOption(option: JourneyOption, context: JourneyContext): ValidationResult {
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

    const result = validateTargetSelector(operation.targetSelector, context, option.number);

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
    return fail("dreamsign_loss_without_dreamsign", "Dreamsign loss requires an active Dreamsign");
  }

  if (
    option.effects.some((effect) => isRecord(effect) && effect.kind === "starter_cleanup") &&
    context.state.quest.deck.summary.starterCards === 0
  ) {
    return fail("starter_cleanup_without_starters", "Starter cleanup requires Starter cards");
  }

  if (option.effects.some((effect) => isRecord(effect) && effect.kind === "bane_purge")) {
    return fail("bane_purge_without_banes", "Bane purge requires tracked Banes in state");
  }

  if (
    option.netConvertedEssence > 0 &&
    option.routeEffects.some((routeEffect) => {
      if (!isRecord(routeEffect) || typeof routeEffect.kind !== "string") {
        return false;
      }

      return routeEffect.kind.includes("addition") || routeEffect.kind.includes("add");
    })
  ) {
    return fail("route_addition_standalone_positive_reward", "Route addition cannot be a standalone positive reward");
  }

  return { ok: true };
}

function validateTreeBranch(
  branch: NonNullable<JourneyManifest["tree"]>["nodes"][number]["branches"][number],
  context: JourneyContext,
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
  );

  if (!branchSelectorResult.ok) {
    return branchSelectorResult;
  }

  if (branch.terminal) {
    const terminalSelectorResult = validateOperationTargetSelectors(
      branch.terminal.operations,
      context,
      `Tree branch ${branch.id} terminal`,
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

      const result = validateTreeBranch(branch, context);

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
      routeEffect.kind.includes("addition") ||
      routeEffect.kind.includes("add")
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

    const result = validateOption(option, context);

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
): ValidationResult {
  for (const [index, option] of manifest.options.entries()) {
    const optionShapeResult = validateOptionShape(option, index);

    if (!optionShapeResult.ok) {
      return optionShapeResult;
    }

    const result = validateOption(option, context);

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

  if (context.state.quest.route.unresolvedHooks.length > 3) {
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

  if (!pushRule(
    "unresolved_reference",
    validateReferences(manifest, context),
    checked,
    "All manifest references resolve to known content or controlled vocabulary.",
  )) {
    return rules;
  }

  const optionResult = rootOptionPayloadsResult(manifest, context);
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
    ? validateDecisionTree(manifest, context)
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
    ? validateOperationTargetSelectors(manifest.rewardPool.operations, context, "Reward pool")
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
