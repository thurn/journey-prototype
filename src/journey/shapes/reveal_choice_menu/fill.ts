import { drawInt, shuffleDeterministic } from "../../../util/rng.js";
import type {
  JourneyOption,
  JourneyStage,
  RandomPrecommittedOutcome,
  RandomVisibilityPolicy,
} from "../../manifest.js";
import { adaptJourneyOptionOperations } from "../../operationAdapters.js";
import { BANE_NAMES } from "../../shared/content.js";
import { getReward } from "../../shared/rewards.js";
import type { TemplateParams } from "../../shared/types.js";
import { valueBaneBurden, valueOmenGain } from "../../value.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_LABEL = "reveal_choice_menu";
const REWARD_IDS = [
  "gain_essence",
  "gain_omens",
  "increase_max_essence",
  "next_X_shop_rerolls_free",
  "shop_essence_discount",
  "add_site_to_next_dreamscape",
] as const;

type RevealRewardId = (typeof REWARD_IDS)[number];

type PoolCandidate = {
  readonly key: string;
  readonly text: string;
  readonly payloads: readonly Record<string, unknown>[];
  readonly value: number;
};

function poolSize(stage: JourneyStage): number {
  return stage === "early" ? 4 : 5;
}

function revealCount(stage: JourneyStage, candidateCount: number): number {
  const count = stage === "late" ? 3 : 2;

  return Math.min(count, candidateCount);
}

function randomVisibility(
  outcomeVisibility: RandomVisibilityPolicy["outcomeVisibility"],
  disclosure: string,
  playerVisible: boolean,
  revealTiming?: string,
): RandomVisibilityPolicy {
  return {
    outcomeVisibility,
    disclosure,
    playerVisible,
    ...(revealTiming ? { revealTiming } : {}),
  };
}

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function stripTerminalPeriod(text: string): string {
  return text.replace(/\.$/u, "");
}

function averageValue(candidates: readonly PoolCandidate[]): number {
  return Math.round(
    candidates.reduce((total, candidate) => total + candidate.value, 0) /
      Math.max(1, candidates.length),
  );
}

function flattenPayloads(candidates: readonly PoolCandidate[]): Record<string, unknown>[] {
  return candidates.flatMap((candidate) => [...candidate.payloads]);
}

function materializeReward(args: ShapeFillArgs, templateId: RevealRewardId): PoolCandidate {
  const template = getReward(templateId);
  const params = template.rollParams(args.context, {
    ...args.drawContext,
    selectionAttempt:
      (args.drawContext.selectionAttempt ?? 0) * 100 + templateId.length,
  }) as TemplateParams;

  if (!template.viable(params as never, args.context)) {
    throw new Error(`${SHAPE_LABEL} reward ${templateId} is not viable`);
  }

  const text = template.render(params as never, args.context);
  const value = template.cec(params as never, args.context);

  return {
    key: templateId,
    text,
    value,
    payloads: [
      {
        kind: "shared_reward_template",
        templateId,
        params,
        text,
        convertedEssence: value,
      },
    ],
  };
}

function rewardPool(args: ShapeFillArgs): readonly PoolCandidate[] {
  return shuffleDeterministic(
    args.drawContext,
    `${SHAPE_LABEL}:reward-order`,
    REWARD_IDS,
  )
    .slice(0, poolSize(args.stage))
    .map((templateId) => materializeReward(args, templateId));
}

function candidateText(candidate: PoolCandidate): string {
  return stripTerminalPeriod(lowerFirst(candidate.text));
}

function poolSummary(candidates: readonly PoolCandidate[]): string {
  return `Visible reward pool: ${candidates.map(candidateText).join("; ")}.`;
}

function worstCaseBurden(): number {
  return 0;
}

function revealBurdenProfile(args: ShapeFillArgs) {
  const baneName = BANE_NAMES[
    drawInt(args.drawContext, `${SHAPE_LABEL}:reveal-burden-name`, 0, BANE_NAMES.length - 1)
  ]!;
  const count = 1;

  return {
    text: `gain ${count} {${baneName}}`,
    payload: {
      kind: "bane_gain",
      baneName,
      count,
      timing: "immediate",
      source: SHAPE_LABEL,
    },
    value: valueBaneBurden({ baneName, count }),
  };
}

function option(args: {
  readonly number: number;
  readonly text: string;
  readonly effects?: readonly unknown[];
  readonly burdens?: readonly unknown[];
  readonly effect?: number;
  readonly burden?: number;
  readonly uncertainty?: number;
}): JourneyOption {
  const effectConvertedEssence = args.effect ?? 0;
  const burdenConvertedEssence = args.burden ?? 0;
  const uncertaintyConvertedEssence = args.uncertainty ?? 0;
  const built = {
    number: args.number,
    symbols: [],
    text: args.text,
    operations: [],
    costs: [],
    effects: [...(args.effects ?? [])],
    burdens: [...(args.burdens ?? [])],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence,
    burdenConvertedEssence,
    uncertaintyConvertedEssence,
    netConvertedEssence:
      effectConvertedEssence + burdenConvertedEssence + uncertaintyConvertedEssence,
    pickBehavior: "record_and_generate_next" as const,
  };

  return {
    ...built,
    operations: adaptJourneyOptionOperations(built),
  };
}

function revealChoiceMenuOptions(args: ShapeFillArgs & { label: string }): {
  options: JourneyOption[];
  precommitted: RandomPrecommittedOutcome[];
} {
  const candidates = rewardPool(args);
  const poolId = `${args.label}:visible-wheel`;
  const revealCountValue = revealCount(args.stage, candidates.length);
  const allPayloads = flattenPayloads(candidates);
  const revealedCandidates = candidates.slice(0, revealCountValue);
  const revealed = flattenPayloads(revealedCandidates);
  const hiddenIndex = drawInt(
    args.drawContext,
    `${args.label}:hidden-random-index`,
    0,
    candidates.length - 1,
  );
  const revealedText = revealedCandidates.map(candidateText).join("; ");
  const randomRevealed = candidates.reduce((best, candidate) =>
    candidate.value > best.value ? candidate : best,
  candidates[0]!);
  const hiddenReward = candidates[hiddenIndex]!;
  const randomRevealBurden = revealBurdenProfile(args);
  const optionTwoOmenBonus: number = 2;
  const optionTwoOmenPayload = {
    kind: "gain_omens",
    amount: optionTwoOmenBonus,
    timing: "immediate",
  };
  const optionTwoOmenValue = valueOmenGain(optionTwoOmenBonus);
  const optionTwoOmenText =
    `${optionTwoOmenBonus} ${optionTwoOmenBonus === 1 ? "omen" : "omens"}`;
  const visiblePoolSummary = poolSummary(candidates);
  const visiblePoolEnvelope = {
    kind: "visible_pool",
    poolId,
    summary: visiblePoolSummary,
    rewards: allPayloads,
    replacement: "with_replacement",
    visibilityPolicy: randomVisibility(
      "visible",
      "The full reward pool and replacement policy are visible before choosing.",
      true,
    ),
    expectedConvertedEssence: averageValue(candidates),
    riskPremiumConvertedEssence: -8,
    worstCaseBurdenConvertedEssence: worstCaseBurden(),
    presentation: "visible_shared_reward_pool",
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
        worstCaseBurdenConvertedEssence: worstCaseBurden(),
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
        worstCaseBurdenConvertedEssence: worstCaseBurden(),
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
        worstCaseBurdenConvertedEssence: worstCaseBurden(),
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
        worstCaseBurdenConvertedEssence: worstCaseBurden(),
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
