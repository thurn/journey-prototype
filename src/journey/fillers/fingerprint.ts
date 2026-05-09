import { sha256Hex } from "../../util/hash.js";
import { stableStringify } from "../../util/stableJson.js";
import type { DebugPayloadSelection } from "../debugPayloads.js";
import type {
  DistinctnessFingerprint,
  GeneratedObjectDefinition,
  JourneyManifest,
  JourneyOperation,
  JourneyOption,
  JourneyRewardPool,
  JourneyStage,
  JourneyTree,
  PrecommittedOutcomes,
  SemanticEquivalenceBand,
} from "../manifest.js";
import { getShapeDefinition, type JourneyShapeId } from "../shapes.js";
import {
  semanticChanceBand,
  semanticBatchSizeBand,
  semanticChoiceCountBand,
  semanticDurationBand,
  semanticEssenceAmountBand,
  semanticHookCounterBand,
  semanticMaxResourceEffectBand,
  semanticOmenCountBand,
  semanticOperationArityBand,
  semanticPercentageCostBand,
  semanticAllRemainingCostBand,
  semanticRandomRangeBand,
  semanticRouteScopeBand,
} from "../value.js";
import { uniqueSorted } from "./shared.js";

export function semanticFingerprintFor(args: {
  shapeId: JourneyShapeId;
  stage: JourneyStage;
  selectedTags: readonly string[];
  debugPayload?: DebugPayloadSelection;
  options: readonly JourneyOption[];
  tree?: JourneyTree;
  rewardPool?: JourneyRewardPool;
  generatedObjects?: readonly GeneratedObjectDefinition[];
  precommitted: PrecommittedOutcomes;
}): DistinctnessFingerprint {
  const shape = getShapeDefinition(args.shapeId);
  const payloadFamilies = new Set<string>(
    args.debugPayload ? [args.debugPayload.familyId] : [],
  );
  const operationVerbs = new Set<string>();
  const targetClasses = new Set<string>();
  const namedObjectIdentities = new Set<string>();
  const generatedObjectArchetypes = new Set<string>();
  const timingClasses = new Set<string>();
  const triggerClasses = new Set<string>();
  const routeScopes = new Set<string>();
  const statusScopes = new Set<string>();
  const randomEnvelopeTypes = new Set<string>();
  const revealEnvelopeTypes = new Set<string>();
  const visibilityPolicies = new Set<string>();
  const majorCostFamilies = new Set<string>();
  const majorRewardFamilies = new Set<string>();
  const majorBurdenFamilies = new Set<string>();
  const motifs = new Set<string>([
    `shape:${args.shapeId}`,
    ...args.selectedTags.map((tag) => `stage-texture:${tag}`),
  ]);
  const curatedVariantIds = new Set<string>(
    args.debugPayload ? [args.debugPayload.qaId] : [],
  );
  const semanticValueBands = new Set<string>();
  const equivalenceBands = new Map<string, SemanticEquivalenceBand>();
  const addBand = (band: SemanticEquivalenceBand) => {
    equivalenceBands.set(`${band.field}:${band.band}`, band);
    semanticValueBands.add(`${band.field}:${band.band}`);
  };
  const addString = (target: Set<string>, prefix: string, value: unknown) => {
    if (typeof value === "string" && value.length > 0) {
      target.add(`${prefix}:${value}`);
    }
  };
  const payloadFamilyForKind = (kind: unknown): string | undefined => {
    if (typeof kind !== "string") {
      return undefined;
    }

    if (
      kind === "gain_essence" ||
      kind === "gain_omens" ||
      kind === "essence" ||
      kind === "omens" ||
      kind === "essence_loss" ||
      kind === "omen_loss" ||
      kind.startsWith("resource_")
    ) {
      return "resource";
    }

    if (
      kind.startsWith("card_") ||
      kind.startsWith("starter_") ||
      kind === "transfiguration"
    ) {
      return "card";
    }

    if (kind.startsWith("dreamsign_")) {
      return "dreamsign";
    }

    if (kind.startsWith("bane_")) {
      return "bane";
    }

    if (
      kind.startsWith("route_") ||
      kind.includes("_route_") ||
      kind === "current_route_replacement" ||
      kind === "future_route_replacement"
    ) {
      return "route";
    }

    if (kind.startsWith("shop_")) {
      return "shop";
    }

    if (kind.startsWith("dreamwell_") || kind === "battle_window_modifier") {
      return "dreamwell";
    }

    if (
      kind.startsWith("status_") ||
      kind.includes("_rule") ||
      kind === "reward_replacement"
    ) {
      return "status";
    }

    if (kind.startsWith("generated_object_")) {
      return "generated_object";
    }

    if (
      kind.startsWith("random_") ||
      kind.startsWith("reveal_") ||
      kind.startsWith("chance_") ||
      kind === "visible_pool" ||
      kind === "choose_one_revealed_reward" ||
      kind === "choose_one_random_revealed_reward" ||
      kind === "gain_one_random_reward" ||
      kind === "roll_twice_keep_one" ||
      kind === "repeated_pool_draws" ||
      kind === "wager" ||
      kind === "probability_ladder" ||
      kind === "push_choice" ||
      kind === "resolved_random_series"
    ) {
      return "random";
    }

    if (kind === "complete_decision_tree") {
      return "decision_tree";
    }

    if (
      kind.includes("trigger") ||
      kind.includes("delayed") ||
      kind === "future_shop" ||
      kind === "future_dream_journey" ||
      kind === "paired_return"
    ) {
      return "hook";
    }

    return undefined;
  };
  const normalizedVariantId = (family: string, variant: string): string =>
    `${family}/${variant
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "")}`;
  const addPayloadClassification = (
    family: string | undefined,
    variant: unknown,
  ) => {
    if (!family) {
      return;
    }

    payloadFamilies.add(family);

    if (typeof variant === "string" && variant.length > 0) {
      curatedVariantIds.add(normalizedVariantId(family, variant));
    }
  };
  const addPayloadKindClassification = (kind: unknown) => {
    addPayloadClassification(payloadFamilyForKind(kind), kind);
  };
  const addTargetFamily = (selectorKind: unknown) => {
    if (
      selectorKind === "card" ||
      selectorKind === "dreamsign" ||
      selectorKind === "dreamcaller" ||
      selectorKind === "bane" ||
      selectorKind === "status" ||
      selectorKind === "generated_object"
    ) {
      payloadFamilies.add(selectorKind);
    } else if (selectorKind === "route_site") {
      payloadFamilies.add("route");
    }
  };
  const addIdentity = (kind: string, id: unknown, name: unknown) => {
    const identity =
      typeof id === "string" && id.length > 0
        ? id
        : typeof name === "string" && name.length > 0
          ? name
          : undefined;

    if (identity) {
      namedObjectIdentities.add(`${kind}:${identity}`);
    }
  };
  const addChoiceBand = (count: unknown) => {
    if (typeof count === "number") {
      const band = semanticChoiceCountBand(count);
      addBand({
        field: "choice_count",
        band,
        description:
          "Choice counts contribute only as single, narrow, menu, or broad semantic bands.",
      });
    }
  };
  const addChanceBand = (percent: unknown) => {
    if (typeof percent === "number") {
      const band = semanticChanceBand(percent);
      addBand({
        field: "chance_percentage",
        band,
        description:
          "Percent chances contribute only as coarse probability bands.",
      });
    }
  };
  const addDurationBand = (durationKind: string, count: unknown) => {
    const band = semanticDurationBand(
      typeof count === "number" ? count : undefined,
      durationKind,
    );
    addBand({
      field: "duration_count",
      band,
      description:
        "Durations contribute only as next, short-window, long-window, or unspecified bands.",
    });
  };
  const addPercentageCostBand = (percent: unknown) => {
    if (typeof percent !== "number") {
      return;
    }

    addBand({
      field: "percentage_cost",
      band: semanticPercentageCostBand(percent),
      description:
        "Percentage costs contribute only as light, moderate, heavy, or near-total cost bands.",
    });
  };
  const addMaxResourceBand = (amount: unknown) => {
    if (typeof amount !== "number") {
      return;
    }

    addBand({
      field: "max_resource_effect",
      band: semanticMaxResourceEffectBand(amount),
      description:
        "Maximum-resource effects contribute only as minor, standard, or major cap-change bands.",
    });
  };
  const addAllRemainingCostBand = (resource: unknown) => {
    addBand({
      field: "all_remaining_cost",
      band: semanticAllRemainingCostBand(typeof resource === "string" ? resource : "essence"),
      description:
        "All-remaining costs contribute as a semantic all-in resource commitment.",
    });
  };
  const addRandomRangeBand = (minimum: unknown, maximum: unknown) => {
    if (typeof minimum !== "number" || typeof maximum !== "number") {
      return;
    }

    addBand({
      field: "random_range",
      band: semanticRandomRangeBand(minimum, maximum),
      description:
        "Random ranges contribute by variance band rather than exact bounds.",
    });
  };
  const addBatchSizeBand = (count: unknown, all = false) => {
    if (typeof count !== "number" && !all) {
      return;
    }

    addBand({
      field: "batch_size",
      band: semanticBatchSizeBand(typeof count === "number" ? count : 1, all),
      description:
        "Batch and all-card operation sizes contribute by semantic operation size.",
    });
  };
  const addHookCounterBand = (count: unknown) => {
    addBand({
      field: "hook_counter",
      band: semanticHookCounterBand(typeof count === "number" ? count : undefined),
      description:
        "Hook counters contribute by single, short, long, or unspecified bands.",
    });
  };
  const addRouteScopeBand = (scope: unknown) => {
    if (typeof scope !== "string") {
      return;
    }

    addBand({
      field: "route_scope",
      band: semanticRouteScopeBand(scope),
      description:
        "Route scopes contribute by current, next, future, or full-atlas bands.",
    });
  };
  const addOperationArityBand = (count: unknown) => {
    if (typeof count !== "number") {
      return;
    }

    addBand({
      field: "operation_arity",
      band: semanticOperationArityBand(count),
      description:
        "Operation arity contributes by single, pair, menu, or bundle bands.",
    });
  };
  const addResourceBand = (
    resource: unknown,
    amount: unknown,
    role: "cost" | "reward" | "burden",
  ) => {
    if (typeof amount !== "number") {
      return;
    }

    if (resource === "omens") {
      const band = semanticOmenCountBand(amount, role);
      addBand({
        field: "omen_count",
        band,
        description:
          "Omen counts contribute only as none, single, multi, or major bands.",
      });
    } else {
      const band = semanticEssenceAmountBand(amount, role);
      addBand({
        field: "essence_amount",
        band,
        description:
          "Essence amounts contribute only as low, medium, high, or major bands.",
      });
    }
  };
  const addPayloadSemantics = (
    payload: Record<string, unknown>,
    role: "cost" | "reward" | "burden" | "neutral",
  ) => {
    addPayloadKindClassification(payload.kind);
    addIdentity("card", payload.cardId, payload.cardName);
    addIdentity("card", payload.resultCardId, payload.resultCardName);
    addIdentity("dreamsign", payload.dreamsignId, payload.dreamsignName);
    addIdentity(
      "dreamsign",
      payload.resultDreamsignId,
      payload.resultDreamsignName,
    );
    addIdentity("bane", payload.baneName, payload.baneName);
    addIdentity("status", payload.statusId, payload.statusName);
    addIdentity(
      "generated_object",
      payload.generatedObjectId,
      payload.generatedObjectName,
    );
    addString(routeScopes, "route", payload.routeScope);
    addString(routeScopes, "shop", payload.shopScope);
    addString(routeScopes, "dreamwell", payload.dreamwellScope);
    addString(statusScopes, "status", payload.statusScope);
    addString(triggerClasses, "trigger", payload.trigger);
    addString(timingClasses, "timing", payload.timing);
    addChoiceBand(payload.choiceCount);
    addChoiceBand(payload.takeCount);
    addChoiceBand(payload.revealCount);
    addChoiceBand(payload.drawCount);
    addBatchSizeBand(
      payload.targetCount ?? payload.starterTargetCount ?? payload.count,
      payload.cleanupMode === "all" ||
        payload.replacementMode === "all" ||
        payload.cardOperationTargetMode === "all_matching" ||
        payload.transfigurationScope === "all_cards" ||
        payload.transfigurationScope === "all_events" ||
        payload.transfigurationScope === "all_starters" ||
        payload.allMatchingSiteType === true,
    );
    addOperationArityBand(payload.operationArity ?? payload.operationCount);
    addChanceBand(payload.probability);
    addChanceBand(payload.percent);
    addChanceBand(payload.probabilityDeltaPercent);
    addPercentageCostBand(payload.percentage);
    addRandomRangeBand(payload.minimum, payload.maximum);
    addRouteScopeBand(payload.routeScope ?? payload.scope);
    addDurationBand(
      typeof payload.durationKind === "string"
        ? payload.durationKind
        : "duration",
      payload.durationCount ?? payload.count,
    );

    if (
      payload.kind === "gain_omens" ||
      payload.kind === "omen_loss" ||
      payload.kind === "omens"
    ) {
      addResourceBand(
        "omens",
        payload.amount ?? payload.count,
        role === "neutral" ? "reward" : role,
      );
    } else if (
      payload.kind === "gain_essence" ||
      payload.kind === "essence" ||
      payload.kind === "essence_loss" ||
      typeof payload.amount === "number"
    ) {
      addResourceBand(
        payload.resource ?? "essence",
        payload.amount,
        role === "neutral" ? "reward" : role,
      );
    }
  };
  const operationVerb = (operation: JourneyOperation): string => {
    if (operation.operationKind === "reward") {
      return `reward:${operation.rewardKind}`;
    }

    if (operation.operationKind === "cost") {
      return `cost:${operation.resource}`;
    }

    if (operation.operationKind === "burden") {
      return `burden:${operation.burdenKind}`;
    }

    if (operation.operationKind === "route_edit") {
      return `route:${operation.editKind}`;
    }

    if (operation.operationKind === "status") {
      return `status:${operation.statusKind}`;
    }

    if (
      operation.operationKind === "random_envelope" ||
      operation.operationKind === "reveal_envelope"
    ) {
      return `${operation.operationKind}:${operation.envelopeKind}`;
    }

    if (operation.operationKind === "delayed_hook") {
      return `delayed_hook:${operation.hookKind}`;
    }

    return operation.operationKind;
  };
  const inspectOperation = (operation: JourneyOperation) => {
    operationVerbs.add(operationVerb(operation));
    visibilityPolicies.add(`operation:${operation.visibility}`);
    addPayloadKindClassification(operation.legacyKind);

    if (operation.operationKind === "reward") {
      majorRewardFamilies.add(operation.rewardKind);
      addPayloadClassification(
        payloadFamilyForKind(operation.rewardKind),
        operation.rewardKind,
      );
    }

    if (operation.operationKind === "cost") {
      majorCostFamilies.add(operation.resource);
      addPayloadClassification("resource", `cost-${operation.resource}`);
      addResourceBand(operation.resource, operation.amount, "cost");
    }

    if (operation.operationKind === "burden") {
      majorBurdenFamilies.add(operation.burdenKind);
      addPayloadClassification(
        payloadFamilyForKind(operation.burdenKind),
        operation.burdenKind,
      );
    }

    if (operation.operationKind === "status") {
      addPayloadClassification("status", operation.statusKind);
      statusScopes.add(operation.statusKind);
    }

    if (operation.operationKind === "route_edit") {
      addPayloadClassification("route", operation.editKind);
      routeScopes.add(
        operation.timing?.timingKind === "route"
          ? operation.timing.scope
          : "route",
      );
      addRouteScopeBand(
        operation.timing?.timingKind === "route"
          ? operation.timing.scope
          : operation.payload.routeScope,
      );
    }

    if (operation.operationKind === "paired_return") {
      addPayloadClassification(
        "return",
        operation.contract?.returnScene.returnSceneKind ?? "paired_return",
      );
    }

    if (operation.operationKind === "random_envelope") {
      addPayloadClassification("random", operation.envelopeKind);
      randomEnvelopeTypes.add(operation.envelopeKind);
      addChanceBand(operation.odds?.percent);
    }

    if (operation.operationKind === "reveal_envelope") {
      addPayloadClassification("random", operation.envelopeKind);
      revealEnvelopeTypes.add(operation.envelopeKind);
      addChanceBand(operation.odds?.percent);
    }

    if (operation.timing) {
      timingClasses.add(operation.timing.timingKind);
      if (operation.timing.timingKind === "delayed") {
        triggerClasses.add(operation.timing.trigger);
      }
      if (operation.timing.timingKind === "route") {
        routeScopes.add(operation.timing.scope);
      }
    }

    if (operation.targetSelector) {
      addTargetFamily(operation.targetSelector.selectorKind);
      targetClasses.add(operation.targetSelector.selectorKind);
      if ("selection" in operation.targetSelector) {
        targetClasses.add(
          `${operation.targetSelector.selectorKind}:${operation.targetSelector.selection}`,
        );
      }
      if (
        "referenceKind" in operation.targetSelector &&
        operation.targetSelector.referenceKind
      ) {
        targetClasses.add(
          `${operation.targetSelector.selectorKind}:${operation.targetSelector.referenceKind}`,
        );
      }
      if (
        "scope" in operation.targetSelector &&
        typeof operation.targetSelector.scope === "string"
      ) {
        statusScopes.add(operation.targetSelector.scope);
        routeScopes.add(operation.targetSelector.scope);
      }
      if ("ids" in operation.targetSelector) {
        operation.targetSelector.ids?.forEach((id) =>
          addIdentity(operation.targetSelector!.selectorKind, id, undefined),
        );
      }
      if ("names" in operation.targetSelector) {
        operation.targetSelector.names?.forEach((name) =>
          addIdentity(operation.targetSelector!.selectorKind, undefined, name),
        );
      }
    }

    for (const selected of operation.targetResolution?.selected ?? []) {
      addIdentity(
        operation.targetResolution?.selectorKind ?? selected.kind ?? "target",
        selected.id,
        selected.name,
      );
    }

    if (operation.operationKind === "generated_object") {
      const generatedObject = operation.generatedObject;

      addPayloadClassification(
        "generated_object",
        generatedObject.generatedObjectKind,
      );
      generatedObjectArchetypes.add(
        `${generatedObject.generatedObjectKind}:${generatedObject.objectType}`,
      );
      addIdentity(
        "generated_object",
        generatedObject.generatedObjectId,
        generatedObject.name,
      );
    }

    if (operation.operationKind === "delayed_hook") {
      addPayloadClassification("hook", operation.hookKind);
      addString(triggerClasses, "hook", operation.hookKind);
      if (operation.triggerSelector) {
        triggerClasses.add(operation.triggerSelector.triggerKind);
        addHookCounterBand(operation.triggerSelector.count);
        addDurationBand(
          operation.triggerSelector.triggerKind,
          operation.triggerSelector.count,
        );
      }
      if (operation.duration) {
        addDurationBand(
          operation.duration.durationKind,
          operation.duration.count,
        );
      }
      if (operation.visibilityPolicy) {
        visibilityPolicies.add(
          `hook:${operation.visibilityPolicy.outcomeVisibility}`,
        );
      }
      for (const nested of operation.rewardOperations ?? []) {
        inspectOperation(nested);
      }
    }

    if (operation.resourceSemantics) {
      semanticValueBands.add(
        `${operation.resourceSemantics.resource}:${operation.resourceSemantics.amountKind}`,
      );
      if (operation.resourceSemantics.amountKind === "percentage_of_current") {
        addPercentageCostBand(operation.resourceSemantics.percentage);
      }
      if (
        operation.resourceSemantics.amountKind === "maximum" ||
        operation.resourceSemantics.amountKind === "restore_to_maximum" ||
        operation.resourceSemantics.amountKind === "cap_change"
      ) {
        addMaxResourceBand(
          operation.resourceSemantics.capDelta ??
            operation.resourceSemantics.amount ??
            operation.resourceSemantics.maximum,
        );
      }
      if (operation.resourceSemantics.amountKind === "all_remaining") {
        addAllRemainingCostBand(operation.resourceSemantics.resource);
      }
      if (operation.resourceSemantics.amountKind === "random_range") {
        addRandomRangeBand(
          operation.resourceSemantics.minimum,
          operation.resourceSemantics.maximum,
        );
      }
      addResourceBand(
        operation.resourceSemantics.resource,
        operation.resourceSemantics.amount ??
          operation.resourceSemantics.capDelta ??
          operation.resourceSemantics.percentage ??
          operation.resourceSemantics.maximum,
        operation.role === "cost"
          ? "cost"
          : operation.role === "burden"
            ? "burden"
            : "reward",
      );
    }

    for (const band of operation.value?.bands ?? []) {
      semanticValueBands.add(`explicit:${band.id}`);
      if (band.id === "batch_operation") {
        addBatchSizeBand(band.amount, String(band.label).includes("all"));
      }
      if (band.id === "hook_counter") {
        addHookCounterBand(band.amount);
      }
      if (band.id === "route_scope") {
        addRouteScopeBand(String(band.label).replace(/^route-scope:/u, ""));
      }
      if (band.id === "operation_arity") {
        addOperationArityBand(band.amount);
      }
    }

    addPayloadSemantics(
      operation.payload,
      operation.role === "cost"
        ? "cost"
        : operation.role === "burden"
          ? "burden"
          : operation.role === "reward"
            ? "reward"
            : "neutral",
    );
  };
  const inspectUnknownPayload = (
    payload: unknown,
    role: "cost" | "reward" | "burden" | "neutral",
  ) => {
    if (
      typeof payload === "object" &&
      payload !== null &&
      !Array.isArray(payload)
    ) {
      const record = payload as Record<string, unknown>;
      addString(operationVerbs, role, record.kind);
      addPayloadKindClassification(record.kind);
      addPayloadSemantics(record, role);
    }
  };

  for (const journeyOption of args.options) {
    motifs.add(`pick:${journeyOption.pickBehavior}`);
    addChoiceBand(args.options.length);
    addOperationArityBand(journeyOption.operations.length);
    journeyOption.operations.forEach(inspectOperation);
    journeyOption.costs.forEach((payload) =>
      inspectUnknownPayload(payload, "cost"),
    );
    journeyOption.effects.forEach((payload) =>
      inspectUnknownPayload(payload, "reward"),
    );
    journeyOption.burdens.forEach((payload) =>
      inspectUnknownPayload(payload, "burden"),
    );
    journeyOption.triggers.forEach((payload) =>
      inspectUnknownPayload(payload, "neutral"),
    );
    journeyOption.routeEffects.forEach((payload) =>
      inspectUnknownPayload(payload, "neutral"),
    );
  }

  for (const node of args.tree?.nodes ?? []) {
    motifs.add(`tree-level:${node.levelLabel}`);
    addChoiceBand(node.branches.length);
    for (const branch of node.branches) {
      motifs.add(
        `tree-branch:${branch.kind}:${branch.terminal?.outcome ?? branch.nextNodeId ?? "continue"}`,
      );
      addChanceBand(branch.odds?.percent);
      branch.operations.forEach(inspectOperation);
      branch.costs.forEach((payload) => inspectUnknownPayload(payload, "cost"));
      branch.effects.forEach((payload) =>
        inspectUnknownPayload(payload, "reward"),
      );
      branch.burdens.forEach((payload) =>
        inspectUnknownPayload(payload, "burden"),
      );
      branch.triggers.forEach((payload) =>
        inspectUnknownPayload(payload, "neutral"),
      );
      branch.routeEffects.forEach((payload) =>
        inspectUnknownPayload(payload, "neutral"),
      );
      branch.terminal?.operations.forEach(inspectOperation);
    }
  }

  args.rewardPool?.operations.forEach(inspectOperation);
  for (const reward of args.rewardPool?.rewards ?? []) {
    inspectUnknownPayload(reward, "reward");
  }

  for (const generatedObject of args.generatedObjects ?? []) {
    addPayloadClassification(
      "generated_object",
      generatedObject.generatedObjectKind,
    );
    generatedObjectArchetypes.add(
      `${generatedObject.generatedObjectKind}:${generatedObject.objectType}`,
    );
    addIdentity(
      "generated_object",
      generatedObject.generatedObjectId,
      generatedObject.name,
    );
    generatedObject.tags.forEach((tag) => motifs.add(`generated-tag:${tag}`));
    if (generatedObject.duration) {
      addDurationBand(
        generatedObject.duration.durationKind,
        generatedObject.duration.count,
      );
    }
  }

  for (const outcome of args.precommitted.random ?? []) {
    addPayloadKindClassification(outcome.kind);
    randomEnvelopeTypes.add(outcome.kind);
    addChanceBand(
      typeof outcome.odds === "object" &&
        outcome.odds !== null &&
        "percent" in outcome.odds &&
        typeof outcome.odds.percent === "number"
        ? outcome.odds.percent
        : undefined,
    );
    addChoiceBand("revealCount" in outcome ? outcome.revealCount : undefined);
    addChoiceBand("drawCount" in outcome ? outcome.drawCount : undefined);
    addPayloadSemantics(outcome as Record<string, unknown>, "neutral");
    if (outcome.kind === "complete_decision_tree") {
      motifs.add(`decision-tree:${outcome.motif}`);
    }
    if (
      typeof outcome.visibilityPolicy === "object" &&
      outcome.visibilityPolicy !== null &&
      "outcomeVisibility" in outcome.visibilityPolicy &&
      typeof outcome.visibilityPolicy.outcomeVisibility === "string"
    ) {
      visibilityPolicies.add(
        `random:${outcome.visibilityPolicy.outcomeVisibility}`,
      );
    }
  }

  for (const outcome of args.precommitted.delayed ?? []) {
    inspectUnknownPayload(outcome, "neutral");
    timingClasses.add("delayed");
  }

  for (const outcome of args.precommitted.pairedReturn ?? []) {
    inspectUnknownPayload(outcome, "neutral");
    timingClasses.add("paired_return");
  }

  for (const outcome of args.precommitted.routeEdits ?? []) {
    inspectUnknownPayload(outcome, "neutral");
  }

  args.precommitted.operations?.forEach(inspectOperation);

  const sortedOrNone = (values: Set<string>): string[] =>
    values.size === 0 ? ["none"] : uniqueSorted([...values]);
  const explanation: DistinctnessFingerprint["explanation"] = {
    shapeId: args.shapeId,
    topology: shape.topology,
    stage: args.stage,
    payloadFamilies: sortedOrNone(payloadFamilies),
    operationVerbs: sortedOrNone(operationVerbs),
    targetClasses: sortedOrNone(targetClasses),
    namedObjectIdentities: sortedOrNone(namedObjectIdentities),
    generatedObjectArchetypes: sortedOrNone(generatedObjectArchetypes),
    timingClasses: sortedOrNone(timingClasses),
    triggerClasses: sortedOrNone(triggerClasses),
    routeScopes: sortedOrNone(routeScopes),
    statusScopes: sortedOrNone(statusScopes),
    randomEnvelopeTypes: sortedOrNone(randomEnvelopeTypes),
    revealEnvelopeTypes: sortedOrNone(revealEnvelopeTypes),
    visibilityPolicies: sortedOrNone(visibilityPolicies),
    majorCostFamilies: sortedOrNone(majorCostFamilies),
    majorRewardFamilies: sortedOrNone(majorRewardFamilies),
    majorBurdenFamilies: sortedOrNone(majorBurdenFamilies),
    motifs: sortedOrNone(motifs),
    curatedVariantIds: sortedOrNone(curatedVariantIds),
    semanticValueBands: sortedOrNone(semanticValueBands),
  };
  const components = [
    `shape:${args.shapeId}`,
    `topology:${shape.topology}`,
    `stage:${args.stage}`,
    ...Object.entries(explanation).flatMap(([key, values]) =>
      Array.isArray(values) ? values.map((value) => `${key}:${value}`) : [],
    ),
  ];
  const contract = {
    algorithm: "semantic-fingerprint:v1",
    explanation,
  };

  return {
    algorithm: "semantic-fingerprint:v1",
    value: sha256Hex(stableStringify(contract)).slice(0, 16),
    components,
    explanation,
    equivalenceBands: [...equivalenceBands.values()].sort((left, right) =>
      `${left.field}:${left.band}`.localeCompare(
        `${right.field}:${right.band}`,
        "en-US",
      ),
    ),
  };
}

export function withDistinctnessFingerprint(
  manifest: JourneyManifest,
): JourneyManifest {
  const distinctness = semanticFingerprintFor({
    shapeId: manifest.shapeId,
    stage: manifest.stage,
    selectedTags: manifest.selectedTags,
    debugPayload: manifest.debug.debugPayload,
    options: manifest.options,
    tree: manifest.tree,
    rewardPool: manifest.rewardPool,
    generatedObjects: manifest.generatedObjects,
    precommitted: manifest.precommitted,
  });

  return {
    ...manifest,
    distinctness,
    debug: {
      ...manifest.debug,
      semanticFingerprint: distinctness,
    },
  };
}
