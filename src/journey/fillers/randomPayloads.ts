import type { JourneyContext } from "../../quest/context.js";
import { drawInt, shuffleDeterministic, type DrawContext } from "../../util/rng.js";
import type {
  JourneyOption,
  JourneyRewardPool,
  JourneyStage,
  RandomOutcomeVisibility,
  RandomPrecommittedOutcome,
} from "../manifest.js";
import { adaptRewardPoolOperations } from "../operationAdapters.js";
import {
  DREAMSIGN_VALUE_CONSTANTS,
  valueBaneGain,
  valueBanePurge,
  valueDreamsignOperation,
} from "../value.js";
import { BANE_NAMES } from "../effects.js";
import { banePurgePayload } from "./banePayloads.js";
import {
  contentBackedDreamsignCandidates,
  dreamsignExactTarget,
  namedDreamsignPayload,
} from "./dreamsignPayloads.js";
import {
  CARD_DRAFT_PROFILES,
  cost,
  gainEssence,
  lowerFirst,
  option,
  pickLegalCardDraftProfile,
  pickSequentialVariant,
  randomCardGain,
  randomCardGainText,
  rewardSlots,
  target,
  type RewardSlot,
} from "./shared.js";

export type RandomPoolCandidate = {
  key: string;
  text: string;
  payloads: unknown[];
  targets?: unknown[];
  value: number;
  worstCaseBurden?: number;
  family: "resource" | "dreamsign" | "bane" | "burden" | "card" | "mixed";
};

const REVEAL_POOL_SIZE_BANDS = {
  early: [4, 5],
  mid: [5, 6],
  late: [5, 6, 7],
} as const satisfies Record<JourneyStage, readonly number[]>;

const REVEAL_COUNT_BANDS = {
  early: [2, 3],
  mid: [2, 3, 4],
  late: [3, 4, 5],
} as const satisfies Record<JourneyStage, readonly number[]>;

export function randomVisibility(
  outcomeVisibility: RandomOutcomeVisibility,
  disclosure: string,
  playerVisible: boolean,
  revealTiming?: string,
) {
  return {
    outcomeVisibility,
    disclosure,
    playerVisible,
    ...(revealTiming ? { revealTiming } : {}),
  };
}

function payloadsFromRewardSlot(reward: RewardSlot): RandomPoolCandidate {
  return {
    key: reward.key,
    text: reward.text,
    payloads: reward.effects,
    targets: reward.targets,
    value: reward.effect,
    family: reward.key.includes("dreamsign")
      ? "dreamsign"
      : reward.key.includes("card") || reward.key.includes("draft")
        ? "card"
        : "resource",
  };
}

export function namedDreamsignCandidate(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage: JourneyStage;
}): RandomPoolCandidate | undefined {
  const candidates = contentBackedDreamsignCandidates({
    context: args.context,
    stage: args.stage,
    sources: ["pool", "catalog"],
  });
  const selected = shuffleDeterministic(
    args.drawContext,
    `${args.label}:named-dreamsign-candidates`,
    candidates,
  )[0];

  if (!selected) {
    return undefined;
  }

  const payload = namedDreamsignPayload(
    {
      kind: "dreamsign_gain",
      dreamsign: selected.dreamsign,
      source: selected.source,
      extra: {
        targetOrigin: selected.targetOrigin,
        randomPoolFamily: "visible_wheel",
        selectionWeight: selected.weight,
        weightHooks: selected.weightHooks,
      },
    },
    args.context,
  );

  return {
    key: `wheel-dreamsign:${selected.dreamsign.id}`,
    text: `Gain {${selected.dreamsign.name}}.`,
    payloads: [payload],
    targets: [dreamsignExactTarget(selected.dreamsign, selected.source)],
    value: Math.max(
      DREAMSIGN_VALUE_CONSTANTS.namedGain,
      valueDreamsignOperation("gain", {
        tideOverlap: selected.weightHooks.tideOverlap > 0,
      }),
    ),
    family: "dreamsign",
  };
}

function randomBanePurgeCandidate(
  drawContext: DrawContext,
  label: string,
): RandomPoolCandidate {
  const baneName = pickSequentialVariant(
    drawContext,
    `${label}:random-bane-purge-name`,
    BANE_NAMES,
  );

  return {
    key: `wheel-bane-purge:${baneName}`,
    text: `Purge a random ${baneName}.`,
    payloads: [
      banePurgePayload({
        baneName,
        targetContext: "manifest_obligation",
        selection: "visible_random",
      }),
    ],
    targets: [
      {
        kind: "bane",
        description: "a visible random manifest-local Bane obligation",
        predicate: { source: "manifest_obligation", names: [baneName] },
        source: "manifest_obligation",
        names: [baneName],
        selection: "visible_random",
        required: false,
      },
    ],
    value: valueBanePurge({
      baneName,
      selection: "visible_random",
      targetContext: "manifest_obligation",
    }),
    family: "bane",
  };
}

function baneBurdenCandidate(
  drawContext: DrawContext,
  label: string,
): RandomPoolCandidate {
  const baneName = pickSequentialVariant(
    drawContext,
    `${label}:burden-name`,
    BANE_NAMES,
  );
  const burdenValue = valueBaneGain(baneName, 1);

  return {
    key: `wheel-bane-burden:${baneName}`,
    text: `Gain 1 ${baneName}.`,
    payloads: [{ kind: "bane_gain", baneName, count: 1 }],
    value: burdenValue,
    worstCaseBurden: burdenValue,
    family: "burden",
  };
}

