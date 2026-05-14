import type {
  JourneyOperation,
  JourneyOption,
  JourneyRewardPool,
  JourneyTreeBranch,
  JourneyTreeTerminal,
  OperationVisibility,
  OperationTiming,
  OperationValueMetadata,
  ResourceAmountSemantics,
  PrecommittedOutcomes,
  RandomEnvelopeOperation,
  RewardOperation,
  BoundedDuration,
  DelayedHookContract,
  HookControlledScene,
  HookExpirationPolicy,
  HookTriggerSelector,
  HookVisibilityPolicy,
  TargetSelectionMode,
  TargetSelector,
} from "./manifest.js";
import { DEFAULT_BANE_NAME } from "./effects.js";
import {
  CARD_VALUE_CONSTANTS,
  BANE_VALUE_CONSTANTS,
  PURGE_VALUE_CONSTANTS,
  cardPredicateSpecificityValue,
  OBJECT_QUALITY_VALUE_CONSTANTS,
  OPERATION_ARITY_VALUE_CONSTANTS,
  COMPOUND_BUNDLE_VALUE_CONSTANTS,
  semanticBatchSizeBand,
  semanticHookCounterBand,
  semanticOperationArityBand,
  semanticRandomRangeBand,
  semanticRouteScopeBand,
} from "./value.js";

type PayloadRecord = Record<string, unknown>;

function isRecord(value: unknown): value is PayloadRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clonePayload(value: unknown): PayloadRecord {
  return isRecord(value) ? { ...value } : { value };
}

function legacyKind(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return typeof value.kind === "string"
    ? value.kind
    : typeof value.type === "string"
      ? value.type
      : undefined;
}

function sourceFromPredicate(predicate: unknown): string | undefined {
  return isRecord(predicate) && typeof predicate.source === "string"
    ? predicate.source
    : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const entries = value.filter((entry): entry is string => typeof entry === "string");

  return entries.length > 0 ? entries : undefined;
}

function baneSourceFromPayload(value: PayloadRecord): "vocabulary" | "state" | "future_burden" | "manifest_obligation" {
  if (value.baneTargetContext === "current_state") {
    return "state";
  }

  if (value.baneTargetContext === "future_burden") {
    return "future_burden";
  }

  if (value.baneTargetContext === "manifest_obligation") {
    return "manifest_obligation";
  }

  return "vocabulary";
}

function selectionFromLegacy(value: PayloadRecord, predicate: unknown): TargetSelectionMode {
  if (
    value.selection === "exact" ||
    value.selection === "predicate" ||
    value.selection === "chosen_after_commitment" ||
    value.selection === "visible_random" ||
    value.selection === "hidden_random"
  ) {
    return value.selection;
  }

  if (
    stringArray(value.ids) ||
    stringArray(value.names) ||
    (isRecord(predicate) && (stringArray(predicate.ids) || stringArray(predicate.names)))
  ) {
    return "exact";
  }

  const description = typeof value.description === "string" ? value.description.toLowerCase() : "";

  if (description.includes("random")) {
    return "hidden_random";
  }

  if (description.includes("chosen")) {
    return "chosen_after_commitment";
  }

  return "predicate";
}

function targetSelectorFromTarget(value: unknown): TargetSelector {
  if (!isRecord(value)) {
    return { selectorKind: "none" };
  }

  const predicate = value.predicate;
  const description = typeof value.description === "string" ? value.description : undefined;
  const required = value.required === true;
  const source = sourceFromPredicate(predicate);
  const selection = selectionFromLegacy(value, predicate);
  const ids = stringArray(value.ids) ?? (isRecord(predicate) ? stringArray(predicate.ids) : undefined);
  const names = stringArray(value.names) ?? (isRecord(predicate) ? stringArray(predicate.names) : undefined);

  if (value.kind === "card") {
    return {
      selectorKind: "card",
      selection,
      referenceKind: "content",
      ...(source === "catalog" || source === "deck" || source === "draftPool" ? { source } : {}),
      ...(description ? { description } : {}),
      ...(ids ? { ids } : {}),
      ...(names ? { names } : {}),
      ...(predicate !== undefined ? { predicate } : {}),
      required,
    };
  }

  if (value.kind === "dreamsign") {
    return {
      selectorKind: "dreamsign",
      selection,
      referenceKind: "content",
      ...(source === "catalog" || source === "active" || source === "pool" ? { source } : {}),
      ...(description ? { description } : {}),
      ...(ids ? { ids } : {}),
      ...(names ? { names } : {}),
      ...(predicate !== undefined ? { predicate } : {}),
      required,
    };
  }

  if (value.kind === "bane") {
    const targetSource = source === "vocabulary" ||
      source === "state" ||
      source === "future_burden" ||
      source === "manifest_obligation"
      ? source
      : undefined;

    return {
      selectorKind: "bane",
      selection,
      referenceKind: "controlled_vocabulary",
      ...(targetSource ? { source: targetSource } : {}),
      ...(names && names.length > 0 ? { names } : {}),
      required,
    };
  }

  if (value.kind === "route_site") {
    const siteTypes = stringArray(value.siteTypes);

    return {
      selectorKind: "route_site",
      selection,
      referenceKind: "controlled_vocabulary",
      ...(typeof value.scope === "string" ? { scope: value.scope as "current_dreamscape" | "next_dreamscape" | "route" } : {}),
      ...(typeof value.siteType === "string" ? { siteType: value.siteType } : {}),
      ...(siteTypes ? { siteTypes } : {}),
      ...(description ? { description } : {}),
      required,
    };
  }

  return { selectorKind: "none" };
}

