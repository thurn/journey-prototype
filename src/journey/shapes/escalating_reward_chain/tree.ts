import type { JourneyContext } from "../../../quest/context.js";
import type { DrawContext } from "../../../util/rng.js";
import { treeBuilderTools } from "../../fillers/shared.js";
import {
  createTreePrimitives,
  tree,
  treeBranch,
} from "../../fillers/treeBuilders.js";
import type { JourneyTree } from "../../manifest.js";

export function buildEscalatingRewardChainTree(
  context: JourneyContext,
  drawContext: DrawContext,
): JourneyTree {
  const { treeRewardFamily, essenceCostProgression } =
    createTreePrimitives(treeBuilderTools);
  const { cost, payableSequentialCost, pickSequentialVariant } = treeBuilderTools;
  const profile = {
    costs: essenceCostProgression(
      context,
      drawContext,
      "escalating-chain:costs",
      3,
      "standard",
    ),
    rewards: treeRewardFamily(
      context,
      drawContext,
      "escalating-chain:reward-family",
      3,
      [
        "essence",
        "omens",
        "card_draft",
        "dreamsign_draft",
        "starter_cleanup",
        "transfiguration",
        "battle_window",
      ],
    ).rewards,
  };
  const costShift = pickSequentialVariant(
    drawContext,
    "escalating-chain:cost-shift",
    [0, 5, 10],
  );

  return tree(
    profile.rewards.map((reward, index) => {
      const level = index + 1;
      const price = payableSequentialCost(context, profile.costs[index]! + costShift);
      const isFinal = level === profile.rewards.length;

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
            costs: [cost("essence", price)],
            effects: reward.effects,
            targets: reward.targets ?? [],
            cost: price,
            effect: reward.effect,
            ...(isFinal
              ? {
                  terminal: {
                    text: "End the Journey.",
                    outcome: "claim" as const,
                    costs: [cost("essence", price)],
                    effects: reward.effects,
                    burdens: [],
                    targets: reward.targets ?? [],
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
