import type { JourneyContext } from "../../../quest/context.js";
import { drawInt, type DrawContext } from "../../../util/rng.js";
import type { JourneyStage, JourneyTree, JourneyTreeBranch } from "../../manifest.js";
import {
  buildTreeBranchOperations,
  buildTreeTerminalOperations,
} from "../../operationBuilders.js";
import { getReward } from "../../shared/rewards.js";
import type { TemplateParams } from "../../shared/types.js";

type PrizeLadderReward = {
  readonly text: string;
  readonly effects: readonly unknown[];
  readonly effect: number;
};

type PrizeLadderRewardFamily = "essence" | "omens";

type CostBands = {
  readonly first: readonly number[];
  readonly second: readonly number[];
  readonly claim: readonly number[];
  readonly margin: number;
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

const COST_BANDS: Record<JourneyStage, CostBands> = {
  early: {
    first: [15, 20],
    second: [30, 35],
    claim: [45, 50],
    margin: 15,
  },
  mid: {
    first: [35, 40, 45],
    second: [70, 80, 90],
    claim: [125, 140, 155],
    margin: 80,
  },
  late: {
    first: [50, 55, 60],
    second: [100, 110, 120],
    claim: [165, 175, 185],
    margin: 30,
  },
};

const CLAIM_PREMIUM: Record<JourneyStage, number> = {
  early: 30,
  mid: 50,
  late: 70,
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

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function sentenceCase(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function roundUpToFive(amount: number): number {
  return Math.ceil(amount / 5) * 5;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function rewardTuple(
  rewards: readonly PrizeLadderReward[],
): readonly [PrizeLadderReward, PrizeLadderReward, PrizeLadderReward] {
  return [rewards[0]!, rewards[1]!, rewards[2]!];
}

function fitCostsToBudget(
  selectedCosts: readonly [number, number, number],
  budget: number,
): [number, number, number] {
  const costs = [...selectedCosts] as [number, number, number];

  while (sum(costs) > budget) {
    const reducibleIndex = [2, 1, 0].find((index) => {
      const floor = index === 0 ? 5 : costs[index - 1]! + 5;

      return costs[index]! > floor;
    });

    if (reducibleIndex === undefined) break;

    costs[reducibleIndex] -= 5;
  }

  return costs;
}

function prizeLadderCosts(
  context: JourneyContext,
  drawContext: DrawContext,
  stage: JourneyStage,
): [number, number, number] {
  const band = COST_BANDS[stage];
  const selected: [number, number, number] = [
    pickSequentialVariant(drawContext, "prize-ladder:costs:first", band.first),
    pickSequentialVariant(drawContext, "prize-ladder:costs:second", band.second),
    pickSequentialVariant(drawContext, "prize-ladder:costs:claim", band.claim),
  ];
  const pathBudget = Math.max(
    15,
    context.state.quest.resources.essence - band.margin,
  );

  return fitCostsToBudget(selected, pathBudget);
}

function sharedRewardPayload(
  context: JourneyContext,
  templateId: "gain_essence" | "gain_omens",
  params: TemplateParams,
): PrizeLadderReward {
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

function essenceStopRewards(
  context: JourneyContext,
  drawContext: DrawContext,
  stage: JourneyStage,
): readonly [PrizeLadderReward, PrizeLadderReward, PrizeLadderReward] {
  const bands = {
    early: { base: [45, 55], growth: [35, 40] },
    mid: { base: [65, 75], growth: [45, 55] },
    late: { base: [85, 95], growth: [60, 70] },
  } as const;
  const selected = bands[stage];
  const base = pickSequentialVariant(
    drawContext,
    "prize-ladder:essence-reward:base",
    selected.base,
  );
  const growth = pickSequentialVariant(
    drawContext,
    "prize-ladder:essence-reward:growth",
    selected.growth,
  );

  return rewardTuple([0, 1, 2].map((index) => {
    const x = roundUpToFive(base + growth * index);

    return sharedRewardPayload(context, "gain_essence", { x });
  }));
}

function omenCountsForStage(stage: JourneyStage): [number, number, number] {
  switch (stage) {
    case "late":
      return [2, 3, 5];
    case "mid":
      return [1, 2, 4];
    case "early":
      return [1, 2, 3];
  }
}

function omenReward(context: JourneyContext, x: number): PrizeLadderReward {
  return sharedRewardPayload(context, "gain_omens", { x });
}

function stopRewards(
  context: JourneyContext,
  drawContext: DrawContext,
  stage: JourneyStage,
): {
  readonly family: PrizeLadderRewardFamily;
  readonly rewards: readonly [PrizeLadderReward, PrizeLadderReward, PrizeLadderReward];
} {
  const family = pickSequentialVariant(
    drawContext,
    "prize-ladder:reward-family:family",
    ["essence", "omens"] as const,
  );

  if (family === "essence") {
    return { family, rewards: essenceStopRewards(context, drawContext, stage) };
  }

  return {
    family,
    rewards: rewardTuple(omenCountsForStage(stage).map((x) => omenReward(context, x))),
  };
}

function claimReward(args: {
  readonly context: JourneyContext;
  readonly stage: JourneyStage;
  readonly family: PrizeLadderRewardFamily;
  readonly levelThreeStop: PrizeLadderReward;
  readonly claimCost: number;
  readonly fullPathCost: number;
}): PrizeLadderReward {
  const premium = CLAIM_PREMIUM[args.stage];

  if (args.family === "essence") {
    const x = roundUpToFive(
      args.levelThreeStop.effect + args.fullPathCost + premium,
    );

    return sharedRewardPayload(args.context, "gain_essence", { x });
  }

  const minimumClaimEffect =
    args.levelThreeStop.effect + args.claimCost + premium;
  let x = Math.max(
    omenCountsForStage(args.stage)[2] + 3,
    1,
  );
  let reward = omenReward(args.context, x);

  while (reward.effect < minimumClaimEffect) {
    x += 1;
    reward = omenReward(args.context, x);
  }

  return reward;
}

export function buildPrizeLadderTree(
  context: JourneyContext,
  drawContext: DrawContext,
  stage: JourneyStage,
): JourneyTree {
  const rewardFamily = stopRewards(context, drawContext, stage);
  const costs = prizeLadderCosts(context, drawContext, stage);
  const finalClaimReward = claimReward({
    context,
    stage,
    family: rewardFamily.family,
    levelThreeStop: rewardFamily.rewards[2],
    claimCost: costs[2],
    fullPathCost: sum(costs),
  });

  return tree(
    [1, 2, 3].map((level) => {
      const stopReward = rewardFamily.rewards[level - 1]!;
      const stopText = `${sentenceCase(stopReward.text)} End the Journey.`;
      const price = costs[level - 1]!;
      const isFinal = level === 3;
      const advanceCost = cost(price);

      return {
        id: `level-${level}`,
        levelLabel: `Level ${level}`,
        branches: [
          treeBranch({
            id: `level-${level}-stop`,
            label: "Stop",
            text: stopText,
            effects: stopReward.effects,
            effect: stopReward.effect,
            terminal: {
              text: "End the Journey.",
              outcome: "end",
              costs: [],
              effects: stopReward.effects,
              burdens: [],
              targets: [],
              routeEffects: [],
            },
          }),
          treeBranch({
            id: `level-${level}-${isFinal ? "claim" : "continue"}`,
            label: isFinal ? "Claim" : "Continue",
            text: isFinal
              ? `Pay ${price} essence and ${lowerFirst(finalClaimReward.text)} End the Journey.`
              : `Pay ${price} essence. Go to Level ${level + 1}.`,
            costs: [advanceCost],
            effects: isFinal ? finalClaimReward.effects : [],
            cost: price,
            effect: isFinal ? finalClaimReward.effect : 0,
            ...(isFinal
              ? {
                  terminal: {
                    text: "End the Journey.",
                    outcome: "claim" as const,
                    costs: [advanceCost],
                    effects: finalClaimReward.effects,
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
