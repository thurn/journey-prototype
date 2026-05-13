import type { JourneyContext } from "../../../quest/context.js";
import type { DrawContext } from "../../../util/rng.js";
import { treeBuilderTools } from "../../fillers/shared.js";
import {
  createTreePrimitives,
  odds,
  tree,
  treeBranch,
} from "../../fillers/treeBuilders.js";
import type { JourneyTree } from "../../manifest.js";

function chanceProgression(
  drawContext: DrawContext,
  label: string,
  levels: number,
): number[] {
  const { pickSequentialVariant } = treeBuilderTools;
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

export function buildProbabilityLadderTree(
  context: JourneyContext,
  drawContext: DrawContext,
): JourneyTree {
  const { cost, pickSequentialVariant, sentenceCase, sequentialReward } =
    treeBuilderTools;
  const { essenceCostProgression } = createTreePrimitives(treeBuilderTools);
  const reward = sequentialReward(
    context,
    drawContext,
    "probability-ladder:reward",
  );
  const levels = pickSequentialVariant(
    drawContext,
    "probability-ladder:levels",
    [3, 4],
  );
  const costs = essenceCostProgression(
    context,
    drawContext,
    "probability-ladder:costs",
    levels,
    "standard",
  );
  const chances = chanceProgression(
    drawContext,
    "probability-ladder:chances",
    levels,
  );

  return tree(
    costs.map((price, index) => {
      const level = index + 1;
      const chance = chances[index]!;
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
            costs: [cost("essence", price)],
            cost: price,
            odds: odds(chance),
          }),
          treeBranch({
            id: `level-${level}-success`,
            label: "Success",
            kind: "random_chance",
            text: `${sentenceCase(reward.text)} End the Journey.`,
            effects: reward.effects,
            targets: reward.targets ?? [],
            effect: reward.effect,
            odds: odds(chance),
            terminal: {
              text: "End the Journey.",
              outcome: "claim",
              costs: [],
              effects: reward.effects,
              burdens: [],
              targets: reward.targets ?? [],
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
