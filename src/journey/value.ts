import type { JourneyContext } from "../quest/context.js";
import type { JourneyOperation, JourneyOption } from "./manifest.js";

import type { BaneName } from "./effects.js";

export const VALUE_MODEL_VERSION: "value:v9" = "value:v9";

export const ESSENCE_CONVERTED_ESSENCE_VALUE = 1;

export const ESSENCE_VALUE_CONSTANTS = {
  gainUnit: ESSENCE_CONVERTED_ESSENCE_VALUE,
  restoreToFullFallback: {
    early: 110,
    mid: 90,
    late: 60,
  },
  maxEssenceMultiplier: 2,
  maxEssenceStageMultipliers: {
    early: 1.15,
    late: 0.75,
  },
  lowEssenceGainMultiplier: 1.25,
  highEssenceRawGainMultiplier: 0.7,
} as const;

export const OMEN_VALUE_CONSTANTS = {
  gainEach: 65,
  lossEach: -65,
  stageMultipliers: {
    early: 1.1,
    late: 0.85,
  },
} as const;

export const CARD_VALUE_CONSTANTS = {
  draftBase: 18,
  draftChoiceValues: {
    choices4: 7,
    choices6: 11,
    choices8: 14,
    choices10: 17,
    choices12: 19,
    choices14: 20,
    choices16: 21,
  },
  additionalDraftPickBonus: 35,
  draftCopyBonus: 28,
  draftSpecificityValues: {
    broadCardType: 0,
    subtype: 15,
    rarity: 15,
    energyBound: 10,
    fast: 10,
    textMatch: 20,
    duplicateInSource: 20,
    multipleAbilities: 20,
    namedOrId: 40,
    maximum: 60,
  },
  randomCard: 55,
  tideOrPredicateMatchBonus: 15,
  hiddenRandomPenalty: -10,
  temporaryGainMultiplier: 0.55,
  namedVisibleByRarity: {
    common: 75,
    uncommon: 95,
    rare: 120,
    legendary: 145,
  },
} as const;

export const PURGE_VALUE_CONSTANTS = {
  chosenBaneBase: 140,
  existingBaneAboveOneBonus: 25,
  randomBane: 95,
  chosenStarter: 70,
  chosenStarterStageMultipliers: {
    early: 1.2,
    late: 0.7,
  },
  randomStarter: 50,
  randomStarterNoTarget: 0,
  allStarterSetBonus: 35,
  usefulNonStarterSacrifice: -80,
} as const;

export const STARTER_SURGERY_VALUE_CONSTANTS = {
  replacementBase: 70,
  allReplacementSetBonus: 45,
  extraStarterEach: 35,
  twoChosenOperationCoordinationBonus: 25,
} as const;

export const DREAMSIGN_VALUE_CONSTANTS = {
  namedGain: 145,
  selectedTideMatchBonus: 20,
  draftBase: 300,
  draftChoiceValues: {
    choices1: 0,
    choices2: 45,
    choices3: 75,
    choices4: 95,
    choices5: 110,
    choices6: 120,
  },
  randomGain: 105,
  randomTidalMatchBonus: 20,
  loss: -120,
  highValueNamedLoss: -160,
  transform: 60,
} as const;

export const DREAMSIGN_OPERATION_VALUE_CONSTANTS = {
  gain: 145,
  purchase: 145,
  loss: -120,
  purge: 80,
  duplicate: 130,
  copyGain: 120,
  temporaryGrant: 95,
  transform: 105,
  randomTransform: 90,
  poolAdd: 80,
  poolRemove: 45,
  poolReplace: 95,
  randomReward: 120,
  tradeHook: 90,
  triggerCounter: 80,
  selectedTideMatchBonus: 20,
  randomUncertainty: -10,
  temporaryUncertainty: -8,
  delayedUncertainty: -8,
} as const;

export const TRANSFIGURATION_VALUE_CONSTANTS = {
  standardByType: {
    Viridian: 85,
    Bronze: 85,
    Scarlet: 90,
    Golden: 110,
    Prismatic: 165,
  },
  genericChosen: 95,
  random: 60,
} as const;

export const CARD_MODIFICATION_VALUE_CONSTANTS = {
  duplicateChosen: 115,
  duplicateChosenLateMultiplier: 1.15,
  duplicateRandomPredicate: 80,
  mergeOrSplitExistingCards: 100,
  lowerCostOrAddFastOrReclaim: 70,
} as const;

