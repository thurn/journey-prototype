import type { JourneyContext } from "../../../quest/context.js";
import { drawInt, weightedChoice, type DrawContext } from "../../../util/rng.js";
import type {
  JourneyOption,
  RandomEnvelopeConstraint,
  RandomOdds,
  RandomPrecommittedOutcome,
  RandomVisibilityPolicy,
} from "../../manifest.js";
import { buildPrecommittedOperations } from "../../operationBuilders.js";
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
const FIRST_RISK_PREMIUM = -12;
const SECOND_RISK_PREMIUM = -16;
const REWARD_CANDIDATE_ATTEMPTS = 3;
const NEAR_NEUTRAL_NET_FLOOR = -10;

type RolledReward = {
  readonly template: Reward;
  readonly params: TemplateParams;
  readonly cec: number;
  readonly text: string;
  readonly weight: number;
};

type WagerRewardCandidate = {
  readonly reward: RolledReward;
  readonly stake: SharedCostStake;
  readonly successPercent: number;
  readonly riskPremiumConvertedEssence: number;
  readonly netConvertedEssence: number;
};

type WagerRewardPair = {
  readonly first: WagerRewardCandidate;
  readonly second: WagerRewardCandidate;
  readonly spread: number;
  readonly weight: number;
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

function materializeReward(
  context: JourneyContext,
  draw: DrawContext,
  template: Reward,
  attempt: number,
): RolledReward | undefined {
  const params = template.rollParams(context, {
    ...draw,
    selectionAttempt:
      ((draw.selectionAttempt ?? 0) * 100) + attempt * 100 + template.id.length,
  }) as TemplateParams;

  if (!template.viable(params as never, context)) {
    return undefined;
  }

  const cec = template.cec(params as never, context);
  if (cec <= 0) {
    return undefined;
  }

  return {
    template,
    params,
    cec,
    text: template.render(params as never, context),
    weight: template.weight,
  };
}

function rewardCandidates(
  context: JourneyContext,
  draw: DrawContext,
  used: ReadonlySet<string>,
): readonly RolledReward[] {
  const candidates: RolledReward[] = [];

  for (let attempt = 0; attempt < REWARD_CANDIDATE_ATTEMPTS; attempt += 1) {
    for (const template of REWARDS) {
      if (used.has(template.id)) {
        continue;
      }

      const reward = materializeReward(context, draw, template, attempt);
      if (!reward) {
        continue;
      }

      if (!meetsRewardDistinctness(reward, used)) {
        continue;
      }

      candidates.push(reward);
    }
  }

  if (candidates.length === 0) {
    throw new Error("single_wager fill could not roll a viable shared reward");
  }

  return candidates;
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

function stripTerminalPeriod(text: string): string {
  return text.replace(/\.$/u, "");
}

function expectedNetConvertedEssence(args: {
  readonly reward: RolledReward;
  readonly stake: SharedCostStake;
  readonly successPercent: number;
  readonly riskPremiumConvertedEssence: number;
}): number {
  return (
    Math.round(args.reward.cec * (args.successPercent / 100)) -
    args.stake.convertedEssence +
    args.riskPremiumConvertedEssence
  );
}

function expectedValueBand(netConvertedEssence: number): number {
  if (netConvertedEssence < NEAR_NEUTRAL_NET_FLOOR) return 0;
  if (netConvertedEssence < 30) return 1;
  if (netConvertedEssence < 90) return 2;
  if (netConvertedEssence < 180) return 3;
  if (netConvertedEssence < 400) return 4;
  if (netConvertedEssence < 900) return 5;
  return 6;
}

function comparableExpectedValues(
  firstNetConvertedEssence: number,
  secondNetConvertedEssence: number,
): boolean {
  if (
    Math.max(firstNetConvertedEssence, secondNetConvertedEssence) <
    NEAR_NEUTRAL_NET_FLOOR
  ) {
    return false;
  }

  const firstBand = expectedValueBand(firstNetConvertedEssence);
  const secondBand = expectedValueBand(secondNetConvertedEssence);
  if (Math.abs(firstBand - secondBand) > 1) {
    return false;
  }

  const spread = Math.abs(firstNetConvertedEssence - secondNetConvertedEssence);
  const magnitude = Math.max(
    Math.abs(firstNetConvertedEssence),
    Math.abs(secondNetConvertedEssence),
  );
  const spreadLimit = Math.max(50, magnitude * 0.35);

  return spread <= spreadLimit;
}

function candidateFor(args: {
  readonly reward: RolledReward;
  readonly stake: SharedCostStake;
  readonly successPercent: number;
  readonly riskPremiumConvertedEssence: number;
}): WagerRewardCandidate {
  return {
    ...args,
    netConvertedEssence: expectedNetConvertedEssence(args),
  };
}

function pairWeight(
  first: WagerRewardCandidate,
  second: WagerRewardCandidate,
): number {
  const spread = Math.abs(first.netConvertedEssence - second.netConvertedEssence);
  const balanceWeight = 1 / (1 + spread / 50);
  const upsideWeight =
    Math.max(first.netConvertedEssence, second.netConvertedEssence) >= 0
      ? 2
      : 1;

  return first.reward.weight * second.reward.weight * balanceWeight * upsideWeight;
}

function buildRewardPairs(args: {
  readonly firstRewards: readonly RolledReward[];
  readonly secondRewards: readonly RolledReward[];
  readonly firstStake: SharedCostStake;
  readonly secondStake: SharedCostStake;
  readonly firstSuccessPercent: number;
  readonly secondSuccessPercent: number;
}): readonly WagerRewardPair[] {
  const pairs: WagerRewardPair[] = [];

  for (const firstReward of args.firstRewards) {
    const usedByFirst = new Set(consumedRewardIds(firstReward));
    const first = candidateFor({
      reward: firstReward,
      stake: args.firstStake,
      successPercent: args.firstSuccessPercent,
      riskPremiumConvertedEssence: FIRST_RISK_PREMIUM,
    });

    for (const secondReward of args.secondRewards) {
      if (!meetsRewardDistinctness(secondReward, usedByFirst)) {
        continue;
      }

      const second = candidateFor({
        reward: secondReward,
        stake: args.secondStake,
        successPercent: args.secondSuccessPercent,
        riskPremiumConvertedEssence: SECOND_RISK_PREMIUM,
      });

      if (
        !comparableExpectedValues(
          first.netConvertedEssence,
          second.netConvertedEssence,
        )
      ) {
        continue;
      }

      pairs.push({
        first,
        second,
        spread: Math.abs(first.netConvertedEssence - second.netConvertedEssence),
        weight: pairWeight(first, second),
      });
    }
  }

  return pairs;
}

function fallbackRewardPair(args: {
  readonly firstRewards: readonly RolledReward[];
  readonly secondRewards: readonly RolledReward[];
  readonly firstStake: SharedCostStake;
  readonly secondStake: SharedCostStake;
  readonly firstSuccessPercent: number;
  readonly secondSuccessPercent: number;
}): WagerRewardPair {
  let best: WagerRewardPair | undefined;

  for (const firstReward of args.firstRewards) {
    const usedByFirst = new Set(consumedRewardIds(firstReward));
    const first = candidateFor({
      reward: firstReward,
      stake: args.firstStake,
      successPercent: args.firstSuccessPercent,
      riskPremiumConvertedEssence: FIRST_RISK_PREMIUM,
    });

    for (const secondReward of args.secondRewards) {
      if (!meetsRewardDistinctness(secondReward, usedByFirst)) {
        continue;
      }

      const second = candidateFor({
        reward: secondReward,
        stake: args.secondStake,
        successPercent: args.secondSuccessPercent,
        riskPremiumConvertedEssence: SECOND_RISK_PREMIUM,
      });
      const pair = {
        first,
        second,
        spread: Math.abs(first.netConvertedEssence - second.netConvertedEssence),
        weight: pairWeight(first, second),
      };

      if (
        best === undefined ||
        Math.max(pair.first.netConvertedEssence, pair.second.netConvertedEssence) >
          Math.max(best.first.netConvertedEssence, best.second.netConvertedEssence) ||
        (Math.max(pair.first.netConvertedEssence, pair.second.netConvertedEssence) ===
          Math.max(best.first.netConvertedEssence, best.second.netConvertedEssence) &&
          pair.spread < best.spread)
      ) {
        best = pair;
      }
    }
  }

  if (!best) {
    throw new Error("single_wager fill could not pair viable shared rewards");
  }

  return best;
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
    text: `Pay ${args.stake.params.x} essence. ${args.successPercent}% chance. On success: ${stripTerminalPeriod(args.reward.text)}; on failure: gain nothing.`,
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
  const firstRewards = rewardCandidates(context, drawContext, new Set());
  const secondRewards = rewardCandidates(
    context,
    { ...drawContext, sequenceStep: (drawContext.sequenceStep ?? 0) + 1 },
    new Set(),
  );
  const viablePairs = buildRewardPairs({
    firstRewards,
    secondRewards,
    firstStake,
    secondStake,
    firstSuccessPercent,
    secondSuccessPercent,
  });
  const selectedPair =
    viablePairs.length > 0
      ? weightedChoice(
          drawContext,
          "single_wager:reward_pair",
          viablePairs.map((pair) => ({ item: pair, weight: pair.weight })),
        )
      : fallbackRewardPair({
          firstRewards,
          secondRewards,
          firstStake,
          secondStake,
          firstSuccessPercent,
          secondSuccessPercent,
        });
  const firstRoll = drawInt(drawContext, "single_wager:roll:1", 1, 100);
  const secondRoll = drawInt(drawContext, "single_wager:roll:2", 1, 100);
  const precommitted = {
    random: [
      precommittedWager({
        optionNumber: 1,
        stake: firstStake,
        reward: selectedPair.first.reward,
        successPercent: firstSuccessPercent,
        roll: firstRoll,
        riskPremiumConvertedEssence: FIRST_RISK_PREMIUM,
      }),
      precommittedWager({
        optionNumber: 2,
        stake: secondStake,
        reward: selectedPair.second.reward,
        successPercent: secondSuccessPercent,
        roll: secondRoll,
        riskPremiumConvertedEssence: SECOND_RISK_PREMIUM,
      }),
    ],
  };

  return {
    options: [
      optionFor({
        number: 1,
        stake: firstStake,
        reward: selectedPair.first.reward,
        successPercent: firstSuccessPercent,
        riskPremiumConvertedEssence: FIRST_RISK_PREMIUM,
      }),
      optionFor({
        number: 2,
        stake: secondStake,
        reward: selectedPair.second.reward,
        successPercent: secondSuccessPercent,
        riskPremiumConvertedEssence: SECOND_RISK_PREMIUM,
      }),
    ],
    precommitted: {
      ...precommitted,
      operations: buildPrecommittedOperations(precommitted),
    },
  };
}
