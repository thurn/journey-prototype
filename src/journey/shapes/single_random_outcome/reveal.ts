import type { JourneyContext } from "../../../quest/context.js";
import { drawInt, type DrawContext } from "../../../util/rng.js";
import {
  averageValue,
  emptyOption,
  essenceCost,
  flattenPayloads,
  lowerFirst,
  randomVisibility,
  revealCount,
  revealPoolSize,
  stripTerminalPeriod,
  visibleRewardPool,
} from "./pool.js";
import type {
  JourneyOption,
  JourneyStage,
  RandomPrecommittedOutcome,
} from "../../manifest.js";

export function revealChoiceOptions(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage: JourneyStage;
}): {
  options: JourneyOption[];
  precommitted: RandomPrecommittedOutcome[];
} {
  const poolSize = revealPoolSize(args.drawContext, args.label, args.stage);
  const wheel = visibleRewardPool({
    ...args,
    size: poolSize,
  });
  const candidates = wheel.candidates;
  const poolId = `${args.label}:visible-reward-pool`;
  const revealCountValue = revealCount({
    drawContext: args.drawContext,
    label: args.label,
    stage: args.stage,
    candidateCount: candidates.length,
  });
  const allPayloads = flattenPayloads(candidates);
  const revealedCandidates = candidates.slice(0, revealCountValue);
  const revealed = flattenPayloads(revealedCandidates);
  const randomIndex = drawInt(
    args.drawContext,
    `${args.label}:revealed-random-index`,
    0,
    revealCountValue - 1,
  );
  const bonusDrawCount = { early: 3, mid: 3, late: 4 }[args.stage];
  const bonusDrawIndexes = Array.from({ length: bonusDrawCount }, (_, index) =>
    drawInt(args.drawContext, `${args.label}:bonus-draw:${index + 1}`, 0, candidates.length - 1)
  );
  const revealedText = candidates
    .slice(0, revealCountValue)
    .map((candidate) => stripTerminalPeriod(lowerFirst(candidate.text)))
    .join("; ");
  const randomRevealed = candidates[randomIndex]!;
  const expectedConvertedEssence = averageValue(revealedCandidates);
  const visiblePoolExpectedConvertedEssence = averageValue(candidates);
  const selectionPremium = essenceCost(
    args.context,
    Math.min({ early: 20, mid: 30, late: 40 }[args.stage], args.context.state.quest.resources.essence),
  );

  return {
    options: [
      emptyOption({
        number: 1,
        text: `${selectionPremium.text}. Reveal ${revealCountValue} rewards (${revealedText}). Choose one revealed reward.`,
        symbols: ["cost", "random", "reward"],
        costs: [selectionPremium],
        costConvertedEssence: selectionPremium.convertedEssence,
        effectConvertedEssence: Math.max(
          ...revealedCandidates.map((candidate) => candidate.value),
        ),
        uncertaintyConvertedEssence: -10,
      }),
      emptyOption({
        number: 2,
        text: `Reveal ${candidates.length} rewards. The revealed random reward is ${stripTerminalPeriod(lowerFirst(randomRevealed.text))}. Then gain ${bonusDrawCount} random rewards from the visible pool.`,
        symbols: ["random", "reward"],
        effectConvertedEssence:
          randomRevealed.value + visiblePoolExpectedConvertedEssence * bonusDrawCount,
        uncertaintyConvertedEssence: -10 - bonusDrawCount * 2,
      }),
    ],
    precommitted: [
      wheel.visiblePoolEnvelope,
      {
        kind: "reveal_rewards",
        optionNumber: 1,
        revealCount: revealCountValue,
        rewards: revealed,
        visibilityPolicy: randomVisibility(
          "pre_rolled",
          "The revealed rewards are pre-rolled and shown in root option copy.",
          true,
        ),
        expectedConvertedEssence,
        riskPremiumConvertedEssence: -5,
        worstCaseBurdenConvertedEssence: 0,
        presentation: "covered_cups_reveal",
      },
      {
        kind: "choose_one_revealed_reward",
        optionNumber: 1,
        revealCount: revealCountValue,
        rewards: revealed,
        visibilityPolicy: randomVisibility(
          "visible",
          "The player chooses one reward from the revealed set.",
          true,
        ),
        expectedConvertedEssence: Math.max(
          ...revealedCandidates.map((candidate) => candidate.value),
        ),
        riskPremiumConvertedEssence: 0,
        worstCaseBurdenConvertedEssence: 0,
        presentation: "covered_cups_choose_revealed",
      },
      {
        kind: "choose_one_random_revealed_reward",
        optionNumber: 2,
        revealCount: candidates.length,
        rewards: allPayloads,
        committedReward: randomRevealed.payloads,
        visibilityPolicy: randomVisibility(
          "pre_rolled",
          "A reward is selected at random from the revealed set and committed in metadata.",
          true,
        ),
        expectedConvertedEssence: averageValue(candidates),
        riskPremiumConvertedEssence: -10,
        worstCaseBurdenConvertedEssence: 0,
        presentation: "covered_cups_choose_random_revealed",
      },
      {
        kind: "repeated_pool_draws",
        optionNumber: 2,
        poolId,
        drawCount: bonusDrawCount,
        rewards: allPayloads,
        committedDraws: bonusDrawIndexes.map((index) => candidates[index]!.payloads),
        replacement: "with_replacement",
        visibilityPolicy: randomVisibility(
          "hidden_until_resolution",
          "The visible pool is disclosed, but these bonus draws stay hidden until resolution.",
          false,
          "after entry",
        ),
        expectedConvertedEssence: visiblePoolExpectedConvertedEssence * bonusDrawCount,
        riskPremiumConvertedEssence: -8 - bonusDrawCount * 2,
        worstCaseBurdenConvertedEssence: 0,
        presentation: "covered_cups_bonus_pool_draws",
      },
    ],
  };
}