export const DREAMWELL_VALUE_CONSTANTS = {
  firstDrawEnergy: 155,
  bonusCards: 145,
  lowestPhaseUpgrade: 150,
  ignorePenalty: 145,
  futureCardReplacement: 150,
  firstDrawEnergyPenalty: 135,
  penaltyCards: 95,
  delayedPenaltyCards: 110,
  compensatingNamedReward: 340,
} as const;

export const ROUTE_VALUE_CONSTANTS = {
  addCurrentValuableSite: 60,
  replaceLowValueWithValuableSite: 95,
  futureRouteEdit: 50,
  removeAllValuableSites: -90,
  burdenedDreamJourneyRoute: 35,
  compoundRouteMinorReward: 30,
} as const;

export const STATUS_VALUE_CONSTANTS = {
  nextVictoryRewardReplacement: 320,
  battleRewardReduction: -120,
  essenceSiteRewardReduction: -135,
  persistentProhibition: {
    gainEssence: -310,
    modifyDeck: -280,
    transfigureCards: -220,
  },
  deckSizeFloor: -130,
  exactDeckSizeMandate: -170,
  largeNamedRewardCompensationBonus: 120,
} as const;

export const TIMING_AND_RANDOMNESS_VALUE_CONSTANTS = {
  delayedRewardMultiplier: 0.75,
  nextBattleMultiplier: 0.8,
  nextVictoryMultiplier: 0.8,
  twoVictoriesMultiplier: 0.65,
  nextDreamscapeMultiplier: 0.8,
  twoDreamscapesMultiplier: 0.35,
  burdenedFuturePayoffMultiplier: 0.6,
  randomRewardExpectedValueMultiplier: 0.85,
  randomDownsideFlatRiskPremium: 20,
  randomDownsideWorstCaseMultiplier: 0.25,
} as const;

export const BANE_VALUE_CONSTANTS = {
  gainedByName: {
    Nightmare: -125,
    Despair: -110,
    Envy: -110,
    Oblivion: -145,
    Betrayal: -145,
    Doubt: -145,
    Burden: -145,
    Paralysis: -145,
    Lethargy: -170,
    Silence: -130,
    Paranoia: -130,
  },
  purgeInverseMultiplier: 0.9,
  chosenPurgeBonus: 25,
  temporaryMultiplier: 0.45,
  delayedMultiplier: 0.65,
  replacementRelief: 35,
  transformToCardBase: 120,
} as const;

export const RESOURCE_EDGE_VALUE_CONSTANTS = {
  capGainMultiplier: 2,
  capLossMultiplier: -2,
  percentageOfMaximumMultiplier: 1,
  allRemainingCostMultiplier: -1,
  randomRangeExpectedMultiplier: 1,
  rewardReductionMultiplier: -1,
} as const;

export const PAYMENT_VALUE_CONSTANTS = {
  essenceUnit: -ESSENCE_CONVERTED_ESSENCE_VALUE,
  omenEach: OMEN_VALUE_CONSTANTS.lossEach,
} as const;

export const LOSS_CHOICE_VALUE_CONSTANTS = {
  minimumComparableMagnitude: Math.abs(OMEN_VALUE_CONSTANTS.lossEach),
  maximumComparableRatio: 2,
} as const;

export const POSITIVE_MENU_VALUE_CONSTANTS = {
  maximumComparableSpread: 100,
  minimumComparableRatio: 0.7,
} as const;

export const STAGE_PRIORITY_TAGS = {
  early: ["build", "cleanup", "reward", "immediate", "broad"],
  mid: ["refine", "precise", "risk", "delayed", "persistent", "economy"],
  late: ["convert", "precise", "sacrifice", "gamble", "structural", "route"],
} as const;

export const RUN_STATE_VALUE_MODIFIERS = {
  lowEssenceThresholdMaxFraction: 0.25,
  highEssenceThresholdMaxFraction: 0.8,
} as const;

export const STAGE_VALUE_MULTIPLIERS = {
  early: 1.1,
  mid: 1,
  late: 0.9,
} as const;

export const DRAFT_BREADTH_VALUES = {
  choices4: 18,
  choices6: 26,
  choices8: 33,
  choices10: 38,
  choices12: 42,
  choices14: 45,
  choices16: 47,
} as const;

export const DRAFT_CARD_VALUES = {
  firstChosenCard: 34,
  additionalChosenCard: 24,
  viewedOnlyCard: 3,
} as const;

export const PURGE_VALUES = {
  bane: 70,
  starter: 18,
  weakCard: 12,
  strongCardSacrifice: -45,
} as const;

export const DREAMSIGN_VALUES = {
  visibleChoice: 46,
  hiddenChoice: 32,
  choiceBreadthStep: 7,
} as const;