function targetSelectorFromPayload(value: unknown): TargetSelector | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    typeof value.generatedObjectId === "string" ||
    typeof value.generatedObjectKind === "string" ||
    typeof value.generatedObjectName === "string" ||
    typeof value.generatedObjectReferenceKind === "string"
  ) {
    return {
      selectorKind: "generated_object",
      selection: value.selection === "chosen_after_commitment" ||
        value.generatedObjectOperationKind === "trade" ||
        value.generatedObjectOperationKind === "return"
        ? "chosen_after_commitment"
        : "exact",
      referenceKind: "manifest_generated",
      generatedObjectReferenceKind: value.generatedObjectReferenceKind === "placeholder" ? "placeholder" : "definition",
      ...(typeof value.generatedObjectKind === "string"
        ? { generatedObjectKind: value.generatedObjectKind as "card" | "dreamsign" | "status" | "transfiguration" }
        : {}),
      ...(typeof value.generatedObjectId === "string" ? { generatedObjectId: value.generatedObjectId } : {}),
      ...(typeof value.generatedObjectName === "string" ? { name: value.generatedObjectName } : {}),
      required: true,
    };
  }

  if (
    typeof value.siteType === "string" ||
    typeof value.fromSite === "string" ||
    typeof value.toSite === "string"
  ) {
    const siteTypes = stringArray(value.siteTypes) ??
      [value.fromSite, value.toSite, value.siteType, value.affectedSite]
        .filter((entry): entry is string => typeof entry === "string");

    return {
      selectorKind: "route_site",
      selection: "exact",
      referenceKind: "controlled_vocabulary",
      scope: routeScopeFromPayload(value),
      ...(siteTypes.length === 1 ? { siteType: siteTypes[0] } : {}),
      ...(siteTypes.length > 1 ? { siteTypes } : {}),
      required: true,
    };
  }

  if (
    typeof value.statusScope === "string" ||
    typeof value.statusName === "string" ||
    typeof value.statusId === "string"
  ) {
    return {
      selectorKind: "status",
      selection: "exact",
      referenceKind: "controlled_vocabulary",
      scope: typeof value.statusScope === "string" ? value.statusScope : "quest",
      ...(typeof value.statusId === "string" ? { statusId: value.statusId } : {}),
      ...(typeof value.statusName === "string" ? { statusName: value.statusName } : {}),
      required: true,
    };
  }

  if (
    typeof value.baneName === "string" ||
    Array.isArray(value.baneNames) ||
    value.kind === "bane_purge" ||
    value.kind === "bane_random_purge" ||
    value.kind === "bane_chosen_purge" ||
    value.kind === "bane_replace" ||
    value.kind === "bane_transform_to_card"
  ) {
    const baneNames = typeof value.baneName === "string"
      ? [value.baneName]
      : stringArray(value.baneNames);
    const targetContext = baneSourceFromPayload(value);
    const selection = value.selection === "visible_random" || value.kind === "bane_random_purge"
      ? "visible_random"
      : value.selection === "chosen_after_commitment" || value.kind === "bane_chosen_purge"
        ? "chosen_after_commitment"
        : "exact";

    return {
      selectorKind: "bane",
      selection,
      referenceKind: "controlled_vocabulary",
      source: targetContext,
      ...(baneNames ? { names: baneNames } : {}),
      required: targetContext === "state",
    };
  }

  if (
    typeof value.targetCardName === "string" ||
    typeof value.targetCardId === "string" ||
    typeof value.oldCardName === "string" ||
    typeof value.oldCardId === "string"
  ) {
    const source = value.source === "catalog" || value.source === "deck" || value.source === "draftPool"
      ? value.source
      : "deck";

    return {
      selectorKind: "card",
      selection: "exact",
      referenceKind: "content",
      source,
      ...(typeof value.targetCardId === "string"
        ? { ids: [value.targetCardId] }
        : typeof value.oldCardId === "string"
          ? { ids: [value.oldCardId] }
          : {}),
      ...(typeof value.targetCardName === "string"
        ? { names: [value.targetCardName] }
        : typeof value.oldCardName === "string"
          ? { names: [value.oldCardName] }
          : {}),
      required: true,
    };
  }

  if (typeof value.cardName === "string" || typeof value.cardId === "string") {
    const source = value.source === "catalog" || value.source === "deck" || value.source === "draftPool"
      ? value.source
      : "catalog";

    return {
      selectorKind: "card",
      selection: "exact",
      referenceKind: "content",
      source,
      ...(typeof value.cardId === "string" ? { ids: [value.cardId] } : {}),
      ...(typeof value.cardName === "string" ? { names: [value.cardName] } : {}),
      required: true,
    };
  }

  if (value.kind === "dreamsign_random_reward" && isRecord(value.predicate)) {
    const source = value.source === "catalog" || value.source === "active" || value.source === "pool"
      ? value.source
      : sourceFromPredicate(value.predicate);

    return {
      selectorKind: "dreamsign",
      selection: "hidden_random",
      referenceKind: "content",
      ...(source === "catalog" || source === "active" || source === "pool" ? { source } : {}),
      predicate: value.predicate,
      required: true,
    };
  }

  if (typeof value.dreamsignName === "string" || typeof value.dreamsignId === "string") {
    const source = value.source === "catalog" || value.source === "active" || value.source === "pool"
      ? value.source
      : "catalog";

    return {
      selectorKind: "dreamsign",
      selection: "exact",
      referenceKind: "content",
      source,
      ...(typeof value.dreamsignId === "string" ? { ids: [value.dreamsignId] } : {}),
      ...(typeof value.dreamsignName === "string" ? { names: [value.dreamsignName] } : {}),
      required: true,
    };
  }

  if (typeof value.targetDreamsignName === "string" || typeof value.targetDreamsignId === "string") {
    const source = value.source === "catalog" || value.source === "active" || value.source === "pool"
      ? value.source
      : "pool";

    return {
      selectorKind: "dreamsign",
      selection: "exact",
      referenceKind: "content",
      source,
      ...(typeof value.targetDreamsignId === "string" ? { ids: [value.targetDreamsignId] } : {}),
      ...(typeof value.targetDreamsignName === "string" ? { names: [value.targetDreamsignName] } : {}),
      required: true,
    };
  }

  if (typeof value.dreamcallerName === "string" || typeof value.dreamcallerId === "string") {
    return {
      selectorKind: "dreamcaller",
      selection: "exact",
      referenceKind: "content",
      source: "catalog",
      ...(typeof value.dreamcallerId === "string" ? { ids: [value.dreamcallerId] } : {}),
      ...(typeof value.dreamcallerName === "string" ? { names: [value.dreamcallerName] } : {}),
      required: true,
    };
  }

  if (isRecord(value.predicate)) {
    const source = sourceFromPredicate(value.predicate);

    if (
      value.kind === "card_draft" ||
      value.kind === "card_gain" ||
      source === "draftPool" ||
      source === "deck"
    ) {
      return {
        selectorKind: "card",
        selection: value.selection === "hidden_random" ? "hidden_random" : "predicate",
        referenceKind: "content",
        ...(source === "catalog" || source === "deck" || source === "draftPool" ? { source } : {}),
        predicate: value.predicate,
        required: true,
      };
    }

    if (
      value.kind === "dreamsign_draft" ||
      value.kind === "dreamsign_random_reward" ||
      source === "pool" ||
      source === "active" ||
      source === "catalog"
    ) {
      return {
        selectorKind: "dreamsign",
        selection: value.selection === "hidden_random" ? "hidden_random" : "predicate",
        referenceKind: "content",
        ...(source === "catalog" || source === "active" || source === "pool" ? { source } : {}),
        predicate: value.predicate,
      };
    }
  }

  if (typeof value.scope === "string" && value.scope.includes("card")) {
    return {
      selectorKind: "card",
      selection: value.scope.includes("random") ? "hidden_random" : "chosen_after_commitment",
      referenceKind: "content",
      source: "deck",
      description: value.scope,
    };
  }

  return undefined;
}

function routeScopeFromPayload(value: PayloadRecord): "current_dreamscape" | "next_dreamscape" | "future_dreamscapes" | "full_atlas" {
  if (value.routeScope === "current_dreamscape" || value.routeScope === "current") {
    return "current_dreamscape";
  }

  if (value.routeScope === "next_dreamscape" || value.routeScope === "next") {
    return "next_dreamscape";
  }

  if (value.routeScope === "future_dreamscapes" || value.routeScope === "future") {
    return "future_dreamscapes";
  }

  if (value.routeScope === "full_atlas" || value.routeScope === "atlas") {
    return "full_atlas";
  }

  const timing = typeof value.timing === "string" ? value.timing : "";

  if (timing.includes("full atlas") || timing.includes("atlas")) {
    return "full_atlas";
  }

  if (timing.includes("future")) {
    return "future_dreamscapes";
  }

  return timing.includes("next") ? "next_dreamscape" : "current_dreamscape";
}

function timingFromPayload(value: unknown): OperationTiming | undefined {
  if (!isRecord(value) || typeof value.timing !== "string") {
    return undefined;
  }

  if (typeof value.routeScope === "string") {
    return {
      timingKind: "route",
      scope: routeScopeFromPayload(value),
      label: value.timing,
    };
  }

  if (value.timing === "immediate") {
    return { timingKind: "immediate", label: "immediate" };
  }

  if (value.timing.includes("next") || value.timing.includes("after")) {
    return { timingKind: "delayed", trigger: value.timing, label: value.timing };
  }

  return { timingKind: "immediate", label: value.timing };
}

function oddsFromPayload(value: unknown): RandomEnvelopeOperation["odds"] | undefined {
  if (
    isRecord(value) &&
    isRecord(value.odds) &&
    typeof value.odds.numerator === "number" &&
    typeof value.odds.denominator === "number" &&
    typeof value.odds.percent === "number"
  ) {
    return {
      numerator: value.odds.numerator,
      denominator: value.odds.denominator,
      percent: value.odds.percent,
    };
  }

  return undefined;
}

function isRandomEnvelopePayloadKind(kind: string | undefined): boolean {
  return kind === "visible_pool" ||
    kind === "random_cost" ||
    kind === "random_reward" ||
    kind === "chance_to_gain_bane" ||
    kind === "chance_to_pay_cost" ||
    kind === "reveal_rewards" ||
    kind === "choose_one_revealed_reward" ||
    kind === "choose_one_random_revealed_reward" ||
    kind === "gain_one_random_reward" ||
    kind === "roll_twice_keep_one" ||
    kind === "repeated_pool_draws" ||
    kind === "random_range" ||
    kind === "resource_random_range" ||
    kind === "wager" ||
    kind === "push_choice" ||
    kind === "complete_decision_tree";
}

function resourceAmount(value: unknown): number {
  return isRecord(value) && typeof value.amount === "number" ? value.amount : 0;
}

function explicitPayloadConvertedEssence(value: unknown): number | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return typeof value.componentConvertedEssence === "number"
    ? value.componentConvertedEssence
    : typeof value.operationConvertedEssence === "number"
      ? value.operationConvertedEssence
      : undefined;
}

