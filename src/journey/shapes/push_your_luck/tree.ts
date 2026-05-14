import type { JourneyContext } from "../../../quest/context.js";
import { drawInt, type DrawContext } from "../../../util/rng.js";
import { BANE_NAMES } from "../../effects.js";
import type { JourneyTree, JourneyTreeBranch } from "../../manifest.js";
import {
  buildTreeBranchOperations,
  buildTreeTerminalOperations,
} from "../../operationBuilders.js";
import { getReward } from "../../shared/rewards.js";
import type { TemplateParams } from "../../shared/types.js";
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

type TreeBranchArgs = {
  id: string;
  label: string;
  kind?: JourneyTreeBranch["kind"];
  text: string;
  odds?: JourneyTreeBranch["odds"];
  costs?: unknown[];
  effects?: unknown[];
  burdens?: unknown[];
  targets?: unknown[];
  triggers?: unknown[];
  routeEffects?: unknown[];
  cost?: number;
  effect?: number;
  burden?: number;
  uncertainty?: number;
  nextNodeId?: string;
  terminal?: Omit<NonNullable<JourneyTreeBranch["terminal"]>, "operations">;
};

function treeBranch(args: TreeBranchArgs): JourneyTreeBranch {
  const costs = args.costs ?? [];
  const effects = args.effects ?? [];
  const burdens = args.burdens ?? [];
  const targets = args.targets ?? [];
  const routeEffects = args.routeEffects ?? [];
  const terminal = args.terminal
    ? {
        text: args.terminal.text,
        outcome: args.terminal.outcome,
        operations: [],
        costs,
        effects,
        burdens,
        targets,
        routeEffects,
      }
    : undefined;

  const branch = {
    id: args.id,
    label: args.label,
    kind: args.kind ?? "player_choice",
    text: args.text,
    operations: [],
    ...(args.odds ? { odds: args.odds } : {}),
    costs,
    effects,
    burdens,
    targets,
    triggers: args.triggers ?? [],
    routeEffects,
    costConvertedEssence: args.cost ?? 0,
    effectConvertedEssence: args.effect ?? 0,
    burdenConvertedEssence: args.burden ?? 0,
    uncertaintyConvertedEssence: args.uncertainty ?? 0,
    netConvertedEssence:
      (args.effect ?? 0) -
      (args.cost ?? 0) +
      (args.burden ?? 0) +
      (args.uncertainty ?? 0),
    ...(args.nextNodeId ? { nextNodeId: args.nextNodeId } : {}),
    ...(terminal ? { terminal } : {}),
  };

  return {
    ...branch,
    operations: buildTreeBranchOperations(branch),
    ...(branch.terminal
      ? {
          terminal: {
            ...branch.terminal,
            operations: buildTreeTerminalOperations(
              branch.terminal,
              `tree:${branch.id}:terminal`,
            ),
          },
        }
      : {}),
  };
}

export function odds(percent: number): JourneyTreeBranch["odds"] {
  return { numerator: percent, denominator: 100, percent };
}

function tree(nodes: JourneyTree["nodes"]): JourneyTree {
  return {
    rootNodeId: nodes[0]?.id ?? "level-1",
    nodes,
  };
}

function pickSequentialVariant<T>(
  drawContext: DrawContext,
  label: string,
  variants: readonly T[],
): T {
  return variants[drawInt(drawContext, label, 0, variants.length - 1)]!;
}

function target(
  kind: "card" | "dreamsign",
  description: string,
  predicate: unknown,
  options: {
    selection?: "exact" | "predicate" | "chosen_after_commitment" | "visible_random" | "hidden_random";
    cardOperationTargetMode?: string;
    dreamsignOperationTargetMode?: string;
  } = {},
) {
  return {
    kind,
    description,
    predicate,
    ...(options.selection ? { selection: options.selection } : {}),
    ...(options.cardOperationTargetMode
      ? { cardOperationTargetMode: options.cardOperationTargetMode }
      : {}),
    ...(options.dreamsignOperationTargetMode
      ? { dreamsignOperationTargetMode: options.dreamsignOperationTargetMode }
      : {}),
    required: true,
  };
}

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

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function countText(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function baneCountText(count: number, baneName: string): string {
  return count === 1 ? `1 ${baneName}` : `${count} copies of ${baneName}`;
}

function gainOmenEffect(amount: number) {
  return {
    kind: "gain_omens",
    amount,
  };
}

function gainEssenceEffect(amount: number) {
  return {
    kind: "gain_essence",
    amount,
  };
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
  const stage = stageForContext(context);
  const selectedFamily = pickSequentialVariant(
    drawContext,
    "push-your-luck:reward-family:family",
    PUSH_REWARD_FAMILIES,
  );
  const rewardFamily =
    selectedFamily === "transfiguration"
      ? {
          id: selectedFamily,
          rewards: transfigurationRewards(context, drawContext),
        }
      : sharedRewardFamily(
          context,
          selectedFamily,
          stage,
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
  const ladder = pickSequentialVariant(
    drawContext,
    "push-your-luck:reward-family:transfiguration-ladder",
    TRANSFIGURATION_LADDERS,
  );
  const targets = [
    target(
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

function sharedRewardPayload(
  context: JourneyContext,
  templateId: "gain_essence" | "gain_omens",
  params: TemplateParams,
): PushReward {
  const template = getReward(templateId);
  const text = template.render(params as never, context);
  const convertedEssence = template.cec(params as never, context);

  return {
    text: `${lowerFirst(text)}.`,
    effects: [
      {
        kind: "shared_reward_template",
        templateId,
        params,
        text,
        convertedEssence,
      },
    ],
    effect: convertedEssence,
  };
}

function sharedRewardFamily(
  context: JourneyContext,
  family: Exclude<PushRewardFamilyId, "card_draft" | "dreamsign_draft" | "transfiguration"> |
    "card_draft" |
    "dreamsign_draft",
  stage: "early" | "mid" | "late",
): { readonly id: PushRewardFamilyId; readonly rewards: readonly PushReward[] } {
  if (family === "omens" || family === "card_draft" || family === "dreamsign_draft") {
    const counts = stage === "late" ? [2, 4, 7] : stage === "mid" ? [2, 3, 5] : [1, 2, 4];

    return {
      id: "omens",
      rewards: counts.map((x) => sharedRewardPayload(context, "gain_omens", { x })),
    };
  }

  const amounts = stage === "late" ? [120, 220, 360] : stage === "mid" ? [90, 170, 280] : [70, 135, 225];

  return {
    id: "essence",
    rewards: amounts.map((x) => sharedRewardPayload(context, "gain_essence", { x })),
  };
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
            text: `Risk immediate failure for a ${successPercent}% chance to ${reward.text} Success banks ${bankedRewardText(level)}. ${nextText}`,
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
