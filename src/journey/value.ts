import type { JourneyContext } from "../quest/context.js";
import type { JourneyOption } from "./manifest.js";

import type { BaneName } from "./effects.js";

export const VALUE_MODEL_VERSION: "value:v3" = "value:v3";

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
  draftBase: 32,
  draftChoiceValues: {
    choices4: 12,
    choices6: 18,
    choices8: 23,
    choices10: 27,
    choices12: 30,
    choices14: 32,
    choices16: 33,
  },
  additionalDraftPickBonus: 35,
  visibleQualifierBonus: 25,
  randomCard: 55,
  tideOrPredicateMatchBonus: 15,
  hiddenRandomPenalty: -10,
  namedVisibleByRarity: {
    common: 75,
    uncommon: 95,
    rare: 120,
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
  usefulNonStarterSacrifice: -80,
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

export const ROUTE_VALUE_CONSTANTS = {
  addCurrentValuableSite: 60,
  replaceLowValueWithValuableSite: 95,
  futureRouteEdit: 50,
} as const;

export const TIMING_AND_RANDOMNESS_VALUE_CONSTANTS = {
  delayedRewardMultiplier: 0.75,
  nextVictoryMultiplier: 0.8,
  twoVictoriesMultiplier: 0.65,
  nextDreamscapeMultiplier: 0.8,
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
} as const;

export const PAYMENT_VALUE_CONSTANTS = {
  essenceUnit: -ESSENCE_CONVERTED_ESSENCE_VALUE,
  omenEach: OMEN_VALUE_CONSTANTS.lossEach,
} as const;

export const LOSS_CHOICE_VALUE_CONSTANTS = {
  minimumComparableMagnitude: Math.abs(OMEN_VALUE_CONSTANTS.lossEach),
  maximumComparableRatio: 2,
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
  dreamsigns: DREAMSIGN_VALUE_CONSTANTS,
  transfigurations: TRANSFIGURATION_VALUE_CONSTANTS,
  cardModification: CARD_MODIFICATION_VALUE_CONSTANTS,
  route: ROUTE_VALUE_CONSTANTS,
  timingAndRandomness: TIMING_AND_RANDOMNESS_VALUE_CONSTANTS,
  banes: BANE_VALUE_CONSTANTS,
  payments: PAYMENT_VALUE_CONSTANTS,
  lossChoices: LOSS_CHOICE_VALUE_CONSTANTS,
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
  detail: string[];
};

function roundToNearestFive(value: number): number {
  return Math.round(value / 5) * 5;
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

function hasVisibleDraftQualifier(predicate: unknown): boolean {
  if (typeof predicate !== "object" || predicate === null || Array.isArray(predicate)) {
    return false;
  }

  const record = predicate as Record<string, unknown>;

  return typeof record.cardType === "string" ||
    typeof record.rarity === "string" ||
    typeof record.minEnergyCost === "number" ||
    typeof record.maxEnergyCost === "number" ||
    record.isFast === true ||
    Array.isArray(record.names) ||
    Array.isArray(record.ids);
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

export function valueCardDraft(input: {
  takeCount: number;
  choiceCount: number;
  predicate?: unknown;
}): number {
  const firstCard = CARD_VALUE_CONSTANTS.draftBase;
  const additionalCards = Math.max(0, input.takeCount - 1) *
    CARD_VALUE_CONSTANTS.additionalDraftPickBonus;
  const breadth = choiceCurveValue(input.choiceCount, CARD_VALUE_CONSTANTS.draftChoiceValues);
  const qualifier = hasVisibleDraftQualifier(input.predicate)
    ? CARD_VALUE_CONSTANTS.visibleQualifierBonus
    : 0;

  return roundToNearestFive(firstCard + additionalCards + breadth + qualifier);
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

export function commonEssenceRewardAmount(context?: JourneyContext): number {
  const baseAmount = 150;

  if (!context) {
    return baseAmount;
  }

  const availableCapacity = context.state.quest.resources.maxEssence -
    context.state.quest.resources.essence;

  return Math.max(0, Math.min(baseAmount, availableCapacity));
}

function signedValue(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function evaluateOptionValue(
  option: JourneyOption,
  context?: JourneyContext,
): ValueBreakdown {
  void context;

  const cost = option.costConvertedEssence;
  const effect = option.effectConvertedEssence;
  const burden = option.burdenConvertedEssence;
  const uncertainty = option.uncertaintyConvertedEssence;
  const net = option.netConvertedEssence;

  return {
    optionNumber: option.number,
    cost,
    effect,
    burden,
    uncertainty,
    net,
    detail: [
      `Cost: ${cost} converted essence.`,
      `Effect: ${signedValue(effect)} converted essence.`,
      `Burden: ${signedValue(burden)} converted essence.`,
      `Uncertainty: ${signedValue(uncertainty)} converted essence.`,
      `Net: ${signedValue(net)} converted essence.`,
    ],
  };
}
