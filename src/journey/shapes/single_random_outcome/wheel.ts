import type { JourneyContext } from "../../../quest/context.js";
import { drawInt, type DrawContext } from "../../../util/rng.js";
import {
  averageValue,
  emptyOption,
  essenceCost,
  lowerFirst,
  randomVisibility,
  stripTerminalPeriod,
  visibleRewardPool,
} from "./pool.js";
import type {
  JourneyOption,
  JourneyRewardPool,
  JourneyStage,
  RandomPrecommittedOutcome,
} from "../../manifest.js";

export function wheelRootOptions(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage: JourneyStage;
}): {
  options: JourneyOption[];
  rewardPool: JourneyRewardPool;
  precommitted: RandomPrecommittedOutcome[];
} {
  const wheel = visibleRewardPool(args);
  const candidates = wheel.candidates;
  const poolId = `${args.label}:visible-reward-pool`;
  const firstRoll = drawInt(args.drawContext, `${args.label}:roll-twice:first`, 1, 100);
  const secondRoll = drawInt(args.drawContext, `${args.label}:roll-twice:second`, 1, 100);
  const keptRoll = Math.max(firstRoll, secondRoll);
  const randomRangeMinimum = [40, 60, 80][
    drawInt(args.drawContext, `${args.label}:range-min`, 0, 2)
  ]!;
  const randomRangeMaximum = randomRangeMinimum + [40, 60, 80][
    drawInt(args.drawContext, `${args.label}:range-width`, 0, 2)
  ]!;
  const committedAmount = drawInt(
    args.drawContext,
    `${args.label}:range-amount`,
    randomRangeMinimum,
    randomRangeMaximum,
  );
  const drawCount = 2;
  const drawIndexes = Array.from({ length: drawCount }, (_, index) =>
    drawInt(args.drawContext, `${args.label}:draw:${index + 1}`, 0, candidates.length - 1)
  );
  const selected = candidates[drawIndexes[0] ?? 0] ?? candidates[0]!;
  const price = Math.min(60, args.context.state.quest.resources.essence);
  const entryCost = essenceCost(args.context, price);
  const expectedConvertedEssence = averageValue(candidates);
  const randomRangeExpected = Math.round((randomRangeMinimum + randomRangeMaximum) / 2);

  return {
    options: [
      emptyOption({
        number: 1,
        text: `${entryCost.text}. Spin the visible wheel; committed outcome: ${stripTerminalPeriod(lowerFirst(selected.text))}.`,
        symbols: ["cost", "random", "reward"],
        costs: [entryCost],
        costConvertedEssence: entryCost.convertedEssence,
        effectConvertedEssence: expectedConvertedEssence,
        uncertaintyConvertedEssence: -12,
      }),
      emptyOption({
        number: 2,
        text: `Roll twice and keep one (${firstRoll}, ${secondRoll}; kept ${keptRoll}). Gain ${randomRangeMinimum}-${randomRangeMaximum} random essence.`,
        symbols: ["random", "reward"],
        effectConvertedEssence: randomRangeExpected,
        uncertaintyConvertedEssence: -10,
      }),
    ],
    rewardPool: wheel.rewardPool,
    precommitted: [
      wheel.visiblePoolEnvelope,
      {
        kind: "gain_one_random_reward",
        optionNumber: 1,
        poolId,
        rewards: wheel.rewardPool.rewards,
        committedReward: selected.payloads,
        visibilityPolicy: randomVisibility(
          "pre_rolled",
          "The wheel result is pre-rolled and shown in root option copy.",
          true,
        ),
        expectedConvertedEssence,
        riskPremiumConvertedEssence: -12,
        worstCaseBurdenConvertedEssence: 0,
        presentation: "bounded_wheel_visible_result",
      },
      {
        kind: "roll_twice_keep_one",
        optionNumber: 2,
        rolls: [firstRoll, secondRoll],
        keptRoll,
        outcomes: [
          {
            kind: "shared_reward_template",
            templateId: "gain_essence_random_range",
            params: { min: randomRangeMinimum, max: randomRangeMinimum },
            text: `Gain ${randomRangeMinimum} essence`,
            convertedEssence: randomRangeMinimum,
          },
          {
            kind: "shared_reward_template",
            templateId: "gain_essence_random_range",
            params: { min: randomRangeMaximum, max: randomRangeMaximum },
            text: `Gain ${randomRangeMaximum} essence`,
            convertedEssence: randomRangeMaximum,
          },
        ],
        visibilityPolicy: randomVisibility(
          "pre_rolled",
          "Both rolls are committed in metadata; the better roll is kept.",
          true,
        ),
        expectedConvertedEssence: randomRangeExpected,
        riskPremiumConvertedEssence: -6,
        worstCaseBurdenConvertedEssence: 0,
        presentation: "bounded_wheel_roll_twice_keep_one",
      },
      {
        kind: "random_range",
        optionNumber: 2,
        resource: "essence",
        minimum: randomRangeMinimum,
        maximum: randomRangeMaximum,
        committedAmount,
        visibilityPolicy: randomVisibility(
          "visible",
          "The random resource range is visible before choosing.",
          true,
        ),
        expectedConvertedEssence: randomRangeExpected,
        riskPremiumConvertedEssence: -5,
        worstCaseBurdenConvertedEssence: 0,
        presentation: "bounded_wheel_random_range",
      },
      {
        kind: "repeated_pool_draws",
        optionNumber: 1,
        poolId,
        drawCount,
        rewards: wheel.rewardPool.rewards,
        committedDraws: drawIndexes.map((index) => candidates[index]!.payloads),
        replacement: "with_replacement",
        visibilityPolicy: randomVisibility(
          "pre_rolled",
          "Repeated draws use the visible pool with replacement and are committed in metadata.",
          true,
        ),
        expectedConvertedEssence: expectedConvertedEssence * drawCount,
        riskPremiumConvertedEssence: -12,
        worstCaseBurdenConvertedEssence: 0,
        presentation: "bounded_wheel_repeated_pool_draws",
      },
    ],
  };
}
