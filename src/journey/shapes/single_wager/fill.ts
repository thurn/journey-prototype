import type { JourneyContext } from "../../../quest/context.js";
import { drawInt, weightedChoice, type DrawContext } from "../../../util/rng.js";
import type {
  JourneyOption,
  RandomEnvelopeConstraint,
  RandomOdds,
  RandomPrecommittedOutcome,
  RandomVisibilityPolicy,
} from "../../manifest.js";
import { getCost } from "../../shared/costs.js";
import { REWARDS } from "../../shared/rewards.js";
import type { Reward, TemplateParams } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_ID = "single_wager";
const PAY_ESSENCE_COST = getCost("pay_essence");
const FIRST_STAKE_CAP = 30;
const SECOND_STAKE_CAP = 50;
const FIRST_ODDS = [45, 50, 55] as const;
const SECOND_ODDS = [60, 65, 70] as const;

type RolledReward = {
  readonly template: Reward;
  readonly params: TemplateParams;
  readonly cec: number;
  readonly text: string;
};

type SharedRewardOutcome = {
  readonly kind: "shared_reward_template";
  readonly templateId: string;
  readonly params: TemplateParams;
  readonly text: string;
  readonly convertedEssence: number;
};

type SharedCostStake = {
  readonly kind: "shared_cost_template";
  readonly templateId: "pay_essence";
  readonly params: { readonly x: number };
  readonly text: string;
  readonly convertedEssence: number;
};

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function pickVariant<T>(
  draw: DrawContext,
  label: string,
  variants: readonly T[],
): T {
  return variants[drawInt(draw, label, 0, variants.length - 1)]!;
}

function odds(percent: number): RandomOdds {
  return {
    numerator: percent,
    denominator: 100,
    percent,
  };
}

function randomVisibility(
  outcomeVisibility: RandomVisibilityPolicy["outcomeVisibility"],
  disclosure: string,
  playerVisible: boolean,
): RandomVisibilityPolicy {
  return {
    outcomeVisibility,
    disclosure,
    playerVisible,
  };
}

function rewardSubIds(rolled: RolledReward): readonly string[] {
  if (rolled.template.id === "meta_gain_2_rewards") {
    const params = rolled.params as { readonly subIds?: readonly string[] };
    return params.subIds ?? [];
  }

  return [];
}

function consumedRewardIds(rolled: RolledReward): readonly string[] {
  return [rolled.template.id, ...rewardSubIds(rolled)];
}

function meetsRewardDistinctness(
  rolled: RolledReward,
  used: ReadonlySet<string>,
): boolean {
  return consumedRewardIds(rolled).every((id) => !used.has(id));
}

function rollReward(
  context: JourneyContext,
  draw: DrawContext,
  label: string,
  used: ReadonlySet<string>,
): RolledReward {
  const candidates: Array<{ readonly reward: RolledReward; readonly weight: number }> = [];

  for (const template of REWARDS) {
    if (used.has(template.id)) {
      continue;
    }

    const params = template.rollParams(context, {
      ...draw,
      selectionAttempt: ((draw.selectionAttempt ?? 0) * 100) + template.id.length,
    }) as TemplateParams;

    if (!template.viable(params as never, context)) {
      continue;
    }

    const cec = template.cec(params as never, context);
    if (cec <= 0) {
      continue;
    }

    const reward = {
      template,
      params,
      cec,
      text: template.render(params as never, context),
    };

    if (!meetsRewardDistinctness(reward, used)) {
      continue;
    }

    candidates.push({ reward, weight: template.weight });
  }

  if (candidates.length === 0) {
    throw new Error("single_wager fill could not roll a viable shared reward");
  }

  return weightedChoice(
    draw,
    label,
    candidates.map((candidate) => ({
      item: candidate.reward,
      weight: candidate.weight,
    })),
  );
}

function essenceStake(context: JourneyContext, amount: number): SharedCostStake {
  const params = { x: amount };

  return {
    kind: "shared_cost_template",
    templateId: "pay_essence",
    params,
    text: PAY_ESSENCE_COST.render(params as never, context),
    convertedEssence: PAY_ESSENCE_COST.cec(params as never, context),
  };
}

function rewardOutcome(reward: RolledReward): SharedRewardOutcome {
  return {
    kind: "shared_reward_template",
    templateId: reward.template.id,
    params: reward.params,
    text: reward.text,
    convertedEssence: reward.cec,
  };
}

