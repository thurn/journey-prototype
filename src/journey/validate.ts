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
    ...manifest.options.map((option) => ({
      path: `$.options[${option.number - 1}]`,
      scope: "option" as const,
      optionNumber: option.number,
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
        if (key === "cardName" || key === "cardId" || key === "oldCardName" || key === "newCardName") {
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

function validateOperationTargetSelectors(
  operations: readonly JourneyOperation[] | undefined,
  context: JourneyContext,
  location: string,
): ValidationResult {
  for (const [index, operation] of (operations ?? []).entries()) {
    if (!("targetSelector" in operation) || !operation.targetSelector) {
      continue;
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

export function validateJourneyManifest(
  manifest: JourneyManifest,
  context: JourneyContext,
): ValidationResult {
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    return fail("manifest_schema_version", `Manifest schema version must be ${MANIFEST_SCHEMA_VERSION}`);
  }

  const versionMetadataResult = validateVersionMetadata(manifest, context);

  if (!versionMetadataResult.ok) {
    return versionMetadataResult;
  }

  if (!/^J-\d{6}$/u.test(manifest.journeyId)) {
    return fail("journey_id_format", "Root Journey IDs must use J-000001 formatting");
  }

  const definition = getShapeDefinition(manifest.shapeId);

  if (manifest.options.length === 0 && definition.topology !== "decision_tree") {
    return fail("missing_options", "Non-tree Journey manifests require at least one option");
  }

  if (
    manifest.options.length < definition.rootOptionCount.min ||
    manifest.options.length > definition.rootOptionCount.max
  ) {
    return fail("root_option_count_within_bounds", `${manifest.shapeId} has an invalid root option count`);
  }

  const referencesResult = validateReferences(manifest, context);

  if (!referencesResult.ok) {
    return referencesResult;
  }

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

  const distinctionResult = validateRootMechanicalDistinction(manifest);

  if (!distinctionResult.ok) {
    return distinctionResult;
  }

  const treeBranches = manifest.tree?.nodes.flatMap((node) => node.branches) ?? [];
  const routeEffectsResult = validateRouteEffects([
    ...manifest.options.flatMap((option) => option.routeEffects),
    ...treeBranches.flatMap((branch) => branch.routeEffects),
  ]);

  if (!routeEffectsResult.ok) {
    return routeEffectsResult;
  }

  if (manifest.shapeId === "risk_or_skip") {
    const riskOrSkipResult = validateRiskOrSkip(manifest);

    if (!riskOrSkipResult.ok) {
      return riskOrSkipResult;
    }
  }

  const nets = manifest.options
    .filter((journeyOption) => journeyOption.pickBehavior !== "leave")
    .map((journeyOption) => journeyOption.netConvertedEssence);

  if (manifest.shapeId === "timed_window_menu") {
    const timedWindowResult = validateTimedWindowMenu(manifest);

    if (!timedWindowResult.ok) {
      return timedWindowResult;
    }
  }

  if (manifest.shapeId === "choose_your_loss") {
    const lossResult = validateChooseYourLossValues(nets);

    if (!lossResult.ok) {
      return lossResult;
    }
  } else if (manifest.shapeId === "commit_now_future_payoff") {
    const payoffResult = validateCommitNowFuturePayoffValues(nets);

    if (!payoffResult.ok) {
      return payoffResult;
    }
  } else if (nets.length > 0 && nets.every((net) => net < 0)) {
    return fail("negative_only_positive_scene", "Positive Journey scenes cannot contain only negative options");
  } else {
    const comparableResult = validatePositiveMenuValues(manifest.shapeId, nets);

    if (!comparableResult.ok) {
      return comparableResult;
    }
  }

  if (
    definition.topology === "single_offer_refusal" &&
    !manifest.options.some((journeyOption) => journeyOption.pickBehavior === "leave")
  ) {
    return fail("fake_strategic_refusal", "Offer shapes require a real leave option");
  }

  if (definition.topology === "decision_tree") {
    const treeResult = validateDecisionTree(manifest, context);

    if (!treeResult.ok) {
      return treeResult;
    }
  }

  if (
    definition.topology === "repeatable_menu" &&
    !manifest.options.some((option) => option.pickBehavior === "leave")
  ) {
    return fail("missing_leave_option", "Repeatable menus require a leave option");
  }

  if (definition.topology === "repeatable_menu") {
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
  }

  if (
    (definition.topology === "random_commit" ||
      manifest.shapeId === "risk_or_skip" ||
      manifest.options.some(optionImpliesRandomOrHiddenOutcome)) &&
    !hasPrecommitted(manifest.precommitted.random)
  ) {
    return fail("missing_precommitted_outcomes", "Random shapes require precommitted outcomes");
  }

  if (manifest.shapeId === "single_wager") {
    const singleWagerResult = validateSingleWager(manifest);

    if (!singleWagerResult.ok) {
      return singleWagerResult;
    }
  }

  if (
    definition.topology === "delayed_hook" ||
    manifest.options.some(optionImpliesDelayedOutcome)
  ) {
    if (!hasPrecommitted(manifest.precommitted.delayed)) {
      return fail("missing_precommitted_outcomes", "Delayed shapes require precommitted future outcomes");
    }

    if (manifest.shapeId === "paired_return" && !hasPrecommitted(manifest.precommitted.pairedReturn)) {
      return fail("missing_precommitted_outcomes", "Paired return shapes require precommitted return metadata");
    }

    if (context.state.quest.route.unresolvedHooks.length > 3) {
      return fail("delayed_hook_over_persistence_budget", "Delayed hooks exceed persistence budget");
    }
  }

  if (
    (definition.topology === "route_edit" ||
      manifest.options.some((option) => option.routeEffects.length > 0)) &&
    !hasPrecommitted(manifest.precommitted.routeEdits)
  ) {
    return fail("missing_precommitted_outcomes", "Route shapes require committed route edits");
  }

  if (manifest.precommitted.routeEdits !== undefined) {
    const routePrecommitResult = validateRouteEffects(manifest.precommitted.routeEdits);

    if (!routePrecommitResult.ok) {
      return routePrecommitResult;
    }
  }

  if (manifest.rewardPool) {
    const rewardPoolTargetResult = validateOperationTargetSelectors(
      manifest.rewardPool.operations,
      context,
      "Reward pool",
    );

    if (!rewardPoolTargetResult.ok) {
      return rewardPoolTargetResult;
    }
  }

  const precommittedTargetResult = validateOperationTargetSelectors(
    manifest.precommitted.operations,
    context,
    "Precommitted outcomes",
  );

  if (!precommittedTargetResult.ok) {
    return precommittedTargetResult;
  }

  const semanticOperationsResult = validateSemanticOperations(manifest);

  if (!semanticOperationsResult.ok) {
    return semanticOperationsResult;
  }

  const precommittedResult = scanIllegalStructuredValue(manifest.precommitted);

  if (!precommittedResult.ok) {
    return precommittedResult;
  }

  return { ok: true };
}

export function buildValidationReport(
  manifest: JourneyManifest,
  context: JourneyContext,
): ValidationReport {
  const checked = manifestCheckedPayloads(manifest);
  const manifestChecked = checked.filter((entry) => entry.scope === "manifest");
  const optionChecked = checked.filter((entry) => entry.scope === "option");
  const precommittedChecked = checked.filter((entry) => entry.scope === "precommitted");
  const rules: ValidationRuleOutcome[] = [];

  rules.push(resultToOutcome(
    "manifest_schema_version",
    manifest.schemaVersion === MANIFEST_SCHEMA_VERSION
      ? { ok: true }
      : fail("manifest_schema_version", `Manifest schema version must be ${MANIFEST_SCHEMA_VERSION}`),
    manifestChecked,
    "Manifest schema version matches the active contract.",
  ));

  rules.push(resultToOutcome(
    "manifest_version_metadata",
    validateVersionMetadata(manifest, context),
    manifestChecked,
    "Manifest version metadata matches the content, catalog, renderer, value, and validation contracts.",
  ));

  rules.push(resultToOutcome(
    "journey_id_format",
    /^J-\d{6}$/u.test(manifest.journeyId)
      ? { ok: true }
      : fail("journey_id_format", "Root Journey IDs must use J-000001 formatting"),
    manifestChecked,
    "Journey ID uses the stable root Journey format.",
  ));

  const definition = getShapeDefinition(manifest.shapeId);
  const optionCountResult =
    manifest.options.length === 0 && definition.topology !== "decision_tree"
      ? fail("missing_options", "Non-tree Journey manifests require at least one option")
      : manifest.options.length < definition.rootOptionCount.min ||
          manifest.options.length > definition.rootOptionCount.max
        ? fail("root_option_count_within_bounds", `${manifest.shapeId} has an invalid root option count`)
        : { ok: true } as const;

  rules.push(resultToOutcome(
    "root_option_count_within_bounds",
    optionCountResult,
    optionChecked.length > 0 ? optionChecked : manifestChecked,
    "Root option count is legal for the selected shape.",
  ));

  rules.push(resultToOutcome(
    "unresolved_reference",
    validateReferences(manifest, context),
    checked,
    "All manifest references resolve to known content or controlled vocabulary.",
  ));

  let optionResult: ValidationResult = { ok: true };
  for (const [index, option] of manifest.options.entries()) {
    const optionShapeResult = validateOptionShape(option, index);

    if (!optionShapeResult.ok) {
      optionResult = optionShapeResult;
      break;
    }

    const result = validateOption(option, context);

    if (!result.ok) {
      optionResult = result;
      break;
    }
  }

  rules.push(resultToOutcome(
    optionResult.ok ? "root_option_payloads" : optionResult.rule,
    optionResult,
    optionChecked,
    "Root option text, costs, targets, and structured payloads are legal.",
  ));

  rules.push(resultToOutcome(
    "duplicate_root_option_mechanics",
    validateRootMechanicalDistinction(manifest),
    optionChecked,
    "Root options are mechanically distinct where the shape requires it.",
  ));

  const treeBranches = manifest.tree?.nodes.flatMap((node) => node.branches) ?? [];
  rules.push(resultToOutcome(
    "route_effects",
    validateRouteEffects([
      ...manifest.options.flatMap((option) => option.routeEffects),
      ...treeBranches.flatMap((branch) => branch.routeEffects),
    ]),
    checked.filter((entry) => entry.scope === "option" || entry.scope === "tree_branch"),
    "Route effects use legal route edit structures.",
  ));

  const nets = manifest.options
    .filter((journeyOption) => journeyOption.pickBehavior !== "leave")
    .map((journeyOption) => journeyOption.netConvertedEssence);
  const valueResult =
    manifest.shapeId === "choose_your_loss"
      ? validateChooseYourLossValues(nets)
      : manifest.shapeId === "commit_now_future_payoff"
        ? validateCommitNowFuturePayoffValues(nets)
        : nets.length > 0 && nets.every((net) => net < 0)
          ? fail("negative_only_positive_scene", "Positive Journey scenes cannot contain only negative options")
          : validatePositiveMenuValues(manifest.shapeId, nets);

  rules.push(resultToOutcome(
    valueResult.ok ? "shape_value_comparability" : valueResult.rule,
    valueResult,
    optionChecked,
    "Root option values are coherent for the selected shape.",
  ));

  let topologyResult: ValidationResult = { ok: true };
  if (manifest.shapeId === "risk_or_skip") {
    topologyResult = validateRiskOrSkip(manifest);
  } else if (manifest.shapeId === "timed_window_menu") {
    topologyResult = validateTimedWindowMenu(manifest);
  } else if (definition.topology === "decision_tree") {
    topologyResult = validateDecisionTree(manifest, context);
  } else if (
    definition.topology === "single_offer_refusal" &&
    !manifest.options.some((journeyOption) => journeyOption.pickBehavior === "leave")
  ) {
    topologyResult = fail("fake_strategic_refusal", "Offer shapes require a real leave option");
  } else if (
    definition.topology === "repeatable_menu" &&
    !manifest.options.some((option) => option.pickBehavior === "leave")
  ) {
    topologyResult = fail("missing_leave_option", "Repeatable menus require a leave option");
  }

  rules.push(resultToOutcome(
    topologyResult.ok ? "shape_topology_invariants" : topologyResult.rule,
    topologyResult,
    checked,
    "Shape topology invariants pass.",
  ));

  let precommittedResult: ValidationResult = { ok: true };
  if (
    (definition.topology === "random_commit" ||
      manifest.shapeId === "risk_or_skip" ||
      manifest.options.some(optionImpliesRandomOrHiddenOutcome)) &&
    !hasPrecommitted(manifest.precommitted.random)
  ) {
    precommittedResult = fail("missing_precommitted_outcomes", "Random shapes require precommitted outcomes");
  } else if (
    definition.topology === "delayed_hook" ||
    manifest.options.some(optionImpliesDelayedOutcome)
  ) {
    if (!hasPrecommitted(manifest.precommitted.delayed)) {
      precommittedResult = fail("missing_precommitted_outcomes", "Delayed shapes require precommitted future outcomes");
    } else if (manifest.shapeId === "paired_return" && !hasPrecommitted(manifest.precommitted.pairedReturn)) {
      precommittedResult = fail("missing_precommitted_outcomes", "Paired return shapes require precommitted return metadata");
    }
  } else if (
    (definition.topology === "route_edit" ||
      manifest.options.some((option) => option.routeEffects.length > 0)) &&
    !hasPrecommitted(manifest.precommitted.routeEdits)
  ) {
    precommittedResult = fail("missing_precommitted_outcomes", "Route shapes require committed route edits");
  }

  if (precommittedResult.ok && manifest.precommitted.routeEdits !== undefined) {
    precommittedResult = validateRouteEffects(manifest.precommitted.routeEdits);
  }

  rules.push(resultToOutcome(
    precommittedResult.ok ? "precommitted_outcomes" : precommittedResult.rule,
    precommittedResult,
    precommittedChecked,
    "Precommitted outcomes are present and legal where required.",
  ));

  const targetResult =
    validateOperationTargetSelectors(manifest.precommitted.operations, context, "Precommitted outcomes");

  rules.push(resultToOutcome(
    targetResult.ok ? "operation_target_selectors" : targetResult.rule,
    targetResult,
    checked,
    "Typed operation target selectors resolve where required.",
  ));

  rules.push(resultToOutcome(
    "semantic_operations",
    validateSemanticOperations(manifest),
    checked,
    "Legacy payload records have typed semantic operation counterparts.",
  ));

  const fullResult = validateJourneyManifest(manifest, context);
  if (!fullResult.ok && !rules.some((rule) => rule.status === "fail" && rule.ruleId === fullResult.rule)) {
    rules.push(resultToOutcome(
      fullResult.rule,
      fullResult,
      checked,
      "Full manifest validation passed.",
    ));
  }

  return buildReport(rules);
}