export const ROUTE_SITE_DELTA_VALUES = {
  draft: 0,
  enhancedDraft: 22,
  purge: 35,
  transfiguration: 38,
  shop: 30,
  dreamsignOffering: 40,
  dreamJourney: 42,
  lowValueCurrentSite: -12,
} as const;

export const BURDEN_VALUES = {
  minorBane: -35,
  seriousBane: -70,
  nightmare: -80,
} as const;

export const UNCERTAINTY_ADJUSTMENTS = {
  hiddenTarget: -10,
  delayedPayoff: -8,
  randomOutcome: -12,
  probabilisticRiskPremium: -15,
} as const;

export const VALUE_MODEL_VALUES = {
  essence: ESSENCE_VALUE_CONSTANTS,
  omens: OMEN_VALUE_CONSTANTS,
  cards: CARD_VALUE_CONSTANTS,
  purge: PURGE_VALUE_CONSTANTS,
  starterSurgery: STARTER_SURGERY_VALUE_CONSTANTS,
  dreamsigns: DREAMSIGN_VALUE_CONSTANTS,
  transfigurations: TRANSFIGURATION_VALUE_CONSTANTS,
  cardModification: CARD_MODIFICATION_VALUE_CONSTANTS,
  route: ROUTE_VALUE_CONSTANTS,
  statuses: STATUS_VALUE_CONSTANTS,
  timingAndRandomness: TIMING_AND_RANDOMNESS_VALUE_CONSTANTS,
  banes: BANE_VALUE_CONSTANTS,
  resourceEdges: RESOURCE_EDGE_VALUE_CONSTANTS,
  payments: PAYMENT_VALUE_CONSTANTS,
  lossChoices: LOSS_CHOICE_VALUE_CONSTANTS,
  positiveMenus: POSITIVE_MENU_VALUE_CONSTANTS,
  stagePriorityTags: STAGE_PRIORITY_TAGS,
  runStateModifiers: RUN_STATE_VALUE_MODIFIERS,
  essenceConvertedEssenceValue: ESSENCE_CONVERTED_ESSENCE_VALUE,
  stageMultipliers: STAGE_VALUE_MULTIPLIERS,
  draftBreadth: DRAFT_BREADTH_VALUES,
  draftCards: DRAFT_CARD_VALUES,
  legacyPurge: PURGE_VALUES,
  legacyDreamsigns: DREAMSIGN_VALUES,
  routeSiteDelta: ROUTE_SITE_DELTA_VALUES,
  burdens: BURDEN_VALUES,
  uncertainty: UNCERTAINTY_ADJUSTMENTS,
  components: {
    risk: TIMING_AND_RANDOMNESS_VALUE_CONSTANTS.randomDownsideFlatRiskPremium,
    visibility: UNCERTAINTY_ADJUSTMENTS.hiddenTarget,
    duration: TIMING_AND_RANDOMNESS_VALUE_CONSTANTS.delayedRewardMultiplier,
    targetQuality: CARD_VALUE_CONSTANTS.tideOrPredicateMatchBonus,
    objectQuality: CARD_VALUE_CONSTANTS.namedVisibleByRarity,
    routeScope: ROUTE_VALUE_CONSTANTS,
    statusScope: {
      persistent: 45,
      nextBattle: 25,
      oneTime: 20,
    },
  },
} as const;

export const VALUE_MODEL_CONTRIBUTION = {
  version: VALUE_MODEL_VERSION,
  values: VALUE_MODEL_VALUES,
} as const;

export type ValueBreakdown = {
  optionNumber: number;
  cost: number;
  effect: number;
  burden: number;
  uncertainty: number;
  net: number;
  components: {
    kind:
      | "cost"
      | "effect"
      | "burden"
      | "uncertainty"
      | "risk"
      | "visibility"
      | "duration"
      | "target-quality"
      | "object-quality"
      | "route-scope"
      | "status-scope"
      | "value-band";
    operationId?: string;
    label: string;
    value: number;
  }[];
  detail: string[];
};

function roundToNearestFive(value: number): number {
  return Math.round(value / 5) * 5;
}

export function semanticEssenceAmountBand(amount: number, role: "cost" | "reward" | "burden" = "reward"): string {
  const magnitude = Math.abs(amount);
  const prefix = role === "cost" ? "essence-cost" : role === "burden" ? "essence-burden" : "essence-reward";

  if (magnitude === 0) {
    return `${prefix}:none`;
  }

  if (magnitude <= 25) {
    return `${prefix}:low`;
  }

  if (magnitude <= 100) {
    return `${prefix}:medium`;
  }

  if (magnitude <= 250) {
    return `${prefix}:high`;
  }

  return `${prefix}:major`;
}

