import { drawInt, shuffleDeterministic } from "../../../util/rng.js";
import type {
  JourneyOption,
  JourneyStage,
  RandomOdds,
  RandomPrecommittedOutcome,
  RandomVisibilityPolicy,
} from "../../manifest.js";
import {
  buildJourneyOptionOperations,
  buildPrecommittedOperations,
} from "../../operationBuilders.js";
import { BANE_NAMES } from "../../shared/content.js";
import { getReward } from "../../shared/rewards.js";
import type { TemplateParams } from "../../shared/types.js";
import { valueBaneGain, valueEssenceGain, valueOmenGain } from "../../value.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_ID = "risk_or_skip";
const REWARD_IDS = [
  "gain_essence",
  "gain_omens",
  "increase_max_essence",
] as const;

type RiskRewardId = (typeof REWARD_IDS)[number];

type RiskReward = {
  readonly text: string;
  readonly payloads: readonly unknown[];
  readonly value: number;
};

type Downside = {
  readonly envelope: RandomPrecommittedOutcome;
  readonly text: string;
};

function pickSequentialVariant<T>(
  args: ShapeFillArgs,
  label: string,
  variants: readonly T[],
): T {
  return variants[drawInt(args.drawContext, label, 0, variants.length - 1)]!;
}

function odds(percent: number): RandomOdds {
  return { numerator: percent, denominator: 100, percent };
}

function randomVisibility(
  outcomeVisibility: RandomVisibilityPolicy["outcomeVisibility"],
  disclosure: string,
  playerVisible: boolean,
): RandomVisibilityPolicy {
  return { outcomeVisibility, disclosure, playerVisible };
}

function materializeSharedReward(
  args: ShapeFillArgs,
  templateId: RiskRewardId,
): RiskReward {
  const template = getReward(templateId);
  const params = template.rollParams(args.context, {
    ...args.drawContext,
    selectionAttempt:
      (args.drawContext.selectionAttempt ?? 0) * 100 + templateId.length,
  }) as TemplateParams;
  const text = template.render(params as never, args.context);
  const convertedEssence = template.cec(params as never, args.context);
  const sharedPayload = {
    kind: "shared_reward_template",
    templateId,
    params,
    text,
    convertedEssence,
  };

  if (templateId === "gain_essence") {
    return {
      text: `${text} and 1 omen.`,
      payloads: [sharedPayload, { kind: "gain_omens", amount: 1 }],
      value: convertedEssence + valueOmenGain(1),
    };
  }

  if (templateId === "gain_omens") {
    const essence = args.stage === "late" ? 90 : args.stage === "mid" ? 65 : 45;

    return {
      text: `${text} and ${essence} essence.`,
      payloads: [sharedPayload, { kind: "gain_essence", amount: essence }],
      value: convertedEssence + valueEssenceGain(essence, args.context),
    };
  }

  return {
    text,
    payloads: [sharedPayload],
    value: convertedEssence,
  };
}

function riskReward(args: ShapeFillArgs): RiskReward {
  const templateIds = shuffleDeterministic(
    args.drawContext,
    `${SHAPE_ID}:reward-order`,
    REWARD_IDS,
  );
  const templateId = pickSequentialVariant(
    args,
    `${SHAPE_ID}:reward-frame`,
    templateIds,
  );

  return materializeSharedReward(args, templateId);
}

function randomBaneChanceEnvelope(args: {
  readonly fillArgs: ShapeFillArgs;
  readonly optionNumber: number;
  readonly chancePercent: number;
}): Downside {
  const baneName = BANE_NAMES[
    drawInt(
      args.fillArgs.drawContext,
      `${SHAPE_ID}:chance-bane`,
      0,
      BANE_NAMES.length - 1,
    )
  ]!;
  const roll = drawInt(args.fillArgs.drawContext, `${SHAPE_ID}:chance-bane-roll`, 1, 100);
  const baneValue = valueBaneGain(baneName, 1);

  return {
    envelope: {
      kind: "chance_to_gain_bane",
      optionNumber: args.optionNumber,
      odds: odds(args.chancePercent),
      baneName,
      count: 1,
      committedResult: roll <= args.chancePercent ? "bane" : "safe",
      visibilityPolicy: randomVisibility(
        "pre_rolled",
        "The downside odds are visible and the safe/downside result is precommitted.",
        true,
      ),
      expectedConvertedEssence: Math.round(baneValue * (args.chancePercent / 100)),
      riskPremiumConvertedEssence: -baneValue,
      worstCaseBurdenConvertedEssence: baneValue,
      presentation: "random_bane_burden",
    },
    text: `gain 1 ${baneName}`,
  };
}

