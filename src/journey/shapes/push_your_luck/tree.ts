import type { JourneyContext } from "../../../quest/context.js";
import type { DrawContext } from "../../../util/rng.js";
import { BANE_NAMES } from "../../effects.js";
import { treeBuilderTools } from "../../fillers/shared.js";
import {
  createTreePrimitives,
  odds,
  tree,
  treeBranch,
} from "../../fillers/treeBuilders.js";
import type { JourneyTree, JourneyTreeBranch } from "../../manifest.js";
import { valueBaneGain, valueEssenceGain, valueOmenGain } from "../../value.js";

type PushReward = {
  text: string;
  effects: unknown[];
  targets?: unknown[];
  effect: number;
};

const PUSH_REWARD_FAMILIES = [
  "essence",
  "omens",
  "card_draft",
  "dreamsign_draft",
  "transfiguration",
] as const;

type PushRewardFamilyId = (typeof PUSH_REWARD_FAMILIES)[number];

const TRANSFIGURATION_LADDERS: readonly (readonly [string, string, string])[] = [
  ["Bronze", "Azure", "Prismatic"],
  ["Viridian", "Golden", "Prismatic"],
  ["Rose", "Magenta", "Prismatic"],
];

function stageForContext(context: JourneyContext): "early" | "mid" | "late" {
  const dreamscape = context.state.quest.resources.dreamscape;

  if (dreamscape <= 1) {
    return "early";
  }

  return dreamscape <= 3 ? "mid" : "late";
}

function pushChanceProgression(
  drawContext: DrawContext,
  label: string,
  levels: number,
): number[] {
  const { pickSequentialVariant } = treeBuilderTools;
  const start = pickSequentialVariant(drawContext, `${label}:start`, [75, 80, 85]);
  const step = pickSequentialVariant(drawContext, `${label}:step`, [15, 20]);
  const floor = 30;

  return Array.from({ length: levels }, (_, index) =>
    Math.max(floor, start - step * index),
  );
}

function withoutFinalPeriod(text: string): string {
  return text.replace(/\.$/u, "");
}

