import type { JourneyContext } from "../../../quest/context.js";
import { drawInt, type DrawContext } from "../../../util/rng.js";
import type { JourneyStage, JourneyTree, JourneyTreeBranch } from "../../manifest.js";
import {
  buildTreeBranchOperations,
  buildTreeTerminalOperations,
} from "../../operationBuilders.js";
import { getReward } from "../../shared/rewards.js";
import type { TemplateParams } from "../../shared/types.js";

type ProbabilityLadderReward = {
  readonly text: string;
  readonly effects: readonly unknown[];
  readonly effect: number;
};

type RewardFamily = "essence" | "omens";

type TreeBranchArgs = {
  id: string;
  label: string;
  kind?: JourneyTreeBranch["kind"];
  text: string;
  odds?: JourneyTreeBranch["odds"];
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

const LEVELS = [3, 4] as const;
const ESSENCE_AMOUNTS: Record<JourneyStage, readonly [number, number, number, number]> = {
  early: [70, 120, 180, 260],
  mid: [100, 175, 265, 380],
  late: [140, 240, 360, 520],
};
const OMEN_COUNTS: Record<JourneyStage, readonly [number, number, number, number]> = {
  early: [1, 2, 4, 6],
  mid: [2, 4, 6, 9],
  late: [3, 5, 8, 12],
};
const COSTS: Record<JourneyStage, readonly [number, number, number, number]> = {
  early: [5, 15, 30, 50],
  mid: [15, 30, 50, 80],
  late: [25, 45, 75, 115],
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
    kind: args.kind ?? "player_choice",
    text: args.text,
    operations: [],
    ...(args.odds ? { odds: args.odds } : {}),
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

function cost(amount: number): Record<string, unknown> {
  return {
    kind: "essence",
    amount,
    timing: "immediate",
  };
}

function sentenceCase(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function sharedRewardPayload(
  context: JourneyContext,
  templateId: "gain_essence" | "gain_omens",
  params: TemplateParams,
): ProbabilityLadderReward {
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

function chanceProgression(
  drawContext: DrawContext,
  label: string,
  levels: number,
): number[] {
  const start = pickSequentialVariant(
    drawContext,
    `${label}:start`,
    [25, 30, 35],
  );
  const step = pickSequentialVariant(drawContext, `${label}:step`, [15, 20]);
  const ceiling = 95;

  return Array.from({ length: levels }, (_entry, index) =>
    Math.min(ceiling, start + step * index),
  );
}

function rewardsFor(
  context: JourneyContext,
  drawContext: DrawContext,
  stage: JourneyStage,
  levels: number,
): ProbabilityLadderReward[] {
  const family = pickSequentialVariant(
    drawContext,
    "probability-ladder:reward-family",
    ["essence", "omens"] as const satisfies readonly RewardFamily[],
  );

  return Array.from({ length: levels }, (_entry, index) =>
    family === "essence"
      ? sharedRewardPayload(context, "gain_essence", {
          x: ESSENCE_AMOUNTS[stage][index]!,
        })
      : sharedRewardPayload(context, "gain_omens", {
          x: OMEN_COUNTS[stage][index]!,
        }),
  );
}

export function buildProbabilityLadderTree(
  context: JourneyContext,
  drawContext: DrawContext,
  stage: JourneyStage,
): JourneyTree {
  const levels = pickSequentialVariant(
    drawContext,
    "probability-ladder:levels",
    LEVELS,
  );
  const rewards = rewardsFor(context, drawContext, stage, levels);
  const chances = chanceProgression(
    drawContext,
    "probability-ladder:chances",
    levels,
  );
  const costs = COSTS[stage].slice(0, levels);

  return tree(
    costs.map((price, index) => {
      const level = index + 1;
      const chance = chances[index]!;
      const reward = rewards[index]!;
      const isFinal = level === costs.length;

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
            id: `level-${level}-attempt`,
            label: "Attempt",
            text: `Pay ${price} essence for a ${chance}% chance to ${reward.text}`,
            costs: [cost(price)],
            cost: price,
            odds: odds(chance),
          }),
          treeBranch({
            id: `level-${level}-success`,
            label: "Success",
            kind: "random_chance",
            text: `${sentenceCase(reward.text)} End the Journey.`,
            effects: reward.effects,
            effect: reward.effect,
            odds: odds(chance),
            terminal: {
              text: "End the Journey.",
              outcome: "claim",
              costs: [],
              effects: reward.effects,
              burdens: [],
              targets: [],
              routeEffects: [],
            },
          }),
          treeBranch({
            id: `level-${level}-failure`,
            label: "Failure",
            kind: "random_chance",
            text: isFinal ? "End the Journey." : `Go to Level ${level + 1}.`,
            odds: odds(100 - chance),
            ...(isFinal
              ? {
                  terminal: {
                    text: "End the Journey.",
                    outcome: "failure" as const,
                    costs: [],
                    effects: [],
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
