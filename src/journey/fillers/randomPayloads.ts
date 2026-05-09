import type { JourneyContext } from "../../quest/context.js";
import { drawInt, shuffleDeterministic, type DrawContext } from "../../util/rng.js";
import type {
  JourneyOption,
  JourneyRewardPool,
  JourneyStage,
  RandomOdds,
  RandomOutcomeVisibility,
  RandomPrecommittedOutcome,
} from "../manifest.js";
import { adaptRewardPoolOperations } from "../operationAdapters.js";
import {
  DREAMSIGN_VALUE_CONSTANTS,
  valueBaneBurden,
  valueBaneGain,
  valueBanePurge,
  valueDreamsignOperation,
} from "../value.js";
import {
  BANE_NAMES,
  DEFAULT_BANE_NAME,
  type BaneName,
} from "../effects.js";
import { banePurgePayload } from "./banePayloads.js";
import {
  contentBackedDreamsignCandidates,
  dreamsignExactTarget,
  namedDreamsignPayload,
} from "./dreamsignPayloads.js";
import {
  CARD_DRAFT_PROFILES,
  baneBurden,
  cardDraftText,
  cost,
  gainEssence,
  gainOmen,
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

function odds(percent: number): RandomOdds {
  return { numerator: percent, denominator: 100, percent };
}

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

function namedDreamsignCandidate(args: {
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

function averageValue(candidates: readonly RandomPoolCandidate[]): number {
  return Math.round(
    candidates.reduce((total, candidate) => total + candidate.value, 0) /
      Math.max(1, candidates.length),
  );
}

function worstCaseBurden(candidates: readonly RandomPoolCandidate[]): number {
  return Math.min(0, ...candidates.map((candidate) => candidate.worstCaseBurden ?? 0));
}

function poolSummary(candidates: readonly RandomPoolCandidate[]): string {
  const entries = candidates.map((candidate) =>
    lowerFirst(candidate.text).replace(/\.$/u, ""),
  );

  return `Randomly gain one: ${entries.join(", ")}. Outcomes draw with replacement.`;
}

function flattenPayloads(candidates: readonly RandomPoolCandidate[]): unknown[] {
  return candidates.flatMap((candidate) => candidate.payloads);
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

export function revealChoiceOptions(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage: JourneyStage;
}): {
  options: JourneyOption[];
  precommitted: RandomPrecommittedOutcome[];
} {
  const wheel = visibleWheelPool({
    ...args,
    size: 5,
  });
  const candidates = wheel.candidates;
  const poolId = `${args.label}:visible-wheel`;
  const revealCount = Math.min(3, candidates.length);
  const allPayloads = flattenPayloads(candidates);
  const revealed = flattenPayloads(candidates.slice(0, revealCount));
  const randomIndex = drawInt(
    args.drawContext,
    `${args.label}:revealed-random-index`,
    0,
    revealCount - 1,
  );
  const hiddenIndex = drawInt(
    args.drawContext,
    `${args.label}:hidden-random-index`,
    0,
    candidates.length - 1,
  );
  const revealedText = candidates
    .slice(0, revealCount)
    .map((candidate) => lowerFirst(candidate.text).replace(/\.$/u, ""))
    .join("; ");
  const randomRevealed = candidates[randomIndex]!;
  const hiddenReward = candidates[hiddenIndex]!;
  const expectedConvertedEssence = averageValue(candidates.slice(0, revealCount));

  return {
    options: [
      option({
        number: 1,
        text: `Reveal ${revealCount} rewards (${revealedText}). Choose one revealed reward.`,
        effects: [{ kind: "random_reward", table: "reveal_choice", revealCount }],
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
        revealCount,
        rewards: revealed,
        visibilityPolicy: randomVisibility(
          "pre_rolled",
          "The revealed rewards are pre-rolled and shown in root option copy.",
          true,
        ),
        expectedConvertedEssence,
        riskPremiumConvertedEssence: -5,
        worstCaseBurdenConvertedEssence: worstCaseBurden(candidates.slice(0, revealCount)),
        presentation: "covered_cups_reveal",
      },
      {
        kind: "choose_one_revealed_reward",
        optionNumber: 1,
        revealCount,
        rewards: revealed,
        visibilityPolicy: randomVisibility(
          "visible",
          "The player chooses one reward from the revealed set.",
          true,
        ),
        expectedConvertedEssence: Math.max(
          ...candidates.slice(0, revealCount).map((candidate) => candidate.value),
        ),
        riskPremiumConvertedEssence: 0,
        worstCaseBurdenConvertedEssence: worstCaseBurden(candidates.slice(0, revealCount)),
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

export function revealChoiceMenuOptions(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage: JourneyStage;
}): {
  options: JourneyOption[];
  precommitted: RandomPrecommittedOutcome[];
} {
  const wheel = visibleWheelPool({
    ...args,
    size: 5,
  });
  const candidates = wheel.candidates;
  const poolId = `${args.label}:visible-wheel`;
  const revealCount = Math.min(3, candidates.length);
  const allPayloads = flattenPayloads(candidates);
  const revealed = flattenPayloads(candidates.slice(0, revealCount));
  const randomIndex = drawInt(
    args.drawContext,
    `${args.label}:revealed-random-index`,
    0,
    candidates.length - 1,
  );
  const hiddenIndex = drawInt(
    args.drawContext,
    `${args.label}:hidden-random-index`,
    0,
    candidates.length - 1,
  );
  const revealedText = candidates
    .slice(0, revealCount)
    .map((candidate) => lowerFirst(candidate.text).replace(/\.$/u, ""))
    .join("; ");
  const randomRevealed = candidates[randomIndex]!;
  const hiddenReward = candidates[hiddenIndex]!;
  const nightmare = baneBurden("Nightmare", 1);

  return {
    options: [
      option({
        number: 1,
        text: `Reveal ${revealCount} rewards (${revealedText}). Choose one revealed reward.`,
        effects: [{ kind: "random_reward", table: "reveal_choice", revealCount }],
        effect: Math.max(
          ...candidates.slice(0, revealCount).map((candidate) => candidate.value),
        ),
        uncertainty: -10,
      }),
      option({
        number: 2,
        text: `Reveal ${candidates.length} rewards. Choose one random revealed reward (precommitted: ${lowerFirst(randomRevealed.text).replace(/\.$/u, "")}) and gain 1 {Nightmare}.`,
        effects: [{ kind: "random_reward", table: "visible_reveal_pool" }],
        burdens: [nightmare],
        burden: valueBaneBurden({ baneName: "Nightmare", count: 1 }),
        effect: averageValue(candidates),
        uncertainty: -16,
      }),
      option({
        number: 3,
        text: "Gain one random reward from the visible pool.",
        effects: [{ kind: "random_reward", table: "visible_reveal_pool", poolId }],
        effect: averageValue(candidates),
        uncertainty: -14,
      }),
    ],
    precommitted: [
      wheel.visiblePoolEnvelope,
      {
        kind: "reveal_rewards",
        optionNumber: 1,
        revealCount,
        rewards: revealed,
        visibilityPolicy: randomVisibility(
          "pre_rolled",
          "The revealed rewards are pre-rolled and shown in root option copy.",
          true,
        ),
        expectedConvertedEssence: averageValue(candidates.slice(0, revealCount)),
        riskPremiumConvertedEssence: -5,
        worstCaseBurdenConvertedEssence: worstCaseBurden(candidates.slice(0, revealCount)),
        presentation: "reveal_choice_menu_reveal",
      },
      {
        kind: "choose_one_revealed_reward",
        optionNumber: 1,
        revealCount,
        rewards: revealed,
        visibilityPolicy: randomVisibility(
          "visible",
          "The player chooses one reward from the revealed set.",
          true,
        ),
        expectedConvertedEssence: Math.max(
          ...candidates.slice(0, revealCount).map((candidate) => candidate.value),
        ),
        riskPremiumConvertedEssence: 0,
        worstCaseBurdenConvertedEssence: worstCaseBurden(candidates.slice(0, revealCount)),
        presentation: "reveal_choice_menu_choose_revealed",
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

export function randomPurgePayload(args: {
  kind: "dreamsign" | "card";
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
}) {
  if (args.kind === "dreamsign") {
    const activeIds = args.context.state.quest.activeDreamsigns.map((entry) => entry.dreamsignId);
    const poolIds = args.context.state.quest.dreamsignPoolIds;
    const source = activeIds.length > 0 ? "active" : "pool";
    const ids = activeIds.length > 0 ? activeIds : poolIds;

    return {
      kind: "dreamsign_purge",
      dreamsignOperationKind: "purge",
      selection: "hidden_random",
      source,
      predicate: { source, ids },
      timing: "immediate",
    };
  }

  const profile = pickLegalCardDraftProfile(
    args.context,
    args.drawContext,
    `${args.label}:random-card-purge-profile`,
    [
      CARD_DRAFT_PROFILES.characters,
      CARD_DRAFT_PROFILES.events,
      CARD_DRAFT_PROFILES.allEligibleCards,
    ],
  );

  return {
    kind: "card_purge",
    cardOperationKind: "purge",
    selection: "hidden_random",
    predicate: { source: "deck", ...profile.predicate },
    timing: "immediate",
  };
}

export function namedDreamsignRiskReward(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage: JourneyStage;
}) {
  const named = namedDreamsignCandidate(args);

  if (named) {
    return named;
  }

  const profile = pickLegalCardDraftProfile(
    args.context,
    args.drawContext,
    `${args.label}:fallback-card-profile`,
    [CARD_DRAFT_PROFILES.events, CARD_DRAFT_PROFILES.allEligibleCards],
  );
  const cardDraft = {
    kind: "card_draft",
    takeCount: 1,
    choiceCount: 4,
    predicate: { source: "draftPool", ...profile.predicate },
  };

  return {
    key: `fallback-draft:${profile.label}`,
    text: cardDraftText(profile),
    payloads: [cardDraft, gainOmen(1)],
    targets: [target("card", profile.targetDescription, cardDraft.predicate)],
    value: 170,
    family: "card" as const,
  };
}

export function randomRiskCostEnvelope(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  optionNumber: number;
  chancePercent: number;
}) {
  const kind = pickSequentialVariant(
    args.drawContext,
    `${args.label}:random-risk-cost-kind`,
    ["random_essence_cost", "random_dreamsign_purge", "random_card_purge"] as const,
  );
  const roll = drawInt(args.drawContext, `${args.label}:random-risk-cost-roll`, 1, 100);
  const randomEssenceAmount = drawInt(
    args.drawContext,
    `${args.label}:random-risk-cost-amount`,
    25,
    Math.max(25, Math.min(90, args.context.state.quest.resources.essence)),
  );
  const costPayload = kind === "random_essence_cost"
    ? cost("essence", randomEssenceAmount)
    : randomPurgePayload({
        kind: kind === "random_dreamsign_purge" ? "dreamsign" : "card",
        context: args.context,
        drawContext: args.drawContext,
        label: args.label,
      });
  const expectedCost = kind === "random_essence_cost"
    ? -Math.round(randomEssenceAmount * (args.chancePercent / 100))
    : kind === "random_dreamsign_purge"
      ? -Math.round(120 * (args.chancePercent / 100))
      : -Math.round(80 * (args.chancePercent / 100));

  return {
    envelope: {
      kind: "chance_to_pay_cost" as const,
      optionNumber: args.optionNumber,
      odds: odds(args.chancePercent),
      cost: costPayload,
      committedResult: roll <= args.chancePercent ? "paid" as const : "free" as const,
      visibilityPolicy: randomVisibility(
        "pre_rolled",
        "The downside odds are visible and the safe/downside result is precommitted.",
        true,
      ),
      expectedConvertedEssence: expectedCost,
      riskPremiumConvertedEssence: Math.min(-10, expectedCost),
      worstCaseBurdenConvertedEssence: kind === "random_essence_cost"
        ? -randomEssenceAmount
        : kind === "random_dreamsign_purge"
          ? -120
          : -80,
      presentation: kind,
    } satisfies RandomPrecommittedOutcome,
    text: kind === "random_essence_cost"
      ? `pay ${randomEssenceAmount} random essence`
      : kind === "random_dreamsign_purge"
        ? "purge a random Dreamsign"
        : "purge a random card",
    value: expectedCost,
  };
}

export function randomBaneChanceEnvelope(args: {
  drawContext: DrawContext;
  label: string;
  optionNumber: number;
  chancePercent: number;
}) {
  const baneName = pickSequentialVariant(
    args.drawContext,
    `${args.label}:chance-bane`,
    [...BANE_NAMES, DEFAULT_BANE_NAME] as readonly BaneName[],
  );
  const roll = drawInt(args.drawContext, `${args.label}:chance-bane-roll`, 1, 100);
  const baneValue = valueBaneGain(baneName, 1);

  return {
    envelope: {
      kind: "chance_to_gain_bane" as const,
      optionNumber: args.optionNumber,
      odds: odds(args.chancePercent),
      baneName,
      count: 1,
      committedResult: roll <= args.chancePercent ? "bane" as const : "safe" as const,
      visibilityPolicy: randomVisibility(
        "pre_rolled",
        "The downside odds are visible and the safe/downside result is precommitted.",
        true,
      ),
      expectedConvertedEssence: Math.round(baneValue * (args.chancePercent / 100)),
      riskPremiumConvertedEssence: Math.round(baneValue * (args.chancePercent / 100)),
      worstCaseBurdenConvertedEssence: baneValue,
      presentation: "random_bane_burden",
    } satisfies RandomPrecommittedOutcome,
    text: `gain 1 ${baneName}`,
    value: Math.round(baneValue * (args.chancePercent / 100)),
  };
}