function resourceSemanticsFromPayload(value: unknown): ResourceAmountSemantics | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const kind = legacyKind(value);
  const resource = value.resource === "omens" || kind === "gain_omens" || kind === "omens" || kind === "omen_loss"
    ? "omens"
    : value.resource === "maxEssence" || value.resource === "max_essence"
      ? "maxEssence"
      : value.resource === "essence" ||
          kind === "gain_essence" ||
          kind === "essence" ||
          kind === "essence_loss" ||
          kind === "essence_all_remaining" ||
          kind === "resource_restore_to_maximum" ||
          kind === "resource_percentage" ||
          kind === "resource_random_range" ||
          kind === "resource_cap_change" ||
          kind === "resource_reward_reduction"
        ? "essence"
        : undefined;

  if (!resource) {
    return undefined;
  }

  const amountKind = typeof value.resourceAmountKind === "string"
    ? value.resourceAmountKind
    : kind === "resource_restore_to_maximum"
      ? "restore_to_maximum"
      : kind === "resource_percentage"
        ? "percentage_of_maximum"
        : kind === "resource_random_range"
          ? "random_range"
          : kind === "resource_cap_change"
            ? "cap_change"
            : kind === "resource_reward_reduction"
              ? "reward_reduction"
              : kind === "essence_all_remaining" || value.allRemaining === true
                ? "all_remaining"
                : "fixed";

  if (
    amountKind !== "fixed" &&
    amountKind !== "maximum" &&
    amountKind !== "restore_to_maximum" &&
    amountKind !== "percentage_of_current" &&
    amountKind !== "percentage_of_maximum" &&
    amountKind !== "all_remaining" &&
    amountKind !== "random_range" &&
    amountKind !== "cap_change" &&
    amountKind !== "reward_reduction"
  ) {
    return undefined;
  }

  return {
    resource,
    amountKind,
    ...(typeof value.amount === "number" ? { amount: value.amount } : {}),
    ...(typeof value.percentage === "number" ? { percentage: value.percentage } : {}),
    ...(typeof value.minimum === "number" ? { minimum: value.minimum } : {}),
    ...(typeof value.maximum === "number" ? { maximum: value.maximum } : {}),
    ...(typeof value.capDelta === "number" ? { capDelta: value.capDelta } : {}),
    ...(value.basis === "current" || value.basis === "maximum" || value.basis === "remaining" || value.basis === "reward"
      ? { basis: value.basis }
      : {}),
  };
}

function numberField(value: PayloadRecord, key: string): number | undefined {
  return typeof value[key] === "number" ? value[key] : undefined;
}

function booleanField(value: PayloadRecord, key: string): boolean | undefined {
  return typeof value[key] === "boolean" ? value[key] : undefined;
}

