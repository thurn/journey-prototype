import type { JourneyContext } from "../../../quest/context.js";
import type { DrawContext } from "../../../util/rng.js";
import { treeBuilderTools } from "../../fillers/shared.js";
import {
  createTreePrimitives,
  tree,
  treeBranch,
} from "../../fillers/treeBuilders.js";
import type { JourneyTree } from "../../manifest.js";

export function buildPrizeLadderTree(
  context: JourneyContext,
  drawContext: DrawContext,
): JourneyTree {
  const { treeRewardFamily, essenceCostProgression } =
    createTreePrimitives(treeBuilderTools);
  const { cost, lowerFirst, sentenceCase, sequentialReward } = treeBuilderTools;
  const rewardFamily = treeRewardFamily(
    context,
    drawContext,
    "prize-ladder:reward-family",
    4,
    ["essence", "omens", "card_draft", "dreamsign_draft", "starter_cleanup"],
  );
  const claimReward =
    rewardFamily.rewards[3] ??
    sequentialReward(context, drawContext, "prize-ladder:claim-reward");
  const costs = essenceCostProgression(
    context,
    drawContext,
    "prize-ladder:costs",
    3,
    "steep",
  );

  return tree(
    [1, 2, 3].map((level) => {
      const stopReward = rewardFamily.rewards[level - 1]!;
      const stopText = `${sentenceCase(stopReward.text)} End the Journey.`;
      const price = costs[level - 1]!;
      const isFinal = level === 3;

      return {
        id: `level-${level}`,
        levelLabel: `Level ${level}`,
        branches: [
          treeBranch({
            id: `level-${level}-stop`,
            label: "Stop",
            text: stopText,
            effects: stopReward.effects,
            targets: stopReward.targets ?? [],
            effect: stopReward.effect,
            terminal: {
              text: "End the Journey.",
              outcome: "end",
              costs: [],
              effects: stopReward.effects,
              burdens: [],
              targets: stopReward.targets ?? [],
              routeEffects: [],
            },
          }),
          treeBranch({
            id: `level-${level}-${isFinal ? "claim" : "continue"}`,
            label: isFinal ? "Claim" : "Continue",
            text: isFinal
              ? `Pay ${price} essence and ${lowerFirst(claimReward.text)} End the Journey.`
              : `Pay ${price} essence. Go to Level ${level + 1}.`,
            costs: [cost("essence", price)],
            effects: isFinal ? claimReward.effects : [],
            targets: isFinal ? (claimReward.targets ?? []) : [],
            cost: price,
            effect: isFinal ? claimReward.effect : 0,
            ...(isFinal
              ? {
                  terminal: {
                    text: "End the Journey.",
                    outcome: "claim" as const,
                    costs: [cost("essence", price)],
                    effects: claimReward.effects,
                    burdens: [],
                    targets: claimReward.targets ?? [],
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
