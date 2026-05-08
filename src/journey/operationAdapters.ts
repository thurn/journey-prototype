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
  PairedReturnContract,
  TargetSelectionMode,
  TargetSelector,
} from "./manifest.js";
import { DEFAULT_BANE_NAME } from "./effects.js";
import {
  CARD_VALUE_CONSTANTS,
  PURGE_VALUE_CONSTANTS,
  cardPredicateSpecificityValue,
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
    return {
      selectorKind: "bane",
      selection,
      referenceKind: "controlled_vocabulary",
      ...(source === "vocabulary" || source === "state" ? { source } : {}),
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
    const targetContext = value.baneTargetContext === "current_state" ? "state" : "vocabulary";
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

    if (value.kind === "dreamsign_draft" || source === "pool" || source === "active") {
      return {
        selectorKind: "dreamsign",
        selection: "predicate",
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
    kind === "wager" ||
    kind === "probability_ladder" ||
    kind === "push_choice" ||
    kind === "complete_decision_tree" ||
    kind === "resolved_random_series";
}

function resourceAmount(value: unknown): number {
  return isRecord(value) && typeof value.amount === "number" ? value.amount : 0;
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

function numericPayloadField(value: PayloadRecord, key: string): number | undefined {
  return typeof value[key] === "number" ? value[key] : undefined;
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

function valueMetadata(convertedEssence?: number, payload?: PayloadRecord): OperationValueMetadata | undefined {
  const metadata: OperationValueMetadata = {
    ...(convertedEssence === undefined ? {} : { convertedEssence }),
  };

  if (payload) {
    const bands = [
      ...cardPredicateMetadataBands(payload),
      ...starterOperationMetadataBands(payload),
    ];

    if (bands.length > 0) {
      metadata.bands = bands;
    }

    const expectedConvertedEssence = numberField(payload, "expectedConvertedEssence");
    const riskPremiumConvertedEssence = numberField(payload, "riskPremiumConvertedEssence");

    if (expectedConvertedEssence !== undefined) {
      metadata.expectedConvertedEssence = expectedConvertedEssence;
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

  const metadata: OperationValueMetadata = {
    ...(typeof value.expectedConvertedEssence === "number"
      ? { expectedConvertedEssence: value.expectedConvertedEssence }
      : {}),
    ...(typeof value.riskPremiumConvertedEssence === "number"
      ? {
          riskPremiumConvertedEssence: value.riskPremiumConvertedEssence,
          uncertaintyConvertedEssence: value.riskPremiumConvertedEssence,
        }
      : {}),
  };

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function adaptCost(value: unknown, operationId: string, convertedEssence?: number): JourneyOperation {
  const kind = legacyKind(value);
  const resource = kind === "omens" ? "omens" : "essence";
  const metadata = valueMetadata(convertedEssence);

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
    ...(valueMetadata(convertedEssence) ? { value: valueMetadata(convertedEssence) } : {}),
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
  const kind = legacyKind(value);
  const burdenKind = kind === "bane_gain"
    ? isRecord(value) && value.temporary === true
      ? "bane_temporary"
      : isRecord(value) && typeof value.timing === "string" && value.timing !== "immediate"
        ? "bane_delayed"
        : "bane_gain"
    : kind === "dreamwell_modifier"
      ? "dreamwell_modifier"
    : kind === "resource_reward_reduction"
      ? "reward_reduction"
      : kind === "omen_loss" || kind === "essence_loss"
        ? "resource_loss"
        : "unknown";
  const targetSelector = burdenKind === "bane_gain" || burdenKind === "bane_temporary" || burdenKind === "bane_delayed"
    ? {
        selectorKind: "bane" as const,
        selection: isRecord(value) && value.selection === "visible_random" ? "visible_random" as const : "exact" as const,
        referenceKind: "controlled_vocabulary" as const,
        source: isRecord(value) && value.baneTargetContext === "current_state" ? "state" as const : "vocabulary" as const,
        names: [isRecord(value) && typeof value.baneName === "string" ? value.baneName : DEFAULT_BANE_NAME],
      }
    : undefined;

  return {
    operationId,
    operationKind: "burden",
    role: "burden",
    burdenKind,
    ...(timingFromPayload(value) ? { timing: timingFromPayload(value) } : { timing: { timingKind: "immediate" } }),
    visibility,
    ...(targetSelector ? { targetSelector } : {}),
    ...(resourceSemanticsFromPayload(value) ? { resourceSemantics: resourceSemanticsFromPayload(value) } : {}),
    ...(valueMetadata(convertedEssence) ? { value: valueMetadata(convertedEssence) } : {}),
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
    legacyKind: kind,
    payload: clonePayload(value),
  };
}

function adaptRouteEdit(value: unknown, operationId: string, convertedEssence?: number): JourneyOperation {
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
    visibility: "visible",
    timing: {
      timingKind: "route",
      scope: isRecord(value) ? routeScopeFromPayload(value) : "current_dreamscape",
      ...(timing ? { label: timing } : {}),
    },
    ...(targetSelector ? { targetSelector } : {}),
    ...(isRecord(value) && typeof value.fromSite === "string" ? { fromSite: value.fromSite } : {}),
    ...(isRecord(value) && typeof value.toSite === "string" ? { toSite: value.toSite } : {}),
    ...(valueMetadata(convertedEssence ?? payloadValue) ? { value: valueMetadata(convertedEssence ?? payloadValue) } : {}),
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

      return isRecord(reward) && reward.kind === "dreamwell_modifier" && reward.cardRole === "penalty"
        ? adaptBurden(reward, nestedOperationId, undefined, "precommitted")
        : adaptEffect(reward, nestedOperationId, undefined, "precommitted");
    });
  const payload = clonePayload(value);
  delete payload.reward;
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
    payload,
  };
}

function pairedReturnContractFromPayload(value: unknown): PairedReturnContract | undefined {
  return isRecord(value) &&
    typeof value.pairedReturnId === "string" &&
    typeof value.anchor === "string" &&
    isRecord(value.created) &&
    isRecord(value.returnScene) &&
    isRecord(value.visibilityPolicy)
    ? {
        pairedReturnId: value.pairedReturnId,
        ...(typeof value.optionNumber === "number" ? { optionNumber: value.optionNumber } : {}),
        anchor: value.anchor,
        created: value.created as PairedReturnContract["created"],
        returnScene: value.returnScene as PairedReturnContract["returnScene"],
        visibilityPolicy: value.visibilityPolicy as HookVisibilityPolicy,
      }
    : undefined;
}

function adaptPairedReturn(value: unknown, operationId: string): JourneyOperation {
  const contract = pairedReturnContractFromPayload(value);

  return {
    operationId,
    operationKind: "paired_return",
    role: "paired_return",
    visibility: "precommitted",
    ...(contract?.anchor
      ? { anchor: contract.anchor }
      : isRecord(value) && typeof value.anchor === "string"
        ? { anchor: value.anchor }
        : {}),
    ...(contract ? { contract } : {}),
    payload: clonePayload(value),
  };
}

function adaptRecordArray(
  values: readonly unknown[],
  prefix: string,
  adapter: (value: unknown, operationId: string, convertedEssence?: number) => JourneyOperation,
  convertedEssence?: number,
): JourneyOperation[] {
  return values.map((value, index) =>
    adapter(value, `${prefix}:${index + 1}`, convertedEssence)
  );
}

export function adaptJourneyOptionOperations(option: Omit<JourneyOption, "operations" | "symbols">): JourneyOperation[] {
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

export function adaptTreeTerminalOperations(
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

export function adaptTreeBranchOperations(branch: Omit<JourneyTreeBranch, "operations">): JourneyOperation[] {
  return [
    ...adaptRecordArray(branch.costs, `tree:${branch.id}:cost`, adaptCost, branch.costConvertedEssence),
    ...adaptRecordArray(branch.effects, `tree:${branch.id}:effect`, adaptEffect, branch.effectConvertedEssence),
    ...adaptRecordArray(branch.burdens, `tree:${branch.id}:burden`, adaptBurden, branch.burdenConvertedEssence),
    ...adaptRecordArray(branch.targets, `tree:${branch.id}:target`, adaptTarget),
    ...adaptRecordArray(branch.triggers, `tree:${branch.id}:trigger`, adaptTrigger),
    ...adaptRecordArray(branch.routeEffects, `tree:${branch.id}:route`, adaptRouteEdit, branch.effectConvertedEssence),
  ];
}

export function adaptRewardPoolOperations(pool: Omit<JourneyRewardPool, "operations">): JourneyOperation[] {
  return adaptRecordArray(
    pool.rewards,
    "reward-pool:reward",
    (value, operationId) => adaptReward(value, operationId, undefined, "precommitted"),
  );
}

export function adaptPrecommittedOperations(precommitted: Omit<PrecommittedOutcomes, "operations">): JourneyOperation[] {
  return [
    ...adaptRecordArray(
      precommitted.random ?? [],
      "precommitted:random",
      (value, operationId) => adaptRandomEnvelope(value, operationId),
    ),
    ...adaptRecordArray(precommitted.delayed ?? [], "precommitted:delayed", adaptDelayedPrecommit),
    ...adaptRecordArray(precommitted.pairedReturn ?? [], "precommitted:paired-return", adaptPairedReturn),
    ...adaptRecordArray(precommitted.routeEdits ?? [], "precommitted:route", adaptRouteEdit),
  ];
}