function selectedNamedCard(value: PayloadRecord): string | undefined {
  return [
    value.cardName,
    value.resultCardName,
    value.targetCardName,
    value.oldCardName,
    value.secondTargetCardName,
  ].find((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function selectedNamedDreamsign(value: PayloadRecord): string | undefined {
  return [
    value.dreamsignName,
    value.resultDreamsignName,
    value.newDreamsignName,
    value.targetDreamsignName,
  ].find((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function payloadConvertedAmount(value: PayloadRecord, convertedEssence?: number): number {
  return convertedEssence ??
    numberField(value, "componentConvertedEssence") ??
    numberField(value, "operationConvertedEssence") ??
    numberField(value, "windowValue") ??
    numberField(value, "siteDeltaValue") ??
    0;
}

function routePayloadScope(value: PayloadRecord): string | undefined {
  return typeof value.routeScope === "string"
    ? value.routeScope
    : typeof value.scope === "string"
      ? value.scope
      : undefined;
}

function payloadOperationArity(value: PayloadRecord): number | undefined {
  const explicitArity =
    numberField(value, "operationArity") ??
    numberField(value, "operationCount") ??
    numberField(value, "payloadCount");

  if (explicitArity !== undefined) {
    return explicitArity;
  }

  const componentRole = typeof value.compoundComponentRole === "string" ? 1 : 0;
  const hasTarget = selectedNamedCard(value) || selectedNamedDreamsign(value) ? 1 : 0;
  const hasRoute = routePayloadScope(value) ? 1 : 0;

  return componentRole + hasTarget + hasRoute > 1
    ? componentRole + hasTarget + hasRoute
    : undefined;
}

function cardPredicateMetadataBands(value: PayloadRecord): NonNullable<OperationValueMetadata["bands"]> {
  const bands: NonNullable<OperationValueMetadata["bands"]> = [];
  const kind = legacyKind(value);

  if (kind !== "card_draft" && kind !== "card_gain") {
    return bands;
  }

  const predicate = value.predicate;
  const predicateSpecificity = cardPredicateSpecificityValue(predicate);

  if (typeof value.choiceCount === "number") {
    bands.push({
      id: "choice_breadth",
      label: "choice breadth",
      description: "card value separates visible draft breadth from cards taken.",
      amount: value.choiceCount,
    });
  }

  if (typeof value.takeCount === "number") {
    bands.push({
      id: "take_count",
      label: "take count",
      description: "card value separates selected-card count from visible choice breadth.",
      amount: value.takeCount,
    });
  }

  if (typeof value.copyCount === "number" && value.copyCount > 1) {
    bands.push({
      id: "copy_count",
      label: "copy count",
      description: "card value accounts for added copies of each selected card.",
      amount: value.copyCount,
    });
  }

  if (predicateSpecificity > 0) {
    bands.push({
      id: "predicate_specificity",
      label: "predicate specificity",
      description: "card value accounts for structured card predicates such as subtype, text, rarity, cost, duplicates, or abilities.",
      amount: predicateSpecificity,
    });
  }

  if (value.selection === "hidden_random" || value.random === true) {
    bands.push({
      id: "random_hidden_target",
      label: "random hidden target",
      description: "card value applies hidden-target uncertainty to random gains.",
      amount: CARD_VALUE_CONSTANTS.hiddenRandomPenalty,
    });
  }

  if (value.temporary === true) {
    bands.push({
      id: "temporary_gain",
      label: "temporary gain",
      description: "card value is discounted for temporary card gains.",
    });
  }

  return bands;
}

function namedObjectMetadataBands(
  value: PayloadRecord,
  convertedEssence?: number,
): NonNullable<OperationValueMetadata["bands"]> {
  const bands: NonNullable<OperationValueMetadata["bands"]> = [];
  const cardName = selectedNamedCard(value);
  const dreamsignName = selectedNamedDreamsign(value);
  const amount = payloadConvertedAmount(value, convertedEssence);

  if (cardName) {
    bands.push({
      id: "named_card_quality",
      label: cardName,
      description: "Named card value records visible card quality instead of treating all named cards as text-only references.",
      amount: amount || OBJECT_QUALITY_VALUE_CONSTANTS.namedCardFallback,
    });
  }

  if (dreamsignName) {
    bands.push({
      id: "named_dreamsign_quality",
      label: dreamsignName,
      description: "Named Dreamsign value records visible Dreamsign quality and selected-source confidence.",
      amount: amount || OBJECT_QUALITY_VALUE_CONSTANTS.namedDreamsignFallback,
    });
  }

  return bands;
}

function randomTargetMetadataBands(value: PayloadRecord): NonNullable<OperationValueMetadata["bands"]> {
  const bands: NonNullable<OperationValueMetadata["bands"]> = [];
  const randomSelection = value.selection === "hidden_random" ||
    value.selection === "visible_random" ||
    value.resultSelection === "hidden_random" ||
    value.resultSelection === "visible_random" ||
    booleanField(value, "random") === true;

  if (randomSelection) {
    bands.push({
      id: "random_target_uncertainty",
      label: value.selection === "visible_random" || value.resultSelection === "visible_random"
        ? "visible random target"
        : "hidden random target",
      description: "Random target value applies uncertainty when the exact target is not chosen at commit time.",
      amount: CARD_VALUE_CONSTANTS.hiddenRandomPenalty,
    });
  }

  return bands;
}

function numericPayloadField(value: PayloadRecord, key: string): number | undefined {
  return typeof value[key] === "number" ? value[key] : undefined;
}

function batchOperationMetadataBands(value: PayloadRecord): NonNullable<OperationValueMetadata["bands"]> {
  const count =
    numericPayloadField(value, "targetCount") ??
    numericPayloadField(value, "count") ??
    numericPayloadField(value, "starterTargetCount") ??
    numericPayloadField(value, "drawCount");
  const allMatching = value.cleanupMode === "all" ||
    value.replacementMode === "all" ||
    value.duplicateMode === "batch" ||
    value.purgeMode === "all_duplicates" ||
    value.cardOperationTargetMode === "all_matching" ||
    value.transfigurationScope === "all_cards" ||
    value.transfigurationScope === "all_events" ||
    value.transfigurationScope === "all_starters" ||
    value.allMatchingSiteType === true;

  if (!allMatching && (count === undefined || count <= 1)) {
    return [];
  }

  return [{
    id: "batch_operation",
    label: semanticBatchSizeBand(count ?? 1, allMatching),
    description: "Batch and all-card operations carry separate value metadata from single-target operations.",
    amount: allMatching
      ? OPERATION_ARITY_VALUE_CONSTANTS.allMatchingOperationBonus
      : Math.max(0, count ?? 0) * OPERATION_ARITY_VALUE_CONSTANTS.batchOperationBonus,
  }];
}

function temporaryDurationMetadataBands(value: PayloadRecord): NonNullable<OperationValueMetadata["bands"]> {
  if (value.temporary !== true && typeof value.duration !== "string" && typeof value.durationKind !== "string") {
    return [];
  }

  return [{
    id: "temporary_duration",
    label: typeof value.duration === "string"
      ? value.duration
      : typeof value.durationKind === "string"
        ? value.durationKind
        : "temporary",
    description: "Temporary effects are discounted by their declared duration window.",
    ...(typeof value.durationCount === "number" ? { amount: value.durationCount } : {}),
  }];
}

function delayedTriggerMetadataBands(value: PayloadRecord): NonNullable<OperationValueMetadata["bands"]> {
  const bands: NonNullable<OperationValueMetadata["bands"]> = [];
  const triggerSelector = isRecord(value.triggerSelector) ? value.triggerSelector : undefined;
  const triggerCount = triggerSelector && typeof triggerSelector.count === "number"
    ? triggerSelector.count
    : numberField(value, "triggerCount") ?? numberField(value, "count");
  const delayed = typeof value.timing === "string" && value.timing !== "immediate" ||
    triggerSelector !== undefined ||
    typeof value.hookBudgetCost === "number" ||
    typeof value.trigger === "string";

  if (delayed) {
    bands.push({
      id: "delayed_trigger_risk",
      label: triggerSelector && typeof triggerSelector.label === "string"
        ? triggerSelector.label
        : typeof value.trigger === "string"
          ? value.trigger
          : "delayed trigger",
      description: "Delayed trigger value records resolution risk and timing uncertainty.",
      amount: typeof value.hookBudgetCost === "number" ? -Math.abs(value.hookBudgetCost) : -8,
    });
  }

  if (triggerCount !== undefined) {
    bands.push({
      id: "hook_counter",
      label: semanticHookCounterBand(triggerCount),
      description: "Hook counter values use semantic bands so one, short, and long counters compare consistently.",
      amount: triggerCount,
    });
  }

  return bands;
}

function starterOperationMetadataBands(value: PayloadRecord): NonNullable<OperationValueMetadata["bands"]> {
  const kind = legacyKind(value);
  const bands: NonNullable<OperationValueMetadata["bands"]> = [];
  const predicate = isRecord(value.predicate) ? value.predicate : {};
  const isStarterPredicate = predicate.starter === true || value.starterTarget === true;
  const count =
    numericPayloadField(value, "targetCount") ??
    numericPayloadField(value, "count") ??
    numericPayloadField(value, "starterTargetCount");

  if (kind === "starter_cleanup") {
    bands.push({
      id: "starter_cleanup_reward",
      label: "starter cleanup reward",
      description: "starter cleanup is valued as deck cleanup rather than useful-card sacrifice.",
      ...(count ? { amount: count } : {}),
    });
  }

  if (kind === "starter_replacement") {
    bands.push({
      id: "starter_replacement",
      label: "starter replacement",
      description: "starter replacement combines cleanup relief with a replacement-card reward.",
      ...(count ? { amount: count } : {}),
    });
  }

  if (
    (kind === "card_purge" || kind === "card_transform" || kind === "card_replace") &&
    !isStarterPredicate
  ) {
    bands.push({
      id: "useful_card_sacrifice",
      label: "useful card sacrifice",
      description: "non-Starter deck card removal or conversion is tracked separately from starter cleanup.",
      amount: PURGE_VALUE_CONSTANTS.usefulNonStarterSacrifice,
    });
  }

  if (value.cleanupMode === "all" || value.replacementMode === "all" || value.transfigurationScope === "all_starters") {
    bands.push({
      id: "all_starters",
      label: "all starters",
      description: "the operation targets the whole current starter set.",
      ...(count ? { amount: count } : {}),
    });
  }

  return bands;
}

function dreamsignOperationMetadataBands(value: PayloadRecord): NonNullable<OperationValueMetadata["bands"]> {
  const kind = legacyKind(value);
  const bands: NonNullable<OperationValueMetadata["bands"]> = [];

  if (!kind?.startsWith("dreamsign_")) {
    return bands;
  }

  if (typeof value.dreamsignOperationFamily === "string") {
    bands.push({
      id: "dreamsign_operation_family",
      label: value.dreamsignOperationFamily,
      description: "Dreamsign operation value tracks the selected operation family.",
    });
  }

  if (value.selection === "hidden_random" || value.resultSelection === "hidden_random") {
    bands.push({
      id: "dreamsign_random_source",
      label: "random Dreamsign source",
      description: "Dreamsign value includes hidden-target uncertainty for random rewards or transforms.",
    });
  }

  if (value.temporary === true) {
    bands.push({
      id: "temporary_dreamsign",
      label: "temporary Dreamsign",
      description: "Dreamsign value is discounted for temporary grants.",
    });
  }

  if (isRecord(value.predicate)) {
    bands.push({
      id: "dreamsign_predicate",
      label: "Dreamsign predicate",
      description: "Dreamsign value records structured source, kind, tide, and orientation predicates.",
    });
  }

  return bands;
}

function baneOperationMetadataBands(value: PayloadRecord): NonNullable<OperationValueMetadata["bands"]> {
  const kind = legacyKind(value);
  const bands: NonNullable<OperationValueMetadata["bands"]> = [];

  if (!kind?.startsWith("bane_") && typeof value.baneName !== "string") {
    return bands;
  }

  if (typeof value.baneName === "string") {
    bands.push({
      id: "bane_name",
      label: value.baneName,
      description: "Bane value tracks the specific Bane name.",
    });
  }

  if (typeof value.count === "number") {
    bands.push({
      id: "bane_count",
      label: "Bane count",
      description: "Bane value scales by the number of copies gained or purged.",
      amount: value.count,
    });
  }

  if (value.temporary === true) {
    bands.push({
      id: "bane_temporary_duration",
      label: typeof value.duration === "string" ? value.duration : "temporary Bane",
      description: "Temporary Bane value is discounted by its duration.",
      ...(typeof value.durationCount === "number" ? { amount: value.durationCount } : {}),
    });
  }

  if (typeof value.timing === "string" && value.timing !== "immediate") {
    bands.push({
      id: "bane_delayed_timing",
      label: value.timing,
      description: "Delayed Bane value is discounted by the timing window.",
    });
  }

  if (kind === "bane_purge" || kind === "bane_random_purge" || kind === "bane_chosen_purge") {
    bands.push({
      id: "bane_purge_certainty",
      label: value.selection === "visible_random" || kind === "bane_random_purge"
        ? "random Bane purge"
        : value.selection === "chosen_after_commitment" || kind === "bane_chosen_purge"
          ? "chosen Bane purge"
          : "named Bane purge",
      description: "Bane purge value tracks whether the target is named, chosen, or random.",
    });
  }

  if (kind === "bane_replace" || typeof value.replacementKind === "string") {
    bands.push({
      id: "bane_replacement_relief",
      label: typeof value.replacementKind === "string" ? value.replacementKind : "Bane replacement",
      description: "Bane replacement value includes relief from converting a harmful Bane into a non-Bane object.",
      amount: BANE_VALUE_CONSTANTS.replacementRelief,
    });
  }

  return bands;
}

function resourceOperationMetadataBands(value: PayloadRecord): NonNullable<OperationValueMetadata["bands"]> {
  const bands: NonNullable<OperationValueMetadata["bands"]> = [];
  const semantics = resourceSemanticsFromPayload(value);
  const kind = legacyKind(value);

  if (!semantics && kind !== "gain_omens" && kind !== "omens" && kind !== "omen_loss") {
    return bands;
  }

  switch (semantics?.amountKind) {
    case "maximum":
      bands.push({
        id: "maximum",
        label: "maximum",
        description: "resource amount is evaluated against the current maximum.",
        ...(semantics.amount !== undefined ? { amount: semantics.amount } : {}),
        ...(semantics.maximum !== undefined ? { maximum: semantics.maximum } : {}),
      });
      break;
    case "percentage_of_current":
    case "percentage_of_maximum":
      bands.push({
        id: "percentage",
        label: semantics.amountKind === "percentage_of_current"
          ? "percentage of current"
          : "percentage of maximum",
        description: "resource amount is expressed as a percentage of a resource pool.",
        ...(semantics.percentage !== undefined ? { amount: semantics.percentage } : {}),
      });
      break;
    case "all_remaining":
      bands.push({
        id: "all_remaining",
        label: "all-remaining",
        description: "resource cost consumes all remaining resource at resolution.",
        ...(semantics.amount !== undefined ? { amount: semantics.amount } : {}),
      });
      break;
    case "random_range":
      bands.push({
        id: "random_range",
        label: "random-range",
        description: "resource amount is selected from an explicit random range.",
        ...(semantics.minimum !== undefined ? { minimum: semantics.minimum } : {}),
        ...(semantics.maximum !== undefined ? { maximum: semantics.maximum } : {}),
      });
      break;
    case "cap_change":
      bands.push({
        id: "cap_change",
        label: "cap-change",
        description: "resource effect changes a maximum resource cap.",
        ...(semantics.capDelta !== undefined ? { amount: semantics.capDelta } : {}),
      });
      break;
    case "restore_to_maximum":
      bands.push({
        id: "maximum",
        label: "restore to maximum",
        description: "resource reward restores current resource toward its maximum.",
        ...(semantics.amount !== undefined ? { amount: semantics.amount } : {}),
      });
      break;
    case "fixed":
    case "reward_reduction":
    case undefined:
      break;
  }

  if (
    (semantics?.resource === "omens" || kind === "gain_omens" || kind === "omens" || kind === "omen_loss") &&
    typeof value.amount === "number" &&
    value.amount > 1
  ) {
    bands.push({
      id: "multi_omen",
      label: "multi-omen",
      description: "omen effect is evaluated as a multi-omen bundle.",
      amount: value.amount,
    });
  }

  return bands;
}

function battleWindowMetadataBands(value: PayloadRecord): NonNullable<OperationValueMetadata["bands"]> {
  const kind = legacyKind(value);
  const bands: NonNullable<OperationValueMetadata["bands"]> = [];

  if (kind !== "battle_window_modifier" && typeof value.timedWindowScope !== "string") {
    return bands;
  }

  if (typeof value.battleWindowOperationKind === "string" || typeof value.windowModifier === "string") {
    bands.push({
      id: "battle_window_operation",
      label: typeof value.battleWindowOperationKind === "string"
        ? value.battleWindowOperationKind
        : value.windowModifier as string,
      description: "Battle-window value tracks the selected temporary rule mutation.",
      ...(typeof value.amount === "number" ? { amount: value.amount } : {}),
    });
  }

  if (typeof value.affectedPlayer === "string") {
    bands.push({
      id: "battle_window_player",
      label: value.affectedPlayer,
      description: "Battle-window value records whether the rule affects you, the opponent, or both players.",
    });
  }

  if (typeof value.polarity === "string") {
    bands.push({
      id: "battle_window_polarity",
      label: value.polarity,
      description: "Battle-window value records positive, negative, neutral, or mixed polarity.",
    });
  }

  return bands;
}

function dreamwellMetadataBands(value: PayloadRecord): NonNullable<OperationValueMetadata["bands"]> {
  const kind = legacyKind(value);
  const bands: NonNullable<OperationValueMetadata["bands"]> = [];

  if (kind !== "dreamwell_modifier") {
    return bands;
  }

  if (typeof value.count === "number") {
    bands.push({
      id: "dreamwell_count",
      label: `count:${value.count}`,
      description: "Dreamwell value tracks how many Dreamwell cards or draws are affected.",
      amount: value.count,
    });
  }

  if (typeof value.cardRole === "string") {
    bands.push({
      id: "dreamwell_card_role",
      label: value.cardRole,
      description: "Dreamwell value records whether affected cards are bonus, penalty, upgrade, delayed, or replacement cards.",
    });
  }

  if (typeof value.phaseSelector === "string") {
    bands.push({
      id: "dreamwell_phase_selector",
      label: value.phaseSelector,
      description: "Dreamwell value records which Dreamwell phase or draw selector is affected.",
    });
  }

  if (typeof value.playerVisibility === "string") {
    bands.push({
      id: "dreamwell_player_visibility",
      label: value.playerVisibility,
      description: "Dreamwell value records who can see the Dreamwell modifier before it resolves.",
    });
  }

  return bands;
}

function statusMetadataBands(value: PayloadRecord): NonNullable<OperationValueMetadata["bands"]> {
  if (typeof value.statusScope !== "string" && typeof value.ruleMutationKind !== "string") {
    return [];
  }

  const bands: NonNullable<OperationValueMetadata["bands"]> = [];

  if (typeof value.statusScope === "string") {
    bands.push({
      id: "status_scope",
      label: value.statusScope,
      description: "Status value records the rule scope affected by the status.",
    });
  }

  if (typeof value.ruleMutationKind === "string") {
    bands.push({
      id: "status_rule_mutation",
      label: value.ruleMutationKind,
      description: "Status value records which rule is modified or prohibited.",
    });
  }

  if (typeof value.prohibitionKind === "string") {
    bands.push({
      id: "status_prohibition",
      label: value.prohibitionKind,
      description: "Persistent prohibition status value records the prohibited action family.",
    });
  }

  if (typeof value.replacementKind === "string") {
    bands.push({
      id: "status_reward_replacement",
      label: value.replacementKind,
      description: "Reward-replacement status value records the promised replacement reward class.",
    });
  }

  if (typeof value.replacedRewardKind === "string") {
    bands.push({
      id: "reward_replacement",
      label: value.replacedRewardKind,
      description: "Reward-replacement burdens record which reward class is being reduced or replaced.",
      ...(typeof value.amount === "number" ? { amount: value.amount } : {}),
    });
  }

  return bands;
}

function routeMetadataBands(
  value: PayloadRecord,
  convertedEssence?: number,
): NonNullable<OperationValueMetadata["bands"]> {
  const bands: NonNullable<OperationValueMetadata["bands"]> = [];
  const scope = routePayloadScope(value);
  const polarity = typeof value.routePolarity === "string"
    ? value.routePolarity
    : typeof value.polarity === "string"
      ? value.polarity
      : undefined;

  if (scope) {
    bands.push({
      id: "route_scope",
      label: semanticRouteScopeBand(scope),
      description: "Route edit value scales by whether it affects the current dreamscape, future dreamscapes, or the full atlas.",
      amount: payloadConvertedAmount(value, convertedEssence),
    });
  }

  if (polarity) {
    bands.push({
      id: "route_polarity",
      label: polarity,
      description: "Route edit value records positive, negative, or mixed map impact.",
      amount: payloadConvertedAmount(value, convertedEssence),
    });
  }

  return bands;
}

function generatedObjectMetadataBands(value: PayloadRecord): NonNullable<OperationValueMetadata["bands"]> {
  if (
    typeof value.generatedObjectId !== "string" &&
    typeof value.generatedObjectKind !== "string" &&
    typeof value.generatedObjectName !== "string" &&
    typeof value.generatedObjectReferenceKind !== "string"
  ) {
    return [];
  }

  return [{
    id: "generated_object_confidence",
    label: value.generatedObjectReferenceKind === "placeholder"
      ? "low"
      : "medium",
    description: "Manifest-local generated object value records whether the referenced object is already defined or only promised.",
    amount: value.generatedObjectReferenceKind === "placeholder"
      ? OBJECT_QUALITY_VALUE_CONSTANTS.generatedObjectConfidence.low
      : OBJECT_QUALITY_VALUE_CONSTANTS.generatedObjectConfidence.medium,
  }];
}

function compoundMetadataBands(
  value: PayloadRecord,
  convertedEssence?: number,
): NonNullable<OperationValueMetadata["bands"]> {
  const bands: NonNullable<OperationValueMetadata["bands"]> = [];
  const componentRole = typeof value.compoundComponentRole === "string"
    ? value.compoundComponentRole
    : undefined;
  const arity = payloadOperationArity(value);

  if (componentRole) {
    bands.push({
      id: "compound_bundle",
      label: componentRole,
      description: "Compound bundle value exposes the cost, burden, primary reward, or follow-up component separately.",
      amount: payloadConvertedAmount(value, convertedEssence) ||
        COMPOUND_BUNDLE_VALUE_CONSTANTS.componentFloor,
    });
  }

  if (arity !== undefined) {
    bands.push({
      id: "operation_arity",
      label: semanticOperationArityBand(arity),
      description: "Compound and multi-operation payloads use operation-arity bands for comparability.",
      amount: arity,
    });
  }

  return bands;
}

function randomEnvelopeMetadataBands(value: PayloadRecord): NonNullable<OperationValueMetadata["bands"]> {
  const bands: NonNullable<OperationValueMetadata["bands"]> = [];
  const kind = legacyKind(value);

  if (kind && isRandomEnvelopePayloadKind(kind)) {
    bands.push({
      id: "random_envelope_risk",
      label: kind,
      description: "Random envelope value records expected value, worst case, and risk premium separately from fixed rewards.",
      amount: numberField(value, "riskPremiumConvertedEssence") ??
        numberField(value, "worstCaseBurdenConvertedEssence") ??
        -8,
    });
  }

  if (typeof value.minimum === "number" && typeof value.maximum === "number") {
    bands.push({
      id: "random_range",
      label: semanticRandomRangeBand(value.minimum, value.maximum),
      description: "Random range value bands compare ranges by variance rather than exact rolled values.",
      minimum: value.minimum,
      maximum: value.maximum,
    });
  }

  return bands;
}

function valueMetadata(convertedEssence?: number, payload?: PayloadRecord): OperationValueMetadata | undefined {
  const metadata: OperationValueMetadata = {
    ...(convertedEssence === undefined ? {} : { convertedEssence }),
  };

  if (payload) {
    const bands = [
      ...namedObjectMetadataBands(payload, convertedEssence),
      ...cardPredicateMetadataBands(payload),
      ...randomTargetMetadataBands(payload),
      ...batchOperationMetadataBands(payload),
      ...temporaryDurationMetadataBands(payload),
      ...starterOperationMetadataBands(payload),
      ...dreamsignOperationMetadataBands(payload),
      ...baneOperationMetadataBands(payload),
      ...resourceOperationMetadataBands(payload),
      ...battleWindowMetadataBands(payload),
      ...dreamwellMetadataBands(payload),
      ...statusMetadataBands(payload),
      ...routeMetadataBands(payload, convertedEssence),
      ...delayedTriggerMetadataBands(payload),
      ...randomEnvelopeMetadataBands(payload),
      ...generatedObjectMetadataBands(payload),
      ...compoundMetadataBands(payload, convertedEssence),
    ];

    if (bands.length > 0) {
      metadata.bands = bands;
    }

    const expectedConvertedEssence = numberField(payload, "expectedConvertedEssence");
    const worstCaseBurdenConvertedEssence = numberField(payload, "worstCaseBurdenConvertedEssence");
    const riskPremiumConvertedEssence = numberField(payload, "riskPremiumConvertedEssence");

    if (expectedConvertedEssence !== undefined) {
      metadata.expectedConvertedEssence = expectedConvertedEssence;
    }

    if (worstCaseBurdenConvertedEssence !== undefined) {
      metadata.worstCaseBurdenConvertedEssence = worstCaseBurdenConvertedEssence;
    }

    if (riskPremiumConvertedEssence !== undefined) {
      metadata.riskPremiumConvertedEssence = riskPremiumConvertedEssence;
      metadata.uncertaintyConvertedEssence = riskPremiumConvertedEssence;
    } else if (
      (payload.selection === "hidden_random" || booleanField(payload, "random") === true) &&
      convertedEssence !== undefined
    ) {
      metadata.uncertaintyConvertedEssence = CARD_VALUE_CONSTANTS.hiddenRandomPenalty;
    }
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function randomValueMetadata(value: unknown): OperationValueMetadata | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const bands = randomEnvelopeMetadataBands(value);
  const metadata: OperationValueMetadata = {
    ...(typeof value.expectedConvertedEssence === "number"
      ? { expectedConvertedEssence: value.expectedConvertedEssence }
      : {}),
    ...(typeof value.worstCaseBurdenConvertedEssence === "number"
      ? { worstCaseBurdenConvertedEssence: value.worstCaseBurdenConvertedEssence }
      : {}),
    ...(typeof value.riskPremiumConvertedEssence === "number"
      ? {
          riskPremiumConvertedEssence: value.riskPremiumConvertedEssence,
          uncertaintyConvertedEssence: value.riskPremiumConvertedEssence,
        }
      : {}),
    ...(bands.length > 0 ? { bands } : {}),
  };

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function adaptCost(value: unknown, operationId: string, convertedEssence?: number): JourneyOperation {
  const kind = legacyKind(value);
  const resource = kind === "omens" ? "omens" : "essence";
  const metadata = valueMetadata(convertedEssence, isRecord(value) ? value : undefined);

  return {
    operationId,
    operationKind: "cost",
    role: "cost",
    costKind: "resource",
    resource,
    amount: resourceAmount(value),
    timing: { timingKind: "immediate" },
    visibility: "visible",
    ...(resourceSemanticsFromPayload(value) ? { resourceSemantics: resourceSemanticsFromPayload(value) } : {}),
    ...(metadata ? { value: metadata } : {}),
    ...(kind ? { legacyKind: kind } : {}),
    payload: clonePayload(value),
  };
}

function rewardKind(kind: string | undefined): Extract<JourneyOperation, { operationKind: "reward" }>["rewardKind"] {
  switch (kind) {
    case "gain_essence":
    case "gain_omens":
    case "resource_restore_to_maximum":
    case "resource_percentage":
    case "resource_random_range":
      return "resource";
    case "resource_cap_change":
      return "resource_cap_change";
    case "bane_purge":
    case "bane_random_purge":
    case "bane_chosen_purge":
    case "bane_replace":
    case "bane_transform_to_card":
      return kind;
    case "card_draft":
    case "dreamsign_draft":
    case "dreamsign_gain":
    case "dreamsign_purchase":
    case "dreamsign_loss":
    case "dreamsign_purge":
    case "dreamsign_duplicate":
    case "dreamsign_transform":
    case "dreamsign_temporary_grant":
    case "dreamsign_copy_gain":
    case "dreamsign_pool_edit":
    case "dreamsign_trigger_counter":
    case "dreamsign_random_reward":
    case "dreamsign_trade_hook":
    case "shop_economy_modifier":
    case "dreamwell_modifier":
    case "starter_cleanup":
    case "starter_replacement":
    case "card_gain":
    case "card_purge":
    case "card_transform":
    case "card_replace":
    case "card_transfigure":
    case "card_text_modification":
    case "card_type_change":
    case "card_keyword_add":
    case "card_keyword_remove":
    case "card_opening_hand":
    case "card_merge":
    case "card_split":
    case "card_temporary_copy":
    case "card_delayed_transformation":
    case "transfiguration":
    case "card_rewrite":
    case "card_duplicate":
    case "battle_window_modifier":
    case "random_reward":
    case "random_series":
    case "generated_object_create":
    case "generated_object_grant":
    case "generated_object_transform":
    case "generated_object_temporary_grant":
    case "generated_object_return":
    case "generated_object_trade":
      return kind;
    default:
      return "unknown";
  }
}

function statusKind(kind: string | undefined): string {
  return kind ?? "status_rule_mutation";
}

function isStatusPayload(value: unknown): boolean {
  const kind = legacyKind(value) ?? "";

  return kind.startsWith("status_") ||
    kind.includes("_rule") ||
    kind === "reward_replacement" ||
    (isRecord(value) && typeof value.statusScope === "string");
}

function adaptReward(
  value: unknown,
  operationId: string,
  convertedEssence?: number,
  visibility: "visible" | "precommitted" = "visible",
): RewardOperation {
  const kind = legacyKind(value);
  const targetSelector = targetSelectorFromPayload(value);
  const metadata = valueMetadata(convertedEssence, isRecord(value) ? value : undefined);

  return {
    operationId,
    operationKind: "reward",
    role: "reward",
    rewardKind: rewardKind(kind),
    visibility,
    ...(timingFromPayload(value) ? { timing: timingFromPayload(value) } : {}),
    ...(targetSelector ? { targetSelector } : {}),
    ...(resourceSemanticsFromPayload(value) ? { resourceSemantics: resourceSemanticsFromPayload(value) } : {}),
    ...(metadata ? { value: metadata } : {}),
    ...(kind ? { legacyKind: kind } : {}),
    payload: clonePayload(value),
  };
}

function adaptStatus(value: unknown, operationId: string, convertedEssence?: number): JourneyOperation {
  return adaptStatusWithVisibility(value, operationId, convertedEssence, "visible");
}

function adaptStatusWithVisibility(
  value: unknown,
  operationId: string,
  convertedEssence: number | undefined,
  visibility: "visible" | "precommitted",
): JourneyOperation {
  const kind = legacyKind(value);
  const payload = clonePayload(value);
  const targetSelector = targetSelectorFromPayload(value);

  return {
    operationId,
    operationKind: "status",
    role: payload.polarity === "negative" ? "burden" : "reward",
    statusKind: statusKind(kind),
    visibility,
    ...(timingFromPayload(value) ? { timing: timingFromPayload(value) } : { timing: { timingKind: "immediate" } }),
    ...(targetSelector ? { targetSelector } : {}),
    ...(valueMetadata(convertedEssence, isRecord(value) ? value : undefined)
      ? { value: valueMetadata(convertedEssence, isRecord(value) ? value : undefined) }
      : {}),
    ...(kind ? { legacyKind: kind } : {}),
    payload,
  };
}

function adaptEffect(
  value: unknown,
  operationId: string,
  convertedEssence?: number,
  visibility: "visible" | "precommitted" = "visible",
): JourneyOperation {
  return isRecord(value) && isRandomEnvelopePayloadKind(legacyKind(value))
    ? adaptRandomEnvelope(value, operationId, visibility)
    : isRecord(value) &&
        legacyKind(value) === "dreamwell_modifier" &&
        ((value.cardRole === "penalty" && value.polarity !== "positive") ||
          value.polarity === "negative" ||
          (typeof value.windowValue === "number" && value.windowValue < 0))
    ? adaptBurden(value, operationId, convertedEssence, visibility)
    : isStatusPayload(value)
    ? adaptStatusWithVisibility(value, operationId, convertedEssence, visibility)
    : adaptReward(value, operationId, convertedEssence, visibility);
}

function adaptBurden(
  value: unknown,
  operationId: string,
  convertedEssence?: number,
  visibility: "visible" | "precommitted" = "visible",
): JourneyOperation {
  if (isStatusPayload(value)) {
    return adaptStatusWithVisibility(value, operationId, convertedEssence, visibility);
  }

  const kind = legacyKind(value);
  const burdenKind = kind === "bane_gain"
    ? isRecord(value) && value.temporary === true
      ? "bane_temporary"
      : isRecord(value) && typeof value.timing === "string" && value.timing !== "immediate"
        ? "bane_delayed"
        : "bane_gain"
    : kind === "card_purge" || kind === "card_transform" || kind === "card_replace"
      ? "card_sacrifice"
    : kind === "dreamsign_loss" || kind === "dreamsign_purge"
      ? "dreamsign_sacrifice"
    : kind === "dreamwell_modifier"
      ? "dreamwell_modifier"
    : kind === "resource_reward_reduction"
      ? "reward_reduction"
      : kind === "omen_loss" || kind === "essence_loss" || kind === "resource_cap_change"
        ? "resource_loss"
        : "unknown";
  const targetSelector = burdenKind === "bane_gain" || burdenKind === "bane_temporary" || burdenKind === "bane_delayed"
    ? {
        selectorKind: "bane" as const,
        selection: isRecord(value) && value.selection === "visible_random" ? "visible_random" as const : "exact" as const,
        referenceKind: "controlled_vocabulary" as const,
        source: isRecord(value) ? baneSourceFromPayload(value) : "future_burden" as const,
        names: [isRecord(value) && typeof value.baneName === "string" ? value.baneName : DEFAULT_BANE_NAME],
      }
    : undefined;
  const nonBaneTargetSelector = targetSelectorFromPayload(value);
  const resolvedTargetSelector = targetSelector ?? nonBaneTargetSelector;

  return {
    operationId,
    operationKind: "burden",
    role: "burden",
    burdenKind,
    ...(timingFromPayload(value) ? { timing: timingFromPayload(value) } : { timing: { timingKind: "immediate" } }),
    visibility,
    ...(resolvedTargetSelector ? { targetSelector: resolvedTargetSelector } : {}),
    ...(resourceSemanticsFromPayload(value) ? { resourceSemantics: resourceSemanticsFromPayload(value) } : {}),
    ...(valueMetadata(convertedEssence, isRecord(value) ? value : undefined)
      ? { value: valueMetadata(convertedEssence, isRecord(value) ? value : undefined) }
      : {}),
    ...(kind ? { legacyKind: kind } : {}),
    payload: clonePayload(value),
  };
}

function adaptTarget(value: unknown, operationId: string): JourneyOperation {
  const selector = targetSelectorFromTarget(value);
  const kind = legacyKind(value);

  return {
    operationId,
    operationKind: "target",
    role: "target",
    targetSelector: selector,
    visibility: "visible",
    ...(kind ? { legacyKind: kind } : {}),
    payload: clonePayload(value),
  };
}

function adaptTrigger(value: unknown, operationId: string): JourneyOperation {
  const contract = delayedHookContractFromPayload(value);
  const triggerSelector = contract?.triggerSelector ?? hookTriggerSelectorFromPayload(value);
  const kind = triggerSelector?.triggerKind ?? legacyKind(value) ?? "delayed_trigger";
  const rewardOperations = rewardPayloadsFromDelayedPrecommit(value)
    .map((reward, index) =>
      adaptHookResolutionPayload(reward, `${operationId}:reward:${index + 1}`)
    );
  const payload = clonePayload(value);
  const metadata = valueMetadata(undefined, isRecord(value) ? value : undefined);
  if (rewardOperations.length > 0) {
    payload.rewardOperations = rewardOperations;
  }

  return {
    operationId,
    operationKind: "delayed_hook",
    role: "trigger",
    hookKind: kind,
    timing: { timingKind: "delayed", trigger: triggerSelector?.label ?? kind },
    visibility: "visible",
    ...(triggerSelector ? { triggerSelector } : {}),
    ...(contract?.trackedCondition ? { trackedCondition: contract.trackedCondition } : {}),
    ...(contract?.resolution ? { resolution: contract.resolution } : {}),
    ...(contract?.expiration ?? hookExpirationFromPayload(value)
      ? { expiration: contract?.expiration ?? hookExpirationFromPayload(value) }
      : {}),
    ...(contract?.duration ?? hookDurationFromPayload(value)
      ? { duration: contract?.duration ?? hookDurationFromPayload(value) }
      : {}),
    ...(contract?.controlledScene ?? hookControlledSceneFromPayload(value)
      ? { controlledScene: contract?.controlledScene ?? hookControlledSceneFromPayload(value) }
      : {}),
    ...(contract?.visibilityPolicy ?? hookVisibilityFromPayload(value)
      ? { visibilityPolicy: contract?.visibilityPolicy ?? hookVisibilityFromPayload(value) }
      : {}),
    ...(contract?.hookBudgetCost !== undefined
      ? { hookBudgetCost: contract.hookBudgetCost }
      : isRecord(value) && typeof value.hookBudgetCost === "number"
        ? { hookBudgetCost: value.hookBudgetCost }
        : {}),
    ...(rewardOperations.length > 0 ? { rewardOperations } : {}),
    ...(metadata ? { value: metadata } : {}),
    legacyKind: kind,
    payload,
  };
}

function adaptRouteEdit(
  value: unknown,
  operationId: string,
  convertedEssence?: number,
  visibility: OperationVisibility = "visible",
): JourneyOperation {
  const kind = legacyKind(value);
  const payload = clonePayload(value);
  const timing = isRecord(value) && typeof value.timing === "string" ? value.timing : "";
  const targetSelector = targetSelectorFromPayload(value);
  const editKind =
    payload.routeOperationKind === "add_site" || kind === "route_add_site"
      ? "add_site"
      : payload.routeOperationKind === "remove_site" || kind === "route_remove_site"
        ? "remove_site"
        : payload.routeOperationKind === "purge_site" || kind === "route_purge_site"
          ? "purge_site"
          : payload.routeOperationKind === "probability_adjustment" || kind === "route_probability_adjustment"
            ? "probability_adjustment"
            : kind?.includes("replacement") || payload.routeOperationKind === "replace_site"
              ? "replace_site"
              : "unknown";
  const payloadValue = typeof payload.siteDeltaValue === "number"
    ? payload.siteDeltaValue
    : typeof payload.value === "number"
      ? payload.value
      : undefined;

  return {
    operationId,
    operationKind: "route_edit",
    role: "route_edit",
    editKind,
    visibility,
    timing: {
      timingKind: "route",
      scope: isRecord(value) ? routeScopeFromPayload(value) : "current_dreamscape",
      ...(timing ? { label: timing } : {}),
    },
    ...(targetSelector ? { targetSelector } : {}),
    ...(isRecord(value) && typeof value.fromSite === "string" ? { fromSite: value.fromSite } : {}),
    ...(isRecord(value) && typeof value.toSite === "string" ? { toSite: value.toSite } : {}),
    ...(valueMetadata(convertedEssence ?? payloadValue, isRecord(value) ? value : undefined)
      ? { value: valueMetadata(convertedEssence ?? payloadValue, isRecord(value) ? value : undefined) }
      : {}),
    ...(kind ? { legacyKind: kind } : {}),
    payload,
  };
}

function adaptRandomEnvelope(
  value: unknown,
  operationId: string,
  visibility: OperationVisibility = "precommitted",
): JourneyOperation {
  const kind = legacyKind(value) ?? (Array.isArray(value) ? "random_series" : "random_outcome");
  const operationKind = kind.includes("reveal") ? "reveal_envelope" : "random_envelope";
  const visibilityLabel = isRecord(value) && isRecord(value.visibilityPolicy) && typeof value.visibilityPolicy.outcomeVisibility === "string"
    ? value.visibilityPolicy.outcomeVisibility
    : undefined;
  const timing = visibilityLabel === "delayed" || visibilityLabel === "hidden_until_resolution"
    ? { timingKind: "delayed" as const, trigger: "random resolution", label: visibilityLabel }
    : { timingKind: "random" as const };

  return {
    operationId,
    operationKind,
    role: "random",
    envelopeKind: kind,
    timing,
    visibility,
    ...(oddsFromPayload(value) ? { odds: oddsFromPayload(value) } : {}),
    ...(randomValueMetadata(value) ? { value: randomValueMetadata(value) } : {}),
    legacyKind: kind,
    payload: clonePayload(value),
  };
}

function rewardPayloadsFromDelayedPrecommit(value: unknown): unknown[] {
  if (!isRecord(value) || value.reward === undefined) {
    return [];
  }

  return Array.isArray(value.reward) ? value.reward : [value.reward];
}

function isRouteEditPayload(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const kind = legacyKind(value) ?? "";

  return kind.startsWith("route_") || typeof value.routeOperationKind === "string";
}

function adaptHookResolutionPayload(
  value: unknown,
  operationId: string,
): JourneyOperation {
  if (isRouteEditPayload(value)) {
    return adaptRouteEdit(value, operationId, undefined, "precommitted");
  }

  if (
    isRecord(value) &&
    (
      legacyKind(value) === "bane_gain" ||
      (
        legacyKind(value) === "dreamwell_modifier" &&
        value.cardRole === "penalty"
      )
    )
  ) {
    return adaptBurden(value, operationId, undefined, "precommitted");
  }

  return adaptEffect(value, operationId, undefined, "precommitted");
}

function hookTriggerSelectorFromPayload(value: unknown): HookTriggerSelector | undefined {
  return isRecord(value) && isRecord(value.triggerSelector)
    ? value.triggerSelector as HookTriggerSelector
    : undefined;
}

function hookExpirationFromPayload(value: unknown): HookExpirationPolicy | undefined {
  return isRecord(value) && isRecord(value.expiration)
    ? value.expiration as HookExpirationPolicy
    : undefined;
}

function hookDurationFromPayload(value: unknown): BoundedDuration | undefined {
  return isRecord(value) && isRecord(value.duration)
    ? value.duration as BoundedDuration
    : undefined;
}

function hookControlledSceneFromPayload(value: unknown): HookControlledScene | undefined {
  return isRecord(value) && isRecord(value.controlledScene)
    ? value.controlledScene as HookControlledScene
    : undefined;
}

function hookVisibilityFromPayload(value: unknown): HookVisibilityPolicy | undefined {
  return isRecord(value) && isRecord(value.visibilityPolicy)
    ? value.visibilityPolicy as HookVisibilityPolicy
    : undefined;
}

function delayedHookContractFromPayload(value: unknown): DelayedHookContract | undefined {
  return isRecord(value) &&
    typeof value.hookId === "string" &&
    isRecord(value.triggerSelector) &&
    typeof value.trackedCondition === "string" &&
    typeof value.resolution === "string" &&
    isRecord(value.expiration) &&
    isRecord(value.duration) &&
    isRecord(value.controlledScene) &&
    isRecord(value.visibilityPolicy) &&
    typeof value.hookBudgetCost === "number"
    ? {
        hookId: value.hookId,
        ...(typeof value.optionNumber === "number" ? { optionNumber: value.optionNumber } : {}),
        triggerSelector: value.triggerSelector as HookTriggerSelector,
        trackedCondition: value.trackedCondition,
        resolution: value.resolution,
        expiration: value.expiration as HookExpirationPolicy,
        duration: value.duration as BoundedDuration,
        controlledScene: value.controlledScene as HookControlledScene,
        visibilityPolicy: value.visibilityPolicy as HookVisibilityPolicy,
        hookBudgetCost: value.hookBudgetCost,
      }
    : undefined;
}

function adaptDelayedPrecommit(value: unknown, operationId: string): JourneyOperation {
  const contract = delayedHookContractFromPayload(value);
  const triggerSelector = contract?.triggerSelector ?? hookTriggerSelectorFromPayload(value);
  const trigger = triggerSelector?.label ??
    (isRecord(value) && typeof value.trigger === "string"
      ? value.trigger
      : "committed trigger");
  const rewardOperations = rewardPayloadsFromDelayedPrecommit(value)
    .map((reward, index) => {
      const nestedOperationId = `${operationId}:reward:${index + 1}`;

      return adaptHookResolutionPayload(reward, nestedOperationId);
    });
  const payload = clonePayload(value);
  delete payload.reward;
  const metadata = valueMetadata(undefined, isRecord(value) ? value : undefined);
  if (rewardOperations.length > 0) {
    payload.rewardOperations = rewardOperations;
  }

  return {
    operationId,
    operationKind: "delayed_hook",
    role: "delayed_hook",
    hookKind: triggerSelector?.triggerKind ?? trigger,
    timing: { timingKind: "delayed", trigger },
    visibility: "precommitted",
    ...(triggerSelector ? { triggerSelector } : {}),
    ...(contract?.trackedCondition ? { trackedCondition: contract.trackedCondition } : {}),
    ...(contract?.resolution ? { resolution: contract.resolution } : {}),
    ...(contract?.expiration ?? hookExpirationFromPayload(value)
      ? { expiration: contract?.expiration ?? hookExpirationFromPayload(value) }
      : {}),
    ...(contract?.duration ?? hookDurationFromPayload(value)
      ? { duration: contract?.duration ?? hookDurationFromPayload(value) }
      : {}),
    ...(contract?.controlledScene ?? hookControlledSceneFromPayload(value)
      ? { controlledScene: contract?.controlledScene ?? hookControlledSceneFromPayload(value) }
      : {}),
    ...(contract?.visibilityPolicy ?? hookVisibilityFromPayload(value)
      ? { visibilityPolicy: contract?.visibilityPolicy ?? hookVisibilityFromPayload(value) }
      : {}),
    ...(contract?.hookBudgetCost !== undefined
      ? { hookBudgetCost: contract.hookBudgetCost }
      : isRecord(value) && typeof value.hookBudgetCost === "number"
        ? { hookBudgetCost: value.hookBudgetCost }
        : {}),
    ...(rewardOperations.length > 0 ? { rewardOperations } : {}),
    ...(metadata ? { value: metadata } : {}),
    payload,
  };
}

function adaptRecordArray(
  values: readonly unknown[],
  prefix: string,
  adapter: (value: unknown, operationId: string, convertedEssence?: number) => JourneyOperation,
  convertedEssence?: number,
): JourneyOperation[] {
  return values.map((value, index) =>
    adapter(
      value,
      `${prefix}:${index + 1}`,
      convertedEssence ?? explicitPayloadConvertedEssence(value),
    )
  );
}

export function buildJourneyOptionOperations(option: Omit<JourneyOption, "operations" | "symbols">): JourneyOperation[] {
  const costValue = option.costs.length === 1 ? option.costConvertedEssence : undefined;
  const effectValue = option.effects.length === 1 ? option.effectConvertedEssence : undefined;
  const burdenValue = option.burdens.length === 1 ? option.burdenConvertedEssence : undefined;
  const routeValue = option.routeEffects.length === 1 ? option.effectConvertedEssence : undefined;

  return [
    ...adaptRecordArray(option.costs, `option:${option.number}:cost`, adaptCost, costValue),
    ...adaptRecordArray(option.effects, `option:${option.number}:effect`, adaptEffect, effectValue),
    ...adaptRecordArray(option.burdens, `option:${option.number}:burden`, adaptBurden, burdenValue),
    ...adaptRecordArray(option.targets, `option:${option.number}:target`, adaptTarget),
    ...adaptRecordArray(option.triggers, `option:${option.number}:trigger`, adaptTrigger),
    ...adaptRecordArray(option.routeEffects, `option:${option.number}:route`, adaptRouteEdit, routeValue),
  ];
}

export function buildTreeTerminalOperations(
  terminal: Omit<JourneyTreeTerminal, "operations">,
  prefix: string,
): JourneyOperation[] {
  return [
    ...adaptRecordArray(terminal.costs, `${prefix}:cost`, adaptCost),
    ...adaptRecordArray(terminal.effects, `${prefix}:effect`, adaptEffect),
    ...adaptRecordArray(terminal.burdens, `${prefix}:burden`, adaptBurden),
    ...adaptRecordArray(terminal.targets, `${prefix}:target`, adaptTarget),
    ...adaptRecordArray(terminal.routeEffects, `${prefix}:route`, adaptRouteEdit),
  ];
}

export function buildTreeBranchOperations(branch: Omit<JourneyTreeBranch, "operations">): JourneyOperation[] {
  return [
    ...adaptRecordArray(branch.costs, `tree:${branch.id}:cost`, adaptCost, branch.costConvertedEssence),
    ...adaptRecordArray(branch.effects, `tree:${branch.id}:effect`, adaptEffect, branch.effectConvertedEssence),
    ...adaptRecordArray(branch.burdens, `tree:${branch.id}:burden`, adaptBurden, branch.burdenConvertedEssence),
    ...adaptRecordArray(branch.targets, `tree:${branch.id}:target`, adaptTarget),
    ...adaptRecordArray(branch.triggers, `tree:${branch.id}:trigger`, adaptTrigger),
    ...adaptRecordArray(branch.routeEffects, `tree:${branch.id}:route`, adaptRouteEdit, branch.effectConvertedEssence),
  ];
}

export function buildRewardPoolOperations(pool: Omit<JourneyRewardPool, "operations">): JourneyOperation[] {
  return adaptRecordArray(
    pool.rewards,
    "reward-pool:reward",
    (value, operationId) => adaptHookResolutionPayload(value, operationId),
  );
}

export function buildPrecommittedOperations(precommitted: Omit<PrecommittedOutcomes, "operations">): JourneyOperation[] {
  return [
    ...adaptRecordArray(
      precommitted.random ?? [],
      "precommitted:random",
      (value, operationId) => adaptRandomEnvelope(value, operationId),
    ),
    ...adaptRecordArray(precommitted.delayed ?? [], "precommitted:delayed", adaptDelayedPrecommit),
    ...adaptRecordArray(precommitted.routeEdits ?? [], "precommitted:route", adaptRouteEdit),
  ];
}