function countText(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function baneCountText(count: number, baneName: string): string {
  return count === 1 ? `1 ${baneName}` : `${count} copies of ${baneName}`;
}

function gainOmenEffect(amount: number) {
  return treeBuilderTools.gainOmen(amount);
}

function gainEssenceEffect(amount: number) {
  return treeBuilderTools.gainEssence(amount);
}

function omenPayloadAmount(effect: unknown): number {
  return isPayloadKind(effect, "gain_omens")
    ? resourceAmount(effect) ?? 0
    : 0;
}

function stripOmenBonusText(text: string): string {
  return text
    .replace(/\s*,?\s+and gain \d+ omens?/giu, "")
    .replace(/\.\s*Gain \d+ omens?\.?/giu, ".")
    .replace(/\.{2,}/gu, ".")
    .replace(/\s+,/gu, ",")
    .replace(/,\s*(?=\.)/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function cleanPunctuation(text: string): string {
  return text.replace(/\s+,/gu, ",").replace(/,\s*,/gu, ",");
}

function isPayloadKind(
  effect: unknown,
  kind: string,
): effect is Record<string, unknown> {
  return (
    typeof effect === "object" &&
    effect !== null &&
    "kind" in effect &&
    effect.kind === kind
  );
}

function resourceAmount(effect: unknown): number | undefined {
  return typeof effect === "object" &&
    effect !== null &&
    "amount" in effect &&
    typeof effect.amount === "number"
    ? effect.amount
    : undefined;
}

function replaceFirstEffect(
  reward: PushReward,
  replacement: unknown,
  effectValue: number,
  text: string,
): PushReward {
  return {
    ...reward,
    text,
    effects: [replacement, ...reward.effects.slice(1)],
    effect: effectValue,
  };
}

function addOmenBonus(reward: PushReward, amount: number): PushReward {
  if (amount <= 0) {
    return reward;
  }

  const primaryEffect = reward.effects[0];

  if (isPayloadKind(primaryEffect, "gain_omens")) {
    const scaledAmount = (resourceAmount(primaryEffect) ?? 0) + amount;

    return replaceFirstEffect(
      reward,
      gainOmenEffect(scaledAmount),
      valueOmenGain(scaledAmount),
      `gain ${countText(scaledAmount, "omen")}.`,
    );
  }

  const existingOmenBonus = reward.effects.reduce<number>(
    (total, effect) => total + omenPayloadAmount(effect),
    0,
  );
  const totalOmenBonus = existingOmenBonus + amount;
  const effectsWithoutOmenBonus = reward.effects.filter(
    (effect) => !isPayloadKind(effect, "gain_omens"),
  );
  const baseText = withoutFinalPeriod(stripOmenBonusText(reward.text));
  const omenJoiner = baseText.includes("including ") ? ", and" : "and";

  return {
    ...reward,
    text: cleanPunctuation(
      `${baseText} ${omenJoiner} gain ${countText(totalOmenBonus, "omen")}.`,
    ),
    effects: [...effectsWithoutOmenBonus, gainOmenEffect(totalOmenBonus)],
    effect: reward.effect + valueOmenGain(amount),
  };
}

function stageScaleResourceReward(
  context: JourneyContext,
  reward: PushReward,
  stage: "early" | "mid" | "late",
  levelIndex: number,
): PushReward {
  const primaryEffect = reward.effects[0];

  if (isPayloadKind(primaryEffect, "gain_essence")) {
    const amount = resourceAmount(primaryEffect) ?? 0;
    const bonus =
      stage === "late" ? [35, 60, 90][levelIndex]! :
      stage === "mid" ? [0, 15, 30][levelIndex]! :
      0;
    const scaledAmount = amount + bonus;

    if (scaledAmount === amount) {
      return reward;
    }

    return replaceFirstEffect(
      reward,
      gainEssenceEffect(scaledAmount),
      valueEssenceGain(scaledAmount, context),
      `gain ${scaledAmount} essence.`,
    );
  }

  if (isPayloadKind(primaryEffect, "gain_omens")) {
    const amount = resourceAmount(primaryEffect) ?? 0;
    const bonus =
      stage === "late" ? levelIndex + 1 :
      stage === "mid" ? levelIndex :
      0;
    const scaledAmount = amount + bonus;

    if (scaledAmount === amount) {
      return reward;
    }

    return replaceFirstEffect(
      reward,
      gainOmenEffect(scaledAmount),
      valueOmenGain(scaledAmount),
      `gain ${countText(scaledAmount, "omen")}.`,
    );
  }

  return reward;
}

function stageOmenBonus(
  family: string,
  stage: "early" | "mid" | "late",
  levelIndex: number,
): number {
  if (family === "essence" || family === "omens") {
    return 0;
  }

  const level = levelIndex + 1;

  if (stage === "late") {
    return level;
  }

  if (stage === "mid") {
    return Math.max(0, level - 1);
  }

  return family === "transfiguration" ? Math.max(0, level - 1) : 0;
}

function dreamsignNameById(context: JourneyContext, id: string): string | undefined {
  return context.content.dreamsigns.find((dreamsign) => dreamsign.id === id)?.name;
}

function previewDreamsignDraft(
  context: JourneyContext,
  reward: PushReward,
): PushReward {
  const draft = reward.effects.find((effect) =>
    isPayloadKind(effect, "dreamsign_draft"),
  );

  if (!draft || typeof draft.choiceCount !== "number") {
    return reward;
  }

  const previewNames = context.state.quest.dreamsignPoolIds
    .map((id) => dreamsignNameById(context, id))
    .filter((name): name is string => typeof name === "string")
    .slice(0, draft.choiceCount);

  if (previewNames.length === 0) {
    return reward;
  }

  const preview = previewNames.map((name) => `{${name}}`).join(", ");

  return {
    ...reward,
    text: reward.text.replace(
      /choose 1 of \d+ Dreamsigns\./iu,
      `choose 1 of ${draft.choiceCount} Dreamsigns from the pool, including ${preview}.`,
    ),
  };
}

function previewCardDraft(reward: PushReward): PushReward {
  if (!reward.effects.some((effect) => isPayloadKind(effect, "card_draft"))) {
    return reward;
  }

  return {
    ...reward,
    text: reward.text.replace(
      /draft 1 of 4 ([^.]+)\./iu,
      (_match, label: string) =>
        `draft 1 of 4 ${label} from the ${label} draft pool.`,
    ),
  };
}

function addChoicePreview(context: JourneyContext, reward: PushReward): PushReward {
  return previewDreamsignDraft(context, previewCardDraft(reward));
}

function enforceExpectedProgression(
  rewards: readonly PushReward[],
  chances: readonly number[],
): PushReward[] {
  let previousExpected = 0;

  return rewards.map((reward, index) => {
    let adjusted = reward;
    let expected = adjusted.effect * (chances[index] ?? 100) / 100;

    while (index > 0 && expected <= previousExpected) {
      adjusted = addOmenBonus(adjusted, 1);
      expected = adjusted.effect * (chances[index] ?? 100) / 100;
    }

    previousExpected = expected;

    return adjusted;
  });
}

function connectedPushRewards(
  context: JourneyContext,
  drawContext: DrawContext,
  chances: readonly number[],
): PushReward[] {
  const { treeRewardFamily } = createTreePrimitives(treeBuilderTools);
  const stage = stageForContext(context);
  const legalFamilies = PUSH_REWARD_FAMILIES.filter((family) =>
    family !== "dreamsign_draft" ||
    context.state.quest.dreamsignPoolIds.length > 0,
  );
  const familyCandidates: readonly PushRewardFamilyId[] =
    legalFamilies.length > 0 ? legalFamilies : ["essence"];
  const selectedFamily = treeBuilderTools.pickSequentialVariant(
    drawContext,
    "push-your-luck:reward-family:family",
    familyCandidates,
  );
  const rewardFamily =
    selectedFamily === "transfiguration"
      ? {
          id: selectedFamily,
          rewards: transfigurationRewards(context, drawContext),
        }
      : treeRewardFamily(
          context,
          drawContext,
          "push-your-luck:reward-family",
          3,
          [selectedFamily],
        );
  const orderedRewards =
    rewardFamily.id === "transfiguration"
      ? [...rewardFamily.rewards].sort((left, right) => left.effect - right.effect)
      : rewardFamily.rewards;
  const stagedRewards = orderedRewards.map((reward, index) => {
    const scaledReward = stageScaleResourceReward(context, reward, stage, index);
    const previewedReward = addChoicePreview(context, scaledReward);
    const bonusReward = addOmenBonus(
      previewedReward,
      stageOmenBonus(rewardFamily.id, stage, index),
    );

    return bonusReward;
  });

  return enforceExpectedProgression(stagedRewards, chances);
}

function transfigurationRewards(
  context: JourneyContext,
  drawContext: DrawContext,
): PushReward[] {
  const ladder = treeBuilderTools.pickSequentialVariant(
    drawContext,
    "push-your-luck:reward-family:transfiguration-ladder",
    TRANSFIGURATION_LADDERS,
  );
  const targets = [
    treeBuilderTools.target(
      "card",
      "cards in deck",
      { source: "deck" },
      {
        selection: "chosen_after_commitment",
        cardOperationTargetMode: "chosen",
      },
    ),
  ];
  const stage = stageForContext(context);
  const baseValue = stage === "late" ? 115 : stage === "mid" ? 95 : 80;

  return ladder.map((name, index) => ({
    text: `apply {${name} Transfiguration} to a chosen card.`,
    effects: [{ kind: "card_transfigure", transfigurationName: name }],
    targets,
    effect: baseValue + index * 35,
  }));
}

function bankedRewardText(completedLevels: number): string {
  if (completedLevels <= 0) {
    return "no rewards are banked";
  }

  return completedLevels === 1
    ? "Level 1 reward"
    : `Levels 1-${completedLevels} rewards`;
}

function claimBankedText(completedLevels: number): string {
  return completedLevels <= 0
    ? "Leave with no banked rewards."
    : `Claim banked ${bankedRewardText(completedLevels)} and end the Journey.`;
}

export function buildPushYourLuckTree(
  context: JourneyContext,
  drawContext: DrawContext,
): JourneyTree {
  const { pickSequentialVariant } = treeBuilderTools;
  const chances = pushChanceProgression(drawContext, "push-your-luck:chances", 3);
  const profile = {
    chances,
    rewards: connectedPushRewards(context, drawContext, chances),
  };
  const stage = stageForContext(context);
  const failureBaneName = pickSequentialVariant(
    drawContext,
    "push-your-luck:failure-bane",
    BANE_NAMES,
  );
  const failureBaneCount = stage === "late" ? 2 : 1;
  const failureBane = {
    kind: "bane_gain",
    baneName: failureBaneName,
    count: failureBaneCount,
  };
  const failureBurden = valueBaneGain(failureBaneName, failureBaneCount);
  const failureText = baneCountText(failureBaneCount, failureBaneName);

  return tree(
    [1, 2, 3].map((level) => {
      const reward = profile.rewards[level - 1]!;
      const successPercent = profile.chances[level - 1]!;
      const nextText = level === 3 ? "End the Journey." : `Go to Level ${level + 1}.`;

      return {
        id: `level-${level}`,
        levelLabel: `Level ${level}`,
        branches: [
          treeBranch({
            id: `level-${level}-stop`,
            label: "Stop",
            text: claimBankedText(level - 1),
            terminal: {
              text: claimBankedText(level - 1),
              outcome: level === 1 ? "leave" : "end",
              costs: [],
              effects: [],
              burdens: [],
              targets: [],
              routeEffects: [],
            },
          }),
          treeBranch({
            id: `level-${level}-push`,
            label: "Push",
            text: `Risk immediate failure: ${successPercent}% chance to ${reward.text} Success banks ${bankedRewardText(level)}. ${nextText}`,
            odds: odds(successPercent),
            effects: reward.effects,
            targets: reward.targets ?? [],
            effect: reward.effect,
            uncertainty: -30,
            nextNodeId: level === 3 ? undefined : `level-${level + 1}`,
            ...(level === 3
              ? {
                  terminal: {
                    text: "End the Journey.",
                    outcome: "claim" as const,
                    costs: [],
                    effects: reward.effects,
                    burdens: [],
                    targets: reward.targets ?? [],
                    routeEffects: [],
                  },
                }
              : {}),
          }),
          treeBranch({
            id: `level-${level}-failure`,
            label: "Failure",
            kind: "random_chance",
            text:
              level === 1
                ? `No rewards are banked; gain ${failureText}. End the Journey.`
                : `Keep banked ${bankedRewardText(level - 1)}; gain ${failureText}. End the Journey.`,
            odds: odds(100 - successPercent),
            burdens: [failureBane],
            burden: failureBurden,
            terminal: {
              text: "End the Journey.",
              outcome: "failure",
              costs: [],
              effects: [],
              burdens: [failureBane],
              targets: [],
              routeEffects: [],
            },
          }),
        ],
      };
    }),
  );
}

export function pushYourLuckFailureBranches(
  pushTree: JourneyTree,
): readonly JourneyTreeBranch[] {
  return pushTree.nodes.flatMap((node) =>
    node.branches.filter((branch) => branch.kind === "random_chance"),
  );
}
