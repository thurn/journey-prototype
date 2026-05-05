import type { JourneyContext } from "../quest/context.js";
import type { JourneyOption } from "./manifest.js";

export const VALUE_MODEL_VERSION: "value:v1" = "value:v1";

export const ESSENCE_CONVERTED_ESSENCE_VALUE = 1;

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
  essenceConvertedEssenceValue: ESSENCE_CONVERTED_ESSENCE_VALUE,
  stageMultipliers: STAGE_VALUE_MULTIPLIERS,
  draftBreadth: DRAFT_BREADTH_VALUES,
  draftCards: DRAFT_CARD_VALUES,
  purge: PURGE_VALUES,
  dreamsigns: DREAMSIGN_VALUES,
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