export function semanticOmenCountBand(count: number, role: "cost" | "reward" | "burden" = "reward"): string {
  const magnitude = Math.abs(count);
  const prefix = role === "cost" ? "omen-cost" : role === "burden" ? "omen-burden" : "omen-reward";

  if (magnitude === 0) {
    return `${prefix}:none`;
  }

  if (magnitude === 1) {
    return `${prefix}:single`;
  }

  if (magnitude <= 3) {
    return `${prefix}:multi`;
  }

  return `${prefix}:major`;
}

export function semanticChanceBand(percent: number): string {
  if (percent <= 0) {
    return "chance:none";
  }

  if (percent <= 25) {
    return "chance:unlikely";
  }

  if (percent <= 50) {
    return "chance:even";
  }

  if (percent <= 75) {
    return "chance:likely";
  }

  if (percent < 100) {
    return "chance:near-certain";
  }

  return "chance:guaranteed";
}

export function semanticDurationBand(count: number | undefined, durationKind = "duration"): string {
  if (count === undefined || !Number.isFinite(count)) {
    return `${durationKind}:unspecified`;
  }

  if (count <= 1) {
    return `${durationKind}:next`;
  }

  if (count <= 3) {
    return `${durationKind}:short-window`;
  }

  return `${durationKind}:long-window`;
}

export function semanticChoiceCountBand(count: number): string {
  if (count <= 1) {
    return "choice-count:single";
  }

  if (count <= 3) {
    return "choice-count:narrow";
  }

  if (count <= 6) {
    return "choice-count:menu";
  }

  return "choice-count:broad";
}

function choiceCurveValue(
  choiceCount: number,
  curve: Readonly<Record<string, number>>,
): number {
  const choices = Object.entries(curve)
    .map(([key, value]) => ({
      choiceCount: Number.parseInt(key.replace("choices", ""), 10),
      value,
    }))
    .filter((entry) => Number.isFinite(entry.choiceCount))
    .sort((left, right) => left.choiceCount - right.choiceCount);

  const exact = choices.find((entry) => entry.choiceCount === choiceCount);

  if (exact) {
    return exact.value;
  }

  const lowerOrEqual = choices.filter((entry) => entry.choiceCount <= choiceCount).at(-1);
  const upper = choices.find((entry) => entry.choiceCount > choiceCount);

  if (!lowerOrEqual) {
    return choices[0]?.value ?? 0;
  }

  if (!upper) {
    return lowerOrEqual.value;
  }

  const span = upper.choiceCount - lowerOrEqual.choiceCount;
  const progress = (choiceCount - lowerOrEqual.choiceCount) / span;

  return lowerOrEqual.value + (upper.value - lowerOrEqual.value) * progress;
}

function capAwareEssenceAmount(amount: number, context?: JourneyContext): number {
  if (!context) {
    return amount;
  }

  const resources = context.state.quest.resources;

  return Math.max(0, Math.min(amount, resources.maxEssence - resources.essence));
}

export function cardPredicateSpecificityValue(predicate: unknown): number {
  if (typeof predicate !== "object" || predicate === null || Array.isArray(predicate)) {
    return 0;
  }

  const record = predicate as Record<string, unknown>;
  let specificity = typeof record.cardType === "string"
    ? CARD_VALUE_CONSTANTS.draftSpecificityValues.broadCardType
    : 0;

  if (typeof record.subtype === "string") {
    specificity += CARD_VALUE_CONSTANTS.draftSpecificityValues.subtype;
  }

  if (typeof record.rarity === "string") {
    specificity += CARD_VALUE_CONSTANTS.draftSpecificityValues.rarity;
  }

  if (typeof record.minEnergyCost === "number") {
    specificity += CARD_VALUE_CONSTANTS.draftSpecificityValues.energyBound;
  }

  if (typeof record.maxEnergyCost === "number") {
    specificity += CARD_VALUE_CONSTANTS.draftSpecificityValues.energyBound;
  }

  if (typeof record.energyCost === "number") {
    specificity += CARD_VALUE_CONSTANTS.draftSpecificityValues.energyBound;
  }

  if (record.isFast === true) {
    specificity += CARD_VALUE_CONSTANTS.draftSpecificityValues.fast;
  }

  if (typeof record.renderedTextIncludes === "string" || Array.isArray(record.renderedTextIncludes)) {
    specificity += CARD_VALUE_CONSTANTS.draftSpecificityValues.textMatch;
  }

  if (typeof record.minCopies === "number" || typeof record.maxCopies === "number") {
    specificity += CARD_VALUE_CONSTANTS.draftSpecificityValues.duplicateInSource;
  }

  if (typeof record.minAbilityCount === "number" || typeof record.hasMultipleAbilities === "boolean") {
    specificity += CARD_VALUE_CONSTANTS.draftSpecificityValues.multipleAbilities;
  }

  if (Array.isArray(record.names) || Array.isArray(record.ids)) {
    specificity += CARD_VALUE_CONSTANTS.draftSpecificityValues.namedOrId;
  }

  return Math.min(specificity, CARD_VALUE_CONSTANTS.draftSpecificityValues.maximum);
}

