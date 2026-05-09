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
import { valueBaneGain } from "../../value.js";

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

export function buildPushYourLuckTree(
  context: JourneyContext,
  drawContext: DrawContext,
): JourneyTree {
  const { pickSequentialVariant } = treeBuilderTools;
  const { treeRewardFamily } = createTreePrimitives(treeBuilderTools);
  const profile = {
    chances: pushChanceProgression(drawContext, "push-your-luck:chances", 3),
    rewards: treeRewardFamily(
      context,
      drawContext,
      "push-your-luck:reward-family",
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
  const failureBaneName = pickSequentialVariant(
    drawContext,
    "push-your-luck:failure-bane",
    BANE_NAMES,
  );
  const failureBane = {
    kind: "bane_gain",
    baneName: failureBaneName,
    count: 1,
  };
  const failureBurden = valueBaneGain(failureBaneName, 1);

  return tree(
    [1, 2, 3].map((level) => {
      const reward = profile.rewards[level - 1]!;
      const successPercent = profile.chances[level - 1]!;

      return {
        id: `level-${level}`,
        levelLabel: `Level ${level}`,
        branches: [
          treeBranch({
            id: `level-${level}-stop`,
            label: "Stop",
            text:
              level === 1
                ? "Leave."
                : "Keep the last safe reward. End the Journey.",
            terminal: {
              text: "End the Journey.",
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
            text: `Risk immediate failure for a ${successPercent}% chance to ${reward.text} ${level === 3 ? "End the Journey." : `Go to Level ${level + 1}.`}`,
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
            text: `Gain 1 ${failureBaneName}. End the Journey.`,
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