function randomCardCandidate(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
}): RandomPoolCandidate {
  const profile = pickLegalCardDraftProfile(
    args.context,
    args.drawContext,
    `${args.label}:random-card-profile`,
    [
      CARD_DRAFT_PROFILES.events,
      CARD_DRAFT_PROFILES.energyGenerationCards,
      CARD_DRAFT_PROFILES.allEligibleCards,
    ],
  );
  const payload = randomCardGain(profile, 1);

  return {
    key: `wheel-random-card:${profile.label}`,
    text: randomCardGainText(profile, 1),
    payloads: [payload],
    targets: [target("card", profile.targetDescription, payload.predicate)],
    value: 120,
    family: "card",
  };
}

function resourceCandidate(
  drawContext: DrawContext,
  label: string,
): RandomPoolCandidate {
  const amount = pickSequentialVariant(
    drawContext,
    `${label}:resource-amount`,
    [120, 150, 180],
  );

  return {
    key: `wheel-resource:${amount}`,
    text: `Gain ${amount} essence.`,
    payloads: [gainEssence(amount)],
    value: amount,
    family: "resource",
  };
}

export function averageValue(candidates: readonly RandomPoolCandidate[]): number {
  return Math.round(
    candidates.reduce((total, candidate) => total + candidate.value, 0) /
      Math.max(1, candidates.length),
  );
}

export function worstCaseBurden(candidates: readonly RandomPoolCandidate[]): number {
  return Math.min(0, ...candidates.map((candidate) => candidate.worstCaseBurden ?? 0));
}

function poolSummary(candidates: readonly RandomPoolCandidate[]): string {
  const entries = candidates.map((candidate) =>
    lowerFirst(candidate.text).replace(/\.$/u, ""),
  );

  return `Randomly gain one: ${entries.join(", ")}. Outcomes draw with replacement.`;
}

export function flattenPayloads(candidates: readonly RandomPoolCandidate[]): unknown[] {
  return candidates.flatMap((candidate) => candidate.payloads);
}

export function revealPoolSize(
  drawContext: DrawContext,
  label: string,
  stage: JourneyStage,
): number {
  return pickSequentialVariant(
    drawContext,
    `${label}:reveal-pool-size`,
    REVEAL_POOL_SIZE_BANDS[stage],
  );
}

export function revealCount(args: {
  drawContext: DrawContext;
  label: string;
  stage: JourneyStage;
  candidateCount: number;
}): number {
  const desiredCount = pickSequentialVariant(
    args.drawContext,
    `${args.label}:reveal-count`,
    REVEAL_COUNT_BANDS[args.stage],
  );

  return Math.max(1, Math.min(desiredCount, args.candidateCount));
}

export function visibleWheelPool(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage: JourneyStage;
  size?: number;
}): {
  candidates: RandomPoolCandidate[];
  rewardPool: JourneyRewardPool;
  visiblePoolEnvelope: RandomPrecommittedOutcome;
} {
  const ordinaryRewards = rewardSlots(
    args.context,
    args.drawContext,
    `${args.label}:reward`,
    args.stage,
  )
    .filter((reward) => reward.routeEffects === undefined)
    .slice(0, 4)
    .map(payloadsFromRewardSlot);
  const explicitCandidates = [
    resourceCandidate(args.drawContext, args.label),
    namedDreamsignCandidate(args),
    randomBanePurgeCandidate(args.drawContext, args.label),
    baneBurdenCandidate(args.drawContext, args.label),
    randomCardCandidate(args),
  ].filter((candidate): candidate is RandomPoolCandidate => candidate !== undefined);
  const shuffledOrdinary = shuffleDeterministic(
    args.drawContext,
    `${args.label}:visible-wheel-pool`,
    ordinaryRewards,
  );
  const shuffledExplicit = shuffleDeterministic(
    args.drawContext,
    `${args.label}:visible-wheel-explicit-pool`,
    explicitCandidates,
  );
  const candidates = [
    ...shuffledExplicit,
    ...shuffledOrdinary,
  ].slice(0, args.size ?? 6);
  const rewards = flattenPayloads(candidates);
  const rewardPool = {
    summary: poolSummary(candidates),
    replacement: "with_replacement" as const,
    operations: [],
    rewards,
  };
  const expectedConvertedEssence = averageValue(candidates);
  const worstCaseBurdenConvertedEssence = worstCaseBurden(candidates);
  const poolId = `${args.label}:visible-wheel`;

  return {
    candidates,
    rewardPool: {
      ...rewardPool,
      operations: adaptRewardPoolOperations(rewardPool),
    },
    visiblePoolEnvelope: {
      kind: "visible_pool",
      poolId,
      summary: rewardPool.summary,
      rewards,
      replacement: "with_replacement",
      visibilityPolicy: randomVisibility(
        "visible",
        "The full wheel pool and replacement policy are visible before choosing.",
        true,
      ),
      expectedConvertedEssence,
      riskPremiumConvertedEssence: -8,
      worstCaseBurdenConvertedEssence,
      presentation: "visible_mixed_wheel_pool",
    },
  };
}