export function valueEssenceGain(amount: number, context?: JourneyContext): number {
  return capAwareEssenceAmount(amount, context);
}

export function valueOmenGain(amount: number): number {
  return amount * OMEN_VALUE_CONSTANTS.gainEach;
}

export function valueOmenLoss(amount: number): number {
  return amount * OMEN_VALUE_CONSTANTS.lossEach;
}

export function valueBaneGain(baneName: BaneName, count: number): number {
  return (BANE_VALUE_CONSTANTS.gainedByName[baneName] ?? BANE_VALUE_CONSTANTS.gainedByName.Nightmare) * count;
}

export function valueBaneBurden(input: {
  baneName: BaneName;
  count?: number;
  temporary?: boolean;
  delayed?: boolean;
}): number {
  const base = valueBaneGain(input.baneName, input.count ?? 1);
  const temporaryMultiplier = input.temporary === true
    ? BANE_VALUE_CONSTANTS.temporaryMultiplier
    : 1;
  const delayedMultiplier = input.delayed === true
    ? BANE_VALUE_CONSTANTS.delayedMultiplier
    : 1;

  return roundToNearestFive(base * temporaryMultiplier * delayedMultiplier);
}

export function valueBanePurge(input: {
  baneName: BaneName;
  count?: number;
  selection?: "exact" | "chosen_after_commitment" | "visible_random";
  targetContext?: "current_state" | "future_burden" | "manifest_obligation";
}): number {
  const count = input.count ?? 1;
  const inverse = Math.abs(valueBaneGain(input.baneName, count)) *
    BANE_VALUE_CONSTANTS.purgeInverseMultiplier;
  const certainty = input.selection === "visible_random"
    ? PURGE_VALUE_CONSTANTS.randomBane / PURGE_VALUE_CONSTANTS.chosenBaneBase
    : input.selection === "chosen_after_commitment"
      ? 1 + BANE_VALUE_CONSTANTS.chosenPurgeBonus / PURGE_VALUE_CONSTANTS.chosenBaneBase
      : 1;
  const contextMultiplier = input.targetContext === "future_burden"
    ? 0.8
    : input.targetContext === "manifest_obligation"
      ? 0.9
      : 1;

  return roundToNearestFive(inverse * certainty * contextMultiplier);
}

export function valueBaneReplacement(input: {
  baneName: BaneName;
  replacementValue?: number;
  selection?: "exact" | "chosen_after_commitment" | "visible_random";
  targetContext?: "current_state" | "future_burden" | "manifest_obligation";
}): number {
  return valueBanePurge({
    baneName: input.baneName,
    selection: input.selection,
    targetContext: input.targetContext,
  }) + BANE_VALUE_CONSTANTS.replacementRelief +
    Math.max(0, Math.min(60, input.replacementValue ?? 0));
}

export function valueBaneTransformToCard(input: {
  baneName: BaneName;
  cardValue?: number;
  delayed?: boolean;
  targetContext?: "current_state" | "future_burden" | "manifest_obligation";
}): number {
  const relief = valueBanePurge({
    baneName: input.baneName,
    targetContext: input.targetContext,
  });
  const cardBonus = Math.max(0, Math.min(55, (input.cardValue ?? 75) - 75));
  const delayedMultiplier = input.delayed === true
    ? TIMING_AND_RANDOMNESS_VALUE_CONSTANTS.delayedRewardMultiplier
    : 1;

  return roundToNearestFive(
    (BANE_VALUE_CONSTANTS.transformToCardBase + relief * 0.35 + cardBonus) *
      delayedMultiplier,
  );
}

export function valueUsefulNonStarterCardSacrifice(count = 1): number {
  return PURGE_VALUE_CONSTANTS.usefulNonStarterSacrifice * Math.max(1, count);
}

