import type { JourneyContext } from "../../../quest/context.js";
import { drawInt, type DrawContext } from "../../../util/rng.js";
import {
  BANE_NAMES,
  DEFAULT_BANE_NAME,
  type BaneName,
} from "../../effects.js";
import {
  CARD_DRAFT_PROFILES,
  cost,
  pickLegalCardDraftProfile,
  pickSequentialVariant,
} from "../../fillers/shared.js";
import { randomVisibility } from "../../fillers/randomPayloads.js";
import type {
  JourneyStage,
  RandomOdds,
  RandomPrecommittedOutcome,
} from "../../manifest.js";
import { valueBaneGain } from "../../value.js";

function odds(percent: number): RandomOdds {
  return { numerator: percent, denominator: 100, percent };
}

function stageRiskPremium(stage: JourneyStage): number {
  switch (stage) {
    case "early":
      return 35;
    case "mid":
      return 55;
    case "late":
      return 70;
  }
}

function oddsRiskPremium(percent: number): number {
  if (percent >= 75) {
    return 45;
  }

  if (percent >= 65) {
    return 35;
  }

  if (percent >= 50) {
    return 25;
  }

  if (percent >= 35) {
    return 15;
  }

  return 10;
}

function riskAdjustedUncertainty(args: {
  expected: number;
  chancePercent: number;
  stage: JourneyStage;
}): number {
  return args.expected -
    stageRiskPremium(args.stage) -
    oddsRiskPremium(args.chancePercent);
}

const ESSENCE_DOWNSIDE_RANGES = {
  early: { minimum: 70, maximum: 150 },
  mid: { minimum: 110, maximum: 240 },
  late: { minimum: 160, maximum: 320 },
} as const satisfies Record<
  JourneyStage,
  { minimum: number; maximum: number }
>;

function randomPurgePayload(args: {
  kind: "dreamsign" | "card";
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
}) {
  if (args.kind === "dreamsign") {
    const activeIds = args.context.state.quest.activeDreamsigns.map(
      (entry) => entry.dreamsignId,
    );
    const poolIds = args.context.state.quest.dreamsignPoolIds;
    const source = activeIds.length > 0 ? "active" : "pool";
    const ids = activeIds.length > 0 ? activeIds : poolIds;

    return {
      kind: "dreamsign_purge",
      dreamsignOperationKind: "purge",
      selection: "hidden_random",
      source,
      predicate: { source, ids },
      timing: "immediate",
    };
  }

  const profile = pickLegalCardDraftProfile(
    args.context,
    args.drawContext,
    `${args.label}:random-card-purge-profile`,
    [
      CARD_DRAFT_PROFILES.characters,
      CARD_DRAFT_PROFILES.events,
      CARD_DRAFT_PROFILES.allEligibleCards,
    ],
  );

  return {
    kind: "card_purge",
    cardOperationKind: "purge",
    selection: "hidden_random",
    predicate: { source: "deck", ...profile.predicate },
    timing: "immediate",
  };
}

export function randomRiskCostEnvelope(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  optionNumber: number;
  chancePercent: number;
  stage: JourneyStage;
}) {
  const kind = pickSequentialVariant(
    args.drawContext,
    `${args.label}:random-risk-cost-kind`,
    ["random_essence_cost", "random_dreamsign_purge", "random_card_purge"] as const,
  );
  const roll = drawInt(args.drawContext, `${args.label}:random-risk-cost-roll`, 1, 100);
  const essenceRange = ESSENCE_DOWNSIDE_RANGES[args.stage];
  const maximumEssenceCost = Math.max(
    essenceRange.minimum,
    Math.min(essenceRange.maximum, args.context.state.quest.resources.essence),
  );
  const randomEssenceAmount = drawInt(
    args.drawContext,
    `${args.label}:random-risk-cost-amount`,
    Math.min(essenceRange.minimum, maximumEssenceCost),
    maximumEssenceCost,
  );
  const costPayload = kind === "random_essence_cost"
    ? cost("essence", randomEssenceAmount)
    : randomPurgePayload({
        kind: kind === "random_dreamsign_purge" ? "dreamsign" : "card",
        context: args.context,
        drawContext: args.drawContext,
        label: args.label,
      });
  const expectedCost = kind === "random_essence_cost"
    ? -Math.round(randomEssenceAmount * (args.chancePercent / 100))
    : kind === "random_dreamsign_purge"
      ? -Math.round(120 * (args.chancePercent / 100))
      : -Math.round(80 * (args.chancePercent / 100));
  const riskAdjustedCost = riskAdjustedUncertainty({
    expected: expectedCost,
    chancePercent: args.chancePercent,
    stage: args.stage,
  });

  return {
    envelope: {
      kind: "chance_to_pay_cost" as const,
      optionNumber: args.optionNumber,
      odds: odds(args.chancePercent),
      cost: costPayload,
      committedResult: roll <= args.chancePercent ? "paid" as const : "free" as const,
      visibilityPolicy: randomVisibility(
        "pre_rolled",
        "The downside odds are visible and the safe/downside result is precommitted.",
        true,
      ),
      expectedConvertedEssence: expectedCost,
      riskPremiumConvertedEssence: riskAdjustedCost,
      worstCaseBurdenConvertedEssence: kind === "random_essence_cost"
        ? -randomEssenceAmount
        : kind === "random_dreamsign_purge"
          ? -120
          : -80,
      presentation: kind,
    } satisfies RandomPrecommittedOutcome,
    text: kind === "random_essence_cost"
      ? `pay ${randomEssenceAmount} essence`
      : kind === "random_dreamsign_purge"
        ? "purge a random Dreamsign"
        : "purge a random card",
    value: riskAdjustedCost,
  };
}

export function randomBaneChanceEnvelope(args: {
  drawContext: DrawContext;
  label: string;
  optionNumber: number;
  chancePercent: number;
  stage: JourneyStage;
}) {
  const baneName = pickSequentialVariant(
    args.drawContext,
    `${args.label}:chance-bane`,
    [...BANE_NAMES, DEFAULT_BANE_NAME] as readonly BaneName[],
  );
  const roll = drawInt(args.drawContext, `${args.label}:chance-bane-roll`, 1, 100);
  const baneValue = valueBaneGain(baneName, 1);
  const expectedBaneValue = Math.round(baneValue * (args.chancePercent / 100));
  const riskAdjustedBaneValue = riskAdjustedUncertainty({
    expected: expectedBaneValue,
    chancePercent: args.chancePercent,
    stage: args.stage,
  });

  return {
    envelope: {
      kind: "chance_to_gain_bane" as const,
      optionNumber: args.optionNumber,
      odds: odds(args.chancePercent),
      baneName,
      count: 1,
      committedResult: roll <= args.chancePercent ? "bane" as const : "safe" as const,
      visibilityPolicy: randomVisibility(
        "pre_rolled",
        "The downside odds are visible and the safe/downside result is precommitted.",
        true,
      ),
      expectedConvertedEssence: expectedBaneValue,
      riskPremiumConvertedEssence: riskAdjustedBaneValue,
      worstCaseBurdenConvertedEssence: baneValue,
      presentation: "random_bane_burden",
    } satisfies RandomPrecommittedOutcome,
    text: `gain 1 ${baneName}`,
    value: riskAdjustedBaneValue,
  };
}
