import { drawInt } from "../../../util/rng.js";
import { buildPrecommittedOperations } from "../../operationBuilders.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";
import {
  averageValue,
  emptyOption,
  essenceCost,
  flattenPayloads,
  randomVisibility,
  stripTerminalPeriod,
  visibleRewardPool,
} from "./pool.js";

const SHAPE_LABEL = "single_random_outcome";
const REWARD_COUNT = 3;
const ESSENCE_COST_BY_STAGE = {
  early: 20,
  mid: 30,
  late: 40,
} as const;

export function singleRandomOutcomeFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext, stage } = args;
  const pool = visibleRewardPool({
    context,
    drawContext,
    label: `${SHAPE_LABEL}:reward`,
    stage,
    size: REWARD_COUNT,
  });
  const candidates = pool.candidates;
  if (candidates.length !== REWARD_COUNT) {
    throw new Error("single_random_outcome fill requires exactly three visible rewards");
  }

  const poolId = `${SHAPE_LABEL}:reward:visible-reward-pool`;
  const rewards = flattenPayloads(candidates);
  const committedIndex = drawInt(
    drawContext,
    `${SHAPE_LABEL}:committed-reward`,
    0,
    candidates.length - 1,
  );
  const committedReward = candidates[committedIndex]!;
  const entryCost = essenceCost(
    context,
    Math.min(ESSENCE_COST_BY_STAGE[stage], context.state.quest.resources.essence),
  );
  const rewardList = candidates
    .map((candidate) => `- ${stripTerminalPeriod(candidate.text)}`)
    .join("\n");
  const option = emptyOption({
    number: 1,
    text: `${entryCost.text}. Gain one of the following at random:\n${rewardList}`,
    symbols: ["cost", "random", "reward"],
    costs: [entryCost],
    costConvertedEssence: entryCost.convertedEssence,
    effectConvertedEssence: averageValue(candidates),
    uncertaintyConvertedEssence: -8,
    rewardTemplateIds: candidates.map((candidate) => candidate.payloads[0]!.templateId),
  });
  const visiblePool = {
    ...pool.visiblePoolEnvelope,
    poolId,
    summary: "Gain one of the following visible rewards at random.",
    rewards,
    presentation: "single_random_outcome_visible_pool",
  };
  const randomReward = {
    kind: "gain_one_random_reward",
    optionNumber: 1,
    poolId,
    rewards,
    committedReward: committedReward.payloads,
    visibilityPolicy: randomVisibility(
      "hidden_until_resolution",
      "The visible pool is disclosed, but the selected reward stays hidden until resolution.",
      false,
      "after entry",
    ),
    expectedConvertedEssence: averageValue(candidates),
    riskPremiumConvertedEssence: -8,
    worstCaseBurdenConvertedEssence: 0,
    presentation: "single_random_outcome_gain_one_random_reward",
  } as const;
  const precommitted = {
    random: [visiblePool, randomReward],
  };

  return {
    options: [option],
    precommitted: {
      ...precommitted,
      operations: buildPrecommittedOperations(precommitted),
    },
  };
}