export function valueStarterCleanup(input: {
  count: number;
  stage?: "early" | "mid" | "late";
  random?: boolean;
  all?: boolean;
}): number {
  const count = Math.max(1, input.count);
  const base = input.random === true
    ? PURGE_VALUE_CONSTANTS.randomStarter
    : PURGE_VALUE_CONSTANTS.chosenStarter;
  const stageMultiplier = input.stage
    ? input.stage === "early"
      ? PURGE_VALUE_CONSTANTS.chosenStarterStageMultipliers.early
      : input.stage === "late"
        ? PURGE_VALUE_CONSTANTS.chosenStarterStageMultipliers.late
        : 1
    : 1;
  const setBonus = input.all === true
    ? PURGE_VALUE_CONSTANTS.allStarterSetBonus
    : 0;

  return roundToNearestFive((base * count + setBonus) * stageMultiplier);
}

export function valueStarterReplacement(input: {
  count: number;
  resultValue?: number;
  stage?: "early" | "mid" | "late";
  all?: boolean;
}): number {
  const count = Math.max(1, input.count);
  const cleanup = valueStarterCleanup({
    count,
    stage: input.stage,
    all: input.all,
  });
  const replacementValue = input.resultValue ?? STARTER_SURGERY_VALUE_CONSTANTS.replacementBase;
  const setBonus = input.all === true
    ? STARTER_SURGERY_VALUE_CONSTANTS.allReplacementSetBonus
    : 0;

  return roundToNearestFive(cleanup + replacementValue * count + setBonus);
}

export function valueCardDraft(input: {
  takeCount: number;
  choiceCount: number;
  predicate?: unknown;
  copyCount?: number;
  temporary?: boolean;
}): number {
  const firstCard = CARD_VALUE_CONSTANTS.draftBase;
  const additionalCards = Math.max(0, input.takeCount - 1) *
    CARD_VALUE_CONSTANTS.additionalDraftPickBonus;
  const additionalCopies = Math.max(0, (input.copyCount ?? 1) - 1) *
    CARD_VALUE_CONSTANTS.draftCopyBonus;
  const breadth = choiceCurveValue(input.choiceCount, CARD_VALUE_CONSTANTS.draftChoiceValues);
  const qualifier = cardPredicateSpecificityValue(input.predicate);
  const rawValue = firstCard + additionalCards + additionalCopies + breadth + qualifier;
  const durationMultiplier = input.temporary === true
    ? CARD_VALUE_CONSTANTS.temporaryGainMultiplier
    : 1;

  return roundToNearestFive(rawValue * durationMultiplier);
}

export function valueRandomCardGain(input: {
  count: number;
  predicate?: unknown;
  copyCount?: number;
  temporary?: boolean;
}): number {
  const cards = Math.max(1, input.count);
  const firstCard = CARD_VALUE_CONSTANTS.randomCard;
  const additionalCards = Math.max(0, cards - 1) *
    CARD_VALUE_CONSTANTS.additionalDraftPickBonus;
  const additionalCopies = Math.max(0, (input.copyCount ?? 1) - 1) *
    CARD_VALUE_CONSTANTS.draftCopyBonus;
  const qualifier = cardPredicateSpecificityValue(input.predicate);
  const hiddenTargetRisk = CARD_VALUE_CONSTANTS.hiddenRandomPenalty;
  const rawValue = firstCard + additionalCards + additionalCopies + qualifier + hiddenTargetRisk;
  const durationMultiplier = input.temporary === true
    ? CARD_VALUE_CONSTANTS.temporaryGainMultiplier
    : 1;

  return roundToNearestFive(rawValue * durationMultiplier);
}

export function valueDreamsignDraft(input: {
  choiceCount: number;
}, context?: JourneyContext): number {
  if (context && context.state.quest.dreamsignPoolIds.length === 0) {
    return 0;
  }

  return roundToNearestFive(
    DREAMSIGN_VALUE_CONSTANTS.draftBase +
    choiceCurveValue(input.choiceCount, DREAMSIGN_VALUE_CONSTANTS.draftChoiceValues),
  );
}