function randomRiskCostEnvelope(args: {
  readonly fillArgs: ShapeFillArgs;
  readonly optionNumber: number;
  readonly chancePercent: number;
}): Downside {
  const essence = drawInt(
    args.fillArgs.drawContext,
    `${SHAPE_ID}:random-risk-cost-amount`,
    args.fillArgs.stage === "early" ? 45 : args.fillArgs.stage === "mid" ? 70 : 95,
    args.fillArgs.stage === "early" ? 90 : args.fillArgs.stage === "mid" ? 140 : 190,
  );
  const roll = drawInt(args.fillArgs.drawContext, `${SHAPE_ID}:random-risk-cost-roll`, 1, 100);

  return {
    envelope: {
      kind: "chance_to_pay_cost",
      optionNumber: args.optionNumber,
      odds: odds(args.chancePercent),
      cost: { kind: "essence", amount: essence, timing: "immediate" },
      committedResult: roll <= args.chancePercent ? "paid" : "free",
      visibilityPolicy: randomVisibility(
        "pre_rolled",
        "The downside odds are visible and the safe/downside result is precommitted.",
        true,
      ),
      expectedConvertedEssence: -Math.round(essence * (args.chancePercent / 100)),
      riskPremiumConvertedEssence: -essence,
      worstCaseBurdenConvertedEssence: -essence,
      presentation: "random_essence_cost",
    },
    text: `pay ${essence} essence`,
  };
}

function option(args: {
  readonly number: number;
  readonly text: string;
  readonly effects?: readonly unknown[];
  readonly effect?: number;
  readonly uncertainty?: number;
  readonly pickBehavior?: JourneyOption["pickBehavior"];
}): JourneyOption {
  const effectConvertedEssence = args.effect ?? 0;
  const uncertaintyConvertedEssence = args.uncertainty ?? 0;
  const built = {
    number: args.number,
    symbols: [],
    text: args.text,
    operations: [],
    costs: [],
    effects: [...(args.effects ?? [])],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence,
    netConvertedEssence: effectConvertedEssence + uncertaintyConvertedEssence,
    pickBehavior: args.pickBehavior ?? "record_and_generate_next",
  };

  return {
    ...built,
    operations: buildJourneyOptionOperations(built),
  };
}

function downsideChance(stage: JourneyStage, args: ShapeFillArgs): number {
  return pickSequentialVariant(
    args,
    `${SHAPE_ID}:downside-chance`,
    stage === "early"
      ? [35, 45, 50, 65, 75]
      : stage === "mid"
        ? [45, 50, 65, 75, 85]
        : [50, 65, 75, 85, 90],
  );
}

export function riskOrSkipFill(args: ShapeFillArgs): FilledJourney {
  const reward = riskReward(args);
  const downsideChancePercent = downsideChance(args.stage, args);
  const downsideKind = pickSequentialVariant(
    args,
    `${SHAPE_ID}:downside-kind`,
    ["bane", "random_cost"] as const,
  );
  const riskConstraint = {
    constraintKind: "shape_invariant" as const,
    shapeId: SHAPE_ID,
    ruleId: "risk_or_skip_bounded_downside" as const,
    label:
      "The accept option has one bounded random downside and the leave option stays safe.",
  };
  const downside = downsideKind === "bane"
    ? randomBaneChanceEnvelope({
        fillArgs: args,
        optionNumber: 1,
        chancePercent: downsideChancePercent,
      })
    : randomRiskCostEnvelope({
        fillArgs: args,
        optionNumber: 1,
        chancePercent: downsideChancePercent,
      });
  const riskEnvelope = {
    ...downside.envelope,
    constraints: [riskConstraint],
  };
  const downsideUncertainty = -reward.value + 5;
  const precommitted = {
    random: [riskEnvelope],
  };

  return {
    options: [
      option({
        number: 1,
        text: `${reward.text.replace(/\.$/u, "")}. ${downsideChancePercent}% chance to ${downside.text}; otherwise no downside.`,
        effects: reward.payloads,
        effect: reward.value,
        uncertainty: downsideUncertainty,
      }),
      option({
        number: 2,
        text: "Leave with no effect.",
        pickBehavior: "leave",
      }),
    ],
    precommitted: {
      ...precommitted,
      operations: buildPrecommittedOperations(precommitted),
    },
  };
}
