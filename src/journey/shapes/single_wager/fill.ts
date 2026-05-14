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
const STAKE_CAP = 30;
const ODDS = [45, 50, 55] as const;
const RISK_PREMIUM = -12;
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

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
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

function candidateWeight(candidate: WagerRewardCandidate): number {
  const bandWeight = expectedValueBand(candidate.netConvertedEssence) + 1;
  const downsidePenalty =
    candidate.netConvertedEssence >= 0
      ? 1
      : 1 / (1 + Math.abs(candidate.netConvertedEssence) / 50);

  return candidate.reward.weight * bandWeight * downsidePenalty;
}

function pickWagerCandidate(args: {
  readonly drawContext: DrawContext;
  readonly rewards: readonly RolledReward[];
  readonly stake: SharedCostStake;
  readonly successPercent: number;
}): WagerRewardCandidate {
  const candidates = args.rewards.map((reward) =>
    candidateFor({
      reward,
      stake: args.stake,
      successPercent: args.successPercent,
      riskPremiumConvertedEssence: RISK_PREMIUM,
    })
  );
  const viable = candidates.filter((candidate) =>
    candidate.netConvertedEssence >= NEAR_NEUTRAL_NET_FLOOR
  );

  if (viable.length === 0) {
    return candidates.reduce((best, candidate) =>
      candidate.netConvertedEssence > best.netConvertedEssence ? candidate : best
    );
  }

  return weightedChoice(
    args.drawContext,
    "single_wager:reward",
    viable.map((candidate) => ({
      item: candidate,
      weight: candidateWeight(candidate),
    })),
  );
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
    text: `Gamble ${args.stake.params.x} essence. ${args.successPercent}% chance to ${stripTerminalPeriod(lowerFirst(args.reward.text))}.`,
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
  const stake = essenceStake(
    context,
    Math.min(STAKE_CAP, availableEssence),
  );
  const successPercent = pickVariant(
    drawContext,
    "single_wager:odds",
    ODDS,
  );
  const selected = pickWagerCandidate({
    drawContext,
    rewards: rewardCandidates(context, drawContext, new Set()),
    stake,
    successPercent,
  });
  const roll = drawInt(drawContext, "single_wager:roll", 1, 100);
  const precommitted = {
    random: [
      precommittedWager({
        optionNumber: 1,
        stake: selected.stake,
        reward: selected.reward,
        successPercent: selected.successPercent,
        roll,
        riskPremiumConvertedEssence: selected.riskPremiumConvertedEssence,
      }),
    ],
  };

  return {
    options: [
      optionFor({
        number: 1,
        stake: selected.stake,
        reward: selected.reward,
        successPercent: selected.successPercent,
        riskPremiumConvertedEssence: selected.riskPremiumConvertedEssence,
      }),
    ],
    precommitted: {
      ...precommitted,
      operations: buildPrecommittedOperations(precommitted),
    },
  };
}