export function valueDreamsignOperation(
  family:
    | "gain"
    | "purchase"
    | "loss"
    | "purge"
    | "duplicate"
    | "copy_gain"
    | "temporary_grant"
    | "transform"
    | "pool_edit"
    | "random_reward"
    | "trade_hook"
    | "trigger_counter",
  options: {
    poolOperation?: "add" | "remove" | "replace";
    random?: boolean;
    tideOverlap?: boolean;
    predicate?: unknown;
  } = {},
): number {
  const base = (() => {
    switch (family) {
      case "gain":
        return DREAMSIGN_OPERATION_VALUE_CONSTANTS.gain;
      case "purchase":
        return DREAMSIGN_OPERATION_VALUE_CONSTANTS.purchase;
      case "loss":
        return DREAMSIGN_OPERATION_VALUE_CONSTANTS.loss;
      case "purge":
        return DREAMSIGN_OPERATION_VALUE_CONSTANTS.purge;
      case "duplicate":
        return DREAMSIGN_OPERATION_VALUE_CONSTANTS.duplicate;
      case "copy_gain":
        return DREAMSIGN_OPERATION_VALUE_CONSTANTS.copyGain;
      case "temporary_grant":
        return DREAMSIGN_OPERATION_VALUE_CONSTANTS.temporaryGrant;
      case "transform":
        return options.random === true
          ? DREAMSIGN_OPERATION_VALUE_CONSTANTS.randomTransform
          : DREAMSIGN_OPERATION_VALUE_CONSTANTS.transform;
      case "pool_edit":
        return options.poolOperation === "add"
          ? DREAMSIGN_OPERATION_VALUE_CONSTANTS.poolAdd
          : options.poolOperation === "remove"
            ? DREAMSIGN_OPERATION_VALUE_CONSTANTS.poolRemove
            : DREAMSIGN_OPERATION_VALUE_CONSTANTS.poolReplace;
      case "random_reward":
        return DREAMSIGN_OPERATION_VALUE_CONSTANTS.randomReward;
      case "trade_hook":
        return DREAMSIGN_OPERATION_VALUE_CONSTANTS.tradeHook;
      case "trigger_counter":
        return DREAMSIGN_OPERATION_VALUE_CONSTANTS.triggerCounter;
    }
  })();

  return roundToNearestFive(
    base +
    (options.tideOverlap === true
      ? DREAMSIGN_OPERATION_VALUE_CONSTANTS.selectedTideMatchBonus
      : 0),
  );
}

export function valueStatusRuleMutation(
  family:
    | "next_victory_reward_replacement"
    | "battle_reward_reduction"
    | "essence_site_reward_reduction"
    | "no_essence_gain"
    | "no_deck_modification"
    | "no_card_transfiguration"
    | "deck_size_floor"
    | "exact_deck_size_mandate",
  options: { largeNamedReward?: boolean } = {},
): number {
  const base = (() => {
    switch (family) {
      case "next_victory_reward_replacement":
        return STATUS_VALUE_CONSTANTS.nextVictoryRewardReplacement;
      case "battle_reward_reduction":
        return STATUS_VALUE_CONSTANTS.battleRewardReduction;
      case "essence_site_reward_reduction":
        return STATUS_VALUE_CONSTANTS.essenceSiteRewardReduction;
      case "no_essence_gain":
        return STATUS_VALUE_CONSTANTS.persistentProhibition.gainEssence;
      case "no_deck_modification":
        return STATUS_VALUE_CONSTANTS.persistentProhibition.modifyDeck;
      case "no_card_transfiguration":
        return STATUS_VALUE_CONSTANTS.persistentProhibition.transfigureCards;
      case "deck_size_floor":
        return STATUS_VALUE_CONSTANTS.deckSizeFloor;
      case "exact_deck_size_mandate":
        return STATUS_VALUE_CONSTANTS.exactDeckSizeMandate;
    }
  })();

  return roundToNearestFive(
    base +
      (base < 0 && options.largeNamedReward === true
        ? STATUS_VALUE_CONSTANTS.largeNamedRewardCompensationBonus
        : 0),
  );
}

export function commonEssenceRewardAmount(context?: JourneyContext): number {
  const baseAmount = 400;

  if (!context) {
    return baseAmount;
  }

  return baseAmount;
}

