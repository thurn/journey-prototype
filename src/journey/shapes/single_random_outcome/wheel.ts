import type { JourneyContext } from "../../../quest/context.js";
import { drawInt, type DrawContext } from "../../../util/rng.js";
import {
  averageValue,
  randomVisibility,
  visibleWheelPool,
  worstCaseBurden,
} from "../../fillers/randomPayloads.js";
import {
  cost,
  gainEssence,
  lowerFirst,
  option,
  pickSequentialVariant,
} from "../../fillers/shared.js";
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
  const wheel = visibleWheelPool(args);
  const candidates = wheel.candidates;
  const poolId = `${args.label}:visible-wheel`;
  const firstRoll = drawInt(args.drawContext, `${args.label}:roll-twice:first`, 1, 100);
  const secondRoll = drawInt(args.drawContext, `${args.label}:roll-twice:second`, 1, 100);
  const keptRoll = Math.max(firstRoll, secondRoll);
  const randomRangeMinimum = pickSequentialVariant(
    args.drawContext,
    `${args.label}:range-min`,
    [40, 60, 80],
  );
  const randomRangeMaximum = randomRangeMinimum + pickSequentialVariant(
    args.drawContext,
    `${args.label}:range-width`,
    [40, 60, 80],
  );
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
  const expectedConvertedEssence = averageValue(candidates);

  return {
    options: [
      option({
        number: 1,
        text: `Pay ${price} essence. Spin the visible wheel; committed outcome: ${lowerFirst(selected.text).replace(/\.$/u, "")}.`,
        costs: [cost("essence", price)],
        effects: [{ kind: "random_reward", table: "visible_wheel", poolId }],
        cost: price,
        effect: price + 190,
        uncertainty: -12,
      }),
      option({
        number: 2,
        text: `Roll twice and keep one (${firstRoll}, ${secondRoll}; kept ${keptRoll}). Gain ${randomRangeMinimum}-${randomRangeMaximum} random essence.`,
        effects: [
          { kind: "random_reward", table: "roll_twice_keep_one" },
          {
            kind: "resource_random_range",
            resource: "essence",
            amount: committedAmount,
            minimum: randomRangeMinimum,
            maximum: randomRangeMaximum,
            extra: { resourceAmountKind: "random_range" },
          },
        ],
        effect: price + 190,
        uncertainty: -10,
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
        worstCaseBurdenConvertedEssence: worstCaseBurden(candidates),
        presentation: "bounded_wheel_visible_result",
      },
      {
        kind: "roll_twice_keep_one",
        optionNumber: 2,
        rolls: [firstRoll, secondRoll],
        keptRoll,
        outcomes: [gainEssence(randomRangeMinimum), gainEssence(randomRangeMaximum)],
        visibilityPolicy: randomVisibility(
          "pre_rolled",
          "Both rolls are committed in metadata; the better roll is kept.",
          true,
        ),
        expectedConvertedEssence: Math.round((randomRangeMinimum + randomRangeMaximum) / 2),
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
        expectedConvertedEssence: Math.round((randomRangeMinimum + randomRangeMaximum) / 2),
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
        worstCaseBurdenConvertedEssence: worstCaseBurden(candidates) * drawCount,
        presentation: "bounded_wheel_repeated_pool_draws",
      },
    ],
  };
}
