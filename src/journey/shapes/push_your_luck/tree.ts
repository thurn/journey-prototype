import type { JourneyContext } from "../../../quest/context.js";
import { drawInt, type DrawContext } from "../../../util/rng.js";
import type { JourneyTree, JourneyTreeBranch } from "../../manifest.js";
import {
  buildTreeBranchOperations,
  buildTreeTerminalOperations,
} from "../../operationBuilders.js";
import { getReward } from "../../shared/rewards.js";
import type { TemplateParams } from "../../shared/types.js";

type PushReward = {
  text: string;
  effects: unknown[];
  targets?: unknown[];
  effect: number;
  rewardTemplateIds: readonly string[];
};

const PUSH_REWARD_FAMILIES = [
  "essence",
  "omens",
] as const;

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
  rewardTemplateIds?: readonly string[];
};

function treeBranch(args: TreeBranchArgs): JourneyTreeBranch {
  const costs = args.costs ?? [];
  const effects = args.effects ?? [];
  const burdens = args.burdens ?? [];
  const targets = args.targets ?? [];
  const routeEffects = args.routeEffects ?? [];
  const rewardTemplateIds = args.rewardTemplateIds ?? [];
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
        rewardTemplateIds: [...rewardTemplateIds],
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
    rewardTemplateIds: [...rewardTemplateIds],
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
  const start = pickSequentialVariant(drawContext, `${label}:start`, [25, 30, 35]);
  const step = pickSequentialVariant(drawContext, `${label}:step`, [10, 20, 25]);

  return Array.from({ length: levels }, (_, index) => start + step * index);
}

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function sharedRewardPayload(
  context: JourneyContext,
  templateId: "gain_essence" | "gain_omens",
  params: TemplateParams,
): PushReward {
  const template = getReward(templateId);
  const text = template.render(params, context);
  const convertedEssence = template.cec(params, context);

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
    rewardTemplateIds: [templateId],
  };
}

function repeatedAttemptCost(stage: "early" | "mid" | "late"): number {
  return stage === "late" ? 45 : stage === "mid" ? 30 : 20;
}

function repeatedPushReward(
  context: JourneyContext,
  drawContext: DrawContext,
  stage: "early" | "mid" | "late",
): PushReward {
  const family = pickSequentialVariant(
    drawContext,
    "push-your-luck:reward-family:family",
    PUSH_REWARD_FAMILIES,
  );

  if (family === "omens") {
    const amount = stage === "late" ? 5 : stage === "mid" ? 3 : 2;

    return sharedRewardPayload(context, "gain_omens", { x: amount });
  }

  const amount = stage === "late" ? 260 : stage === "mid" ? 190 : 130;

  return sharedRewardPayload(context, "gain_essence", { x: amount });
}

function essenceCost(amount: number): Record<string, unknown> {
  return {
    kind: "essence",
    amount,
    timing: "immediate",
  };
}

export function buildPushYourLuckTree(
  context: JourneyContext,
  drawContext: DrawContext,
): JourneyTree {
  const chances = pushChanceProgression(drawContext, "push-your-luck:chances", 3);
  const stage = stageForContext(context);
  const reward = repeatedPushReward(context, drawContext, stage);
  const price = repeatedAttemptCost(stage);

  return tree(
    [1, 2, 3].map((level) => {
      const successPercent = chances[level - 1]!;
      const nextNodeId = level === 3 ? undefined : `level-${level + 1}`;

      return {
        id: `level-${level}`,
        levelLabel: `Level ${level}`,
        branches: [
          treeBranch({
            id: `level-${level}-leave`,
            label: "Leave",
            text: "Leave.",
            terminal: {
              text: "Leave.",
              outcome: "leave",
              costs: [],
              effects: [],
              burdens: [],
              targets: [],
              routeEffects: [],
            },
          }),
          treeBranch({
            id: `level-${level}-attempt`,
            label: "Attempt",
            text: `Pay ${price} essence. ${successPercent}% chance to ${reward.text}`,
            odds: odds(successPercent),
            costs: [essenceCost(price)],
            effects: reward.effects,
            targets: reward.targets ?? [],
            cost: price,
            effect: reward.effect,
            nextNodeId,
            rewardTemplateIds: reward.rewardTemplateIds,
            terminal: {
              text: "End the Journey.",
              outcome: "claim",
              costs: [essenceCost(price)],
              effects: reward.effects,
              burdens: [],
              targets: reward.targets ?? [],
              routeEffects: [],
            },
          }),
        ],
      };
    }),
  );
}

export function pushYourLuckAttemptBranches(
  pushTree: JourneyTree,
): readonly JourneyTreeBranch[] {
  return pushTree.nodes.flatMap((node) =>
    node.branches.filter((branch) => branch.label === "Attempt"),
  );
}
