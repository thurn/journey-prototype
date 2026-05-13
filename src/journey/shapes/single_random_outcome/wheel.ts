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

function essenceAmountForKeptRoll(minimum: number, maximum: number, keptRoll: number): number {
  return minimum + Math.round(((maximum - minimum) * (keptRoll - 1)) / 99);
}

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
  const committedAmount = essenceAmountForKeptRoll(
    randomRangeMinimum,
    randomRangeMaximum,
    keptRoll,
  );
  const drawCount = 2;
  const drawIndexes = Array.from({ length: drawCount }, (_, index) =>
    drawInt(args.drawContext, `${args.label}:draw:${index + 1}`, 0, candidates.length - 1)
  );
  const drawnCandidates = drawIndexes.map((index) => candidates[index] ?? candidates[0]!);
  const drawnText = drawnCandidates
    .map((candidate) => stripTerminalPeriod(lowerFirst(candidate.text)))
    .join("; ");
  const drawnValue = drawnCandidates.reduce((total, candidate) => total + candidate.value, 0);
  const wheelPrice = Math.min(
    args.context.state.quest.resources.essence,
    Math.max(10, Math.round(drawnValue * 0.15)),
  );
  const rollPrice = Math.min(20, args.context.state.quest.resources.essence);
  const entryCost = essenceCost(args.context, wheelPrice);
  const rollCost = essenceCost(args.context, rollPrice);
  const randomRangeExpected = Math.round((randomRangeMinimum + randomRangeMaximum) / 2);

  return {
    options: [
      emptyOption({
        number: 1,
        text: `${entryCost.text}. Spin the visible wheel twice; gain both shown results: ${drawnText}.`,
        symbols: ["cost", "random", "reward"],
        costs: [entryCost],
        costConvertedEssence: entryCost.convertedEssence,
        effectConvertedEssence: drawnValue,
        uncertaintyConvertedEssence: -8,
      }),
      emptyOption({
        number: 2,
        text: `${rollCost.text}. Gain the better of two essence rolls: ${committedAmount} essence (rolls ${firstRoll}, ${secondRoll}; kept ${keptRoll}).`,
        symbols: ["cost", "random", "reward"],
        costs: [rollCost],
        costConvertedEssence: rollCost.convertedEssence,
        effectConvertedEssence: committedAmount,
        uncertaintyConvertedEssence: -4,
      }),
    ],
    rewardPool: wheel.rewardPool,
    precommitted: [
      wheel.visiblePoolEnvelope,
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
          "Both rolls are committed in metadata; the kept roll maps to the visible essence amount.",
          true,
        ),
        expectedConvertedEssence: committedAmount,
        riskPremiumConvertedEssence: -4,
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
          "The committed essence result is visible before choosing.",
          true,
        ),
        expectedConvertedEssence: randomRangeExpected,
        riskPremiumConvertedEssence: -2,
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
          "Repeated wheel draws use the visible pool with replacement and are shown in root option copy.",
          true,
        ),
        expectedConvertedEssence: drawnValue,
        riskPremiumConvertedEssence: -8,
        worstCaseBurdenConvertedEssence: 0,
        presentation: "bounded_wheel_repeated_pool_draws",
      },
    ],
  };
}
