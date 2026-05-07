import type { JourneyContext } from "../quest/context.js";
import type { JourneyOperation, JourneyOption } from "./manifest.js";

import type { BaneName } from "./effects.js";

export const VALUE_MODEL_VERSION: "value:v6" = "value:v6";

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
  draftSpecificityValues: {
    broadCardType: 0,
    subtype: 15,
    rarity: 15,
    energyBound: 10,
    fast: 10,
    textMatch: 20,
    namedOrId: 40,
    maximum: 60,
  },
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
  dreamsigns: DREAMSIGN_VALUE_CONSTANTS,
  transfigurations: TRANSFIGURATION_VALUE_CONSTANTS,
  cardModification: CARD_MODIFICATION_VALUE_CONSTANTS,
  route: ROUTE_VALUE_CONSTANTS,
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

function preciseDraftQualifierValue(predicate: unknown): number {
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

  if (record.isFast === true) {
    specificity += CARD_VALUE_CONSTANTS.draftSpecificityValues.fast;
  }

  if (typeof record.renderedTextIncludes === "string" || Array.isArray(record.renderedTextIncludes)) {
    specificity += CARD_VALUE_CONSTANTS.draftSpecificityValues.textMatch;
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

export function valueCardDraft(input: {
  takeCount: number;
  choiceCount: number;
  predicate?: unknown;
}): number {
  const firstCard = CARD_VALUE_CONSTANTS.draftBase;
  const additionalCards = Math.max(0, input.takeCount - 1) *
    CARD_VALUE_CONSTANTS.additionalDraftPickBonus;
  const breadth = choiceCurveValue(input.choiceCount, CARD_VALUE_CONSTANTS.draftChoiceValues);
  const qualifier = preciseDraftQualifierValue(input.predicate);

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
        value: 0,
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
