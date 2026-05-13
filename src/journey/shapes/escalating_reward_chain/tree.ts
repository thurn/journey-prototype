import type { JourneyContext } from "../../../quest/context.js";
import { drawInt, type DrawContext } from "../../../util/rng.js";
import type { JourneyStage, JourneyTree, JourneyTreeBranch } from "../../manifest.js";
import {
  adaptTreeBranchOperations,
  adaptTreeTerminalOperations,
} from "../../operationAdapters.js";
import { getReward } from "../../shared/rewards.js";
import type { TemplateParams } from "../../shared/types.js";

type EscalatingReward = {
  readonly text: string;
  readonly effects: readonly unknown[];
  readonly effect: number;
};

type TreeBranchArgs = {
  id: string;
  label: string;
  text: string;
  costs?: readonly unknown[];
  effects?: readonly unknown[];
  cost?: number;
  effect?: number;
  nextNodeId?: string;
  terminal?: {
    readonly text: string;
    readonly outcome: NonNullable<JourneyTreeBranch["terminal"]>["outcome"];
    readonly costs?: readonly unknown[];
    readonly effects?: readonly unknown[];
    readonly burdens?: readonly unknown[];
    readonly targets?: readonly unknown[];
    readonly routeEffects?: readonly unknown[];
  };
};

const COSTS: Record<JourneyStage, readonly [number, number, number]> = {
  early: [10, 25, 45],
  mid: [35, 80, 145],
  late: [45, 95, 165],
};

const ESSENCE_AMOUNTS: Record<JourneyStage, readonly [number, number, number]> = {
  early: [45, 90, 150],
  mid: [90, 175, 300],
  late: [130, 250, 430],
};

const OMEN_COUNTS: Record<JourneyStage, readonly [number, number, number]> = {
  early: [1, 2, 3],
  mid: [2, 4, 6],
  late: [3, 6, 9],
};

function treeBranch(args: TreeBranchArgs): JourneyTreeBranch {
  const costs = [...(args.costs ?? [])];
  const effects = [...(args.effects ?? [])];
  const terminal = args.terminal
    ? {
        text: args.terminal.text,
        outcome: args.terminal.outcome,
        operations: [],
        costs,
        effects,
        burdens: [],
        targets: [],
        routeEffects: [],
      }
    : undefined;
  const branch = {
    id: args.id,
    label: args.label,
    kind: "player_choice" as const,
    text: args.text,
    operations: [],
    costs,
    effects,
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: args.cost ?? 0,
    effectConvertedEssence: args.effect ?? 0,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: (args.effect ?? 0) - (args.cost ?? 0),
    ...(args.nextNodeId ? { nextNodeId: args.nextNodeId } : {}),
    ...(terminal ? { terminal } : {}),
  };

  return {
    ...branch,
    operations: adaptTreeBranchOperations(branch),
    ...(branch.terminal
      ? {
          terminal: {
            ...branch.terminal,
            operations: adaptTreeTerminalOperations(
              branch.terminal,
              `tree:${branch.id}:terminal`,
            ),
          },
        }
      : {}),
  };
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

function cost(amount: number): Record<string, unknown> {
  return {
    kind: "essence",
    amount,
    timing: "immediate",
  };
}

function sharedRewardPayload(
  context: JourneyContext,
  templateId: "gain_essence" | "gain_omens",
  params: TemplateParams,
): EscalatingReward {
  const template = getReward(templateId);
  const text = template.render(params as never, context);
  const convertedEssence = template.cec(params as never, context);

  return {
    text: `${text.charAt(0).toLowerCase()}${text.slice(1)}.`,
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

function rewardsFor(
  context: JourneyContext,
  drawContext: DrawContext,
  stage: JourneyStage,
): readonly EscalatingReward[] {
  const family = pickSequentialVariant(
    drawContext,
    "escalating-chain:reward-family",
    ["essence", "omens"] as const,
  );

  return family === "essence"
    ? ESSENCE_AMOUNTS[stage].map((x) =>
        sharedRewardPayload(context, "gain_essence", { x })
      )
    : OMEN_COUNTS[stage].map((x) =>
        sharedRewardPayload(context, "gain_omens", { x })
      );
}

export function buildEscalatingRewardChainTree(
  context: JourneyContext,
  drawContext: DrawContext,
  stage: JourneyStage,
): JourneyTree {
  const rewards = rewardsFor(context, drawContext, stage);
  const costs = COSTS[stage];

  return tree(
    rewards.map((reward, index) => {
      const level = index + 1;
      const price = costs[index]!;
      const isFinal = level === rewards.length;
      const takeCost = cost(price);

      return {
        id: `level-${level}`,
        levelLabel: `Level ${level}`,
        branches: [
          treeBranch({
            id: `level-${level}-stop`,
            label: "Stop",
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
            id: `level-${level}-take`,
            label: "Take",
            text: `Pay ${price} essence and ${reward.text} ${isFinal ? "End the Journey." : `Go to Level ${level + 1}.`}`,
            costs: [takeCost],
            effects: reward.effects,
            cost: price,
            effect: reward.effect,
            ...(isFinal
              ? {
                  terminal: {
                    text: "End the Journey.",
                    outcome: "claim" as const,
                    costs: [takeCost],
                    effects: reward.effects,
                    burdens: [],
                    targets: [],
                    routeEffects: [],
                  },
                }
              : { nextNodeId: `level-${level + 1}` }),
          }),
        ],
      };
    }),
  );
}