function wagerConstraint(): RandomEnvelopeConstraint {
  return {
    constraintKind: "shape_invariant",
    shapeId: SHAPE_ID,
    ruleId: "single_wager_known_stake",
    label:
      "The stake, odds, success reward, and failure outcome are visible before commitment.",
  };
}

function optionFor(args: {
  readonly number: number;
  readonly stake: SharedCostStake;
  readonly reward: RolledReward;
  readonly successPercent: number;
  readonly riskPremiumConvertedEssence: number;
}): JourneyOption {
  const expectedRewardCec = Math.round(
    args.reward.cec * (args.successPercent / 100),
  );
  const netCec =
    expectedRewardCec -
    args.stake.convertedEssence +
    args.riskPremiumConvertedEssence;

  return {
    number: args.number,
    symbols: ["cost", "reward", "random"],
    text: `Pay ${args.stake.params.x} essence. ${args.successPercent}% chance to ${lowerFirst(args.reward.text).replace(/\.$/u, "")}; otherwise gain nothing.`,
    operations: [],
    costs: [args.stake],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: args.stake.convertedEssence,
    effectConvertedEssence: expectedRewardCec,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: args.riskPremiumConvertedEssence,
    netConvertedEssence: netCec,
    pickBehavior: "record_and_generate_next",
  };
}

function precommittedWager(args: {
  readonly optionNumber: number;
  readonly stake: SharedCostStake;
  readonly reward: RolledReward;
  readonly successPercent: number;
  readonly roll: number;
  readonly riskPremiumConvertedEssence: number;
}): RandomPrecommittedOutcome {
  return {
    kind: "wager",
    optionNumber: args.optionNumber,
    odds: odds(args.successPercent),
    stake: args.stake,
    success: rewardOutcome(args.reward),
    failure: { kind: "no_reward" },
    roll: args.roll,
    committedResult:
      args.roll <= args.successPercent ? "success" : "failure",
    visibilityPolicy: randomVisibility(
      "pre_rolled",
      "The wager odds, stake, success, and failure are visible; the roll is precommitted.",
      true,
    ),
    expectedConvertedEssence:
      Math.round(args.reward.cec * (args.successPercent / 100)) -
      args.stake.convertedEssence,
    riskPremiumConvertedEssence: args.riskPremiumConvertedEssence,
    constraints: [wagerConstraint()],
    presentation: "visible_odds_debug_roll",
  };
}

export function singleWagerFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext } = args;
  const availableEssence = Math.max(0, context.state.quest.resources.essence);
  const firstStake = essenceStake(
    context,
    Math.min(FIRST_STAKE_CAP, availableEssence),
  );
  const secondStake = essenceStake(
    context,
    Math.min(SECOND_STAKE_CAP, availableEssence),
  );
  const used = new Set<string>();
  const firstReward = rollReward(
    context,
    drawContext,
    "single_wager:reward:1",
    used,
  );
  consumedRewardIds(firstReward).forEach((id) => used.add(id));
  const secondReward = rollReward(
    context,
    { ...drawContext, sequenceStep: (drawContext.sequenceStep ?? 0) + 1 },
    "single_wager:reward:2",
    used,
  );
  const firstSuccessPercent = pickVariant(
    drawContext,
    "single_wager:odds:1",
    FIRST_ODDS,
  );
  const secondSuccessPercent = pickVariant(
    drawContext,
    "single_wager:odds:2",
    SECOND_ODDS,
  );
  const firstRoll = drawInt(drawContext, "single_wager:roll:1", 1, 100);
  const secondRoll = drawInt(drawContext, "single_wager:roll:2", 1, 100);

  return {
    options: [
      optionFor({
        number: 1,
        stake: firstStake,
        reward: firstReward,
        successPercent: firstSuccessPercent,
        riskPremiumConvertedEssence: -12,
      }),
      optionFor({
        number: 2,
        stake: secondStake,
        reward: secondReward,
        successPercent: secondSuccessPercent,
        riskPremiumConvertedEssence: -16,
      }),
    ],
    precommitted: {
      random: [
        precommittedWager({
          optionNumber: 1,
          stake: firstStake,
          reward: firstReward,
          successPercent: firstSuccessPercent,
          roll: firstRoll,
          riskPremiumConvertedEssence: -12,
        }),
        precommittedWager({
          optionNumber: 2,
          stake: secondStake,
          reward: secondReward,
          successPercent: secondSuccessPercent,
          roll: secondRoll,
          riskPremiumConvertedEssence: -16,
        }),
      ],
    },
  };
}
