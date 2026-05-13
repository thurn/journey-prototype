import { drawInt } from "../../../util/rng.js";
import type {
  JourneyOption,
  RandomPrecommittedOutcome,
} from "../../manifest.js";
import {
  averageValue,
  flattenPayloads,
  randomVisibility,
  revealCount,
  revealPoolSize,
  type RandomPoolCandidate,
  visibleWheelPool,
  worstCaseBurden,
} from "../../fillers/randomPayloads.js";
import { gainOmen, lowerFirst, option } from "../../fillers/shared.js";
import { valueOmenGain } from "../../value.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";
import { revealBurdenProfile } from "./payloads.js";

const SHAPE_LABEL = "reveal_choice_menu";

function candidateText(candidate: RandomPoolCandidate): string {
  return lowerFirst(candidate.text).replace(/\.$/u, "");
}

function poolSummary(candidates: readonly RandomPoolCandidate[]): string {
  return `Visible reward pool: ${candidates.map(candidateText).join("; ")}.`;
}

function revealChoiceMenuOptions(args: ShapeFillArgs & { label: string }): {
  options: JourneyOption[];
  precommitted: RandomPrecommittedOutcome[];
} {
  const poolSize = revealPoolSize(args.drawContext, args.label, args.stage);
  const wheel = visibleWheelPool({
    context: args.context,
    drawContext: args.drawContext,
    label: args.label,
    stage: args.stage,
    size: poolSize + 2,
  });
  const candidates = wheel.candidates
    .filter((candidate) => candidate.family !== "burden")
    .slice(0, poolSize);
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
  const hiddenIndex = drawInt(
    args.drawContext,
    `${args.label}:hidden-random-index`,
    0,
    candidates.length - 1,
  );
  const revealedText = candidates
    .slice(0, revealCountValue)
    .map(candidateText)
    .join("; ");
  const randomRevealed = candidates.reduce((best, candidate) =>
    candidate.value > best.value ? candidate : best,
  candidates[0]!);
  const hiddenReward = candidates[hiddenIndex]!;
  const randomRevealBurden = revealBurdenProfile({
    drawContext: args.drawContext,
    label: args.label,
    stage: args.stage,
  });
  const optionTwoOmenBonus = args.stage === "early" ? 2 : 1;
  const optionTwoOmenPayload = gainOmen(optionTwoOmenBonus);
  const optionTwoOmenValue = valueOmenGain(optionTwoOmenBonus);
  const optionTwoOmenText =
    `${optionTwoOmenBonus} ${optionTwoOmenBonus === 1 ? "omen" : "omens"}`;
  const visiblePoolSummary = poolSummary(candidates);
  const visiblePoolEnvelope = {
    ...wheel.visiblePoolEnvelope,
    summary: visiblePoolSummary,
    rewards: allPayloads,
    expectedConvertedEssence: averageValue(candidates),
    worstCaseBurdenConvertedEssence: worstCaseBurden(candidates),
  } satisfies RandomPrecommittedOutcome;

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
        effect: Math.max(
          ...revealedCandidates.map((candidate) => candidate.value),
        ),
        uncertainty: -10,
      }),
      option({
        number: 2,
        text: `Reveal ${candidates.length} rewards. Take the precommitted revealed reward: ${candidateText(randomRevealed)}. Gain ${optionTwoOmenText} and ${randomRevealBurden.text}.`,
        effects: [
          { kind: "random_reward", table: "visible_reveal_pool" },
          optionTwoOmenPayload,
        ],
        burdens: [randomRevealBurden.payload],
        burden: randomRevealBurden.value,
        effect: randomRevealed.value + optionTwoOmenValue,
        uncertainty: -16,
      }),
      option({
        number: 3,
        text: `Gain one random reward from the visible pool: ${candidates.map(candidateText).join("; ")}.`,
        effects: [
          { kind: "random_reward", table: "visible_reveal_pool", poolId },
        ],
        effect: averageValue(candidates),
        uncertainty: -14,
      }),
    ],
    precommitted: [
      visiblePoolEnvelope,
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
        expectedConvertedEssence: averageValue(revealedCandidates),
        riskPremiumConvertedEssence: -5,
        worstCaseBurdenConvertedEssence: worstCaseBurden(revealedCandidates),
        presentation: "reveal_choice_menu_reveal",
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
        presentation: "reveal_choice_menu_choose_revealed",
      },
      {
        kind: "choose_one_random_revealed_reward",
        optionNumber: 2,
        revealCount: candidates.length,
        rewards: allPayloads,
        committedReward: [...randomRevealed.payloads, optionTwoOmenPayload],
        visibilityPolicy: randomVisibility(
          "pre_rolled",
          "A reward is selected at random from the revealed set and committed in metadata.",
          true,
        ),
        expectedConvertedEssence: averageValue(candidates) + optionTwoOmenValue,
        riskPremiumConvertedEssence: -10,
        worstCaseBurdenConvertedEssence: worstCaseBurden(candidates),
        presentation: "reveal_choice_menu_choose_random_revealed",
      },
      {
        kind: "gain_one_random_reward",
        optionNumber: 3,
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
        presentation: "reveal_choice_menu_gain_random_reward",
      },
    ],
  };
}

export function revealChoiceMenuFill(args: ShapeFillArgs): FilledJourney {
  const reveal = revealChoiceMenuOptions({
    ...args,
    label: `${SHAPE_LABEL}:reveal`,
  });

  return {
    options: reveal.options,
    precommitted: {
      random: reveal.precommitted,
    },
  };
}