function signedValue(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function operationHasConvertedValue(operation: JourneyOperation): boolean {
  return typeof operation.value?.convertedEssence === "number";
}

function operationValueTotal(
  option: JourneyOption,
  role: "cost" | "reward" | "burden" | "route_edit",
): number {
  return option.operations
    .filter((operation) => operation.role === role)
    .reduce((total, operation) => total + (operation.value?.convertedEssence ?? 0), 0);
}

function operationEffectValueTotal(option: JourneyOption): number {
  return operationValueTotal(option, "reward") + operationValueTotal(option, "route_edit");
}

function valueForRole(
  option: JourneyOption,
  role: "cost" | "reward" | "burden",
  fallback: number,
): number {
  const relevantOperations = option.operations.filter((operation) =>
    role === "reward"
      ? operation.role === "reward" || operation.role === "route_edit"
      : operation.role === role
  );

  return relevantOperations.some(operationHasConvertedValue)
    ? role === "reward"
      ? operationEffectValueTotal(option)
      : operationValueTotal(option, role)
    : fallback;
}

function operationValueComponents(option: JourneyOption): ValueBreakdown["components"] {
  const components: ValueBreakdown["components"] = [];

  for (const operation of option.operations) {
    const converted = operation.value?.convertedEssence;

    if (typeof converted === "number") {
      const kind = operation.role === "cost"
        ? "cost"
        : operation.role === "burden"
          ? "burden"
          : "effect";

      components.push({
        kind,
        operationId: operation.operationId,
        label: `${operation.operationKind} ${operation.role}`,
        value: converted,
      });
    }

    if (typeof operation.value?.uncertaintyConvertedEssence === "number") {
      components.push({
        kind: "uncertainty",
        operationId: operation.operationId,
        label: `${operation.operationKind} uncertainty`,
        value: operation.value.uncertaintyConvertedEssence,
      });
    }

    for (const band of operation.value?.bands ?? []) {
      components.push({
        kind: "value-band",
        operationId: operation.operationId,
        label: `${band.id} ${band.label}`,
        value: 0,
      });
    }

    const operationKind = operation.operationKind as string;
    if (operation.role === "random" || operationKind === "random_envelope" || operationKind === "reveal_envelope") {
      components.push({
        kind: "risk",
        operationId: operation.operationId,
        label: `${operation.operationKind} risk premium`,
        value: operation.value?.riskPremiumConvertedEssence ?? 0,
      });
    }

    const selectorSelection = operation.targetSelector && "selection" in operation.targetSelector
      ? operation.targetSelector.selection
      : undefined;

    if (operation.visibility !== "visible" || selectorSelection === "hidden_random") {
      components.push({
        kind: "visibility",
        operationId: operation.operationId,
        label: `${operation.visibility} visibility`,
        value: 0,
      });
    }

    if (operation.timing?.timingKind === "delayed" || operation.timing?.timingKind === "route") {
      components.push({
        kind: "duration",
        operationId: operation.operationId,
        label: operation.timing.label ?? operation.timing.timingKind,
        value: 0,
      });
    }

    if (operation.targetResolution) {
      components.push({
        kind: "target-quality",
        operationId: operation.operationId,
        label: `${operation.targetResolution.selectorKind} target candidates: ${operation.targetResolution.candidateCount}`,
        value: 0,
      });

      if (operation.targetResolution.selected.length > 0) {
        components.push({
          kind: "object-quality",
          operationId: operation.operationId,
          label: operation.targetResolution.selected.map((target) => target.name).join(", "),
          value: 0,
        });
      }
    }

    if (operation.operationKind === "route_edit") {
      components.push({
        kind: "route-scope",
        operationId: operation.operationId,
        label: operation.timing?.timingKind === "route" ? operation.timing.scope : "route",
        value: 0,
      });
    }

    if (operation.operationKind === "status") {
      components.push({
        kind: "status-scope",
        operationId: operation.operationId,
        label: operation.statusKind,
        value: 0,
      });
    }
  }

  if (option.uncertaintyConvertedEssence !== 0 && !components.some((component) => component.kind === "uncertainty")) {
    components.push({
      kind: "uncertainty",
      label: "option uncertainty",
      value: option.uncertaintyConvertedEssence,
    });
  }

  return components;
}

export function evaluateOptionValue(
  option: JourneyOption,
  context?: JourneyContext,
): ValueBreakdown {
  void context;

  const cost = valueForRole(option, "cost", option.costConvertedEssence);
  const effect = valueForRole(option, "reward", option.effectConvertedEssence);
  const burden = valueForRole(option, "burden", option.burdenConvertedEssence);
  const operationUncertainty = option.operations.reduce(
    (total, operation) => total + (operation.value?.uncertaintyConvertedEssence ?? 0),
    0,
  );
  const uncertainty = operationUncertainty !== 0 ? operationUncertainty : option.uncertaintyConvertedEssence;
  const net = option.operations.some((operation) => operation.value)
    ? effect - cost + burden + uncertainty
    : option.netConvertedEssence;
  const components = operationValueComponents(option);

  return {
    optionNumber: option.number,
    cost,
    effect,
    burden,
    uncertainty,
    net,
    components,
    detail: [
      `Cost: ${cost} converted essence.`,
      `Effect: ${signedValue(effect)} converted essence.`,
      `Burden: ${signedValue(burden)} converted essence.`,
      `Uncertainty: ${signedValue(uncertainty)} converted essence.`,
      `Net: ${signedValue(net)} converted essence.`,
      ...components.map((component) =>
        `Component ${component.kind}: ${component.label} (${signedValue(component.value)}).`
      ),
    ],
  };
}
