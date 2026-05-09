import type { JourneyContext } from "../../../quest/context.js";
import { drawInt, type DrawContext } from "../../../util/rng.js";
import {
  averageValue,
  flattenPayloads,
  randomVisibility,
  revealCount,
  revealPoolSize,
  visibleWheelPool,
  worstCaseBurden,
} from "../../fillers/randomPayloads.js";
import { lowerFirst, option } from "../../fillers/shared.js";
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
  const wheel = visibleWheelPool({
    ...args,
    size: poolSize,
  });
  const candidates = wheel.candidates;
  const poolId = `${args.label}:visible-wheel`;
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
  const hiddenIndex = drawInt(
    args.drawContext,
    `${args.label}:hidden-random-index`,
    0,
    candidates.length - 1,
  );
  const revealedText = candidates
    .slice(0, revealCountValue)
    .map((candidate) => lowerFirst(candidate.text).replace(/\.$/u, ""))
    .join("; ");
  const randomRevealed = candidates[randomIndex]!;
  const hiddenReward = candidates[hiddenIndex]!;
  const expectedConvertedEssence = averageValue(revealedCandidates);

  return {
    options: [
      option({
        number: 1,
        text: `Reveal ${revealCountValue} rewards (${revealedText}). Choose one revealed reward.`,
        effects: [
          {
            kind: "random_reward",
            table: "reveal_choice",
            revealCount: revealCountValue,
          },
        ],
        effect: 220,
        uncertainty: -10,
      }),
      option({
        number: 2,
        text: `Reveal ${candidates.length} rewards. Choose one random revealed reward (precommitted: ${lowerFirst(randomRevealed.text).replace(/\.$/u, "")}) or gain one random reward from the visible pool.`,
        effects: [{ kind: "random_reward", table: "visible_reveal_pool" }],
        effect: 220,
        uncertainty: -14,
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
        worstCaseBurdenConvertedEssence: worstCaseBurden(revealedCandidates),
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
        worstCaseBurdenConvertedEssence: worstCaseBurden(revealedCandidates),
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
        worstCaseBurdenConvertedEssence: worstCaseBurden(candidates),
        presentation: "covered_cups_choose_random_revealed",
      },
      {
        kind: "gain_one_random_reward",
        optionNumber: 2,
        poolId,
        rewards: allPayloads,
        committedReward: hiddenReward.payloads,
        visibilityPolicy: randomVisibility(
          "hidden_until_resolution",
          "The visible pool is disclosed, but this selected reward stays hidden until resolution.",
          false,
          "after entry",
        ),
        expectedConvertedEssence: averageValue(candidates),
        riskPremiumConvertedEssence: -14,
        worstCaseBurdenConvertedEssence: worstCaseBurden(candidates),
        presentation: "covered_cups_gain_random_reward",
      },
    ],
  };
}
