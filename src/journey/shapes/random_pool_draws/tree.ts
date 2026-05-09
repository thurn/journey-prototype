import type { JourneyContext } from "../../../quest/context.js";
import type { DrawContext } from "../../../util/rng.js";
import {
  cost,
  payableSequentialCost,
  pickSequentialVariant,
} from "../../fillers/shared.js";
import { tree, treeBranch } from "../../fillers/treeBuilders.js";
import type { JourneyTree } from "../../manifest.js";

export function buildRandomPoolDrawsTree(
  context: JourneyContext,
  drawContext: DrawContext,
): JourneyTree {
  const levelCount = pickSequentialVariant(
    drawContext,
    "random-pool:levels",
    [3, 4],
  );
  const price = payableSequentialCost(
    context,
    pickSequentialVariant(drawContext, "random-pool:price", [35, 45, 55]),
  );

  return tree(
    Array.from({ length: levelCount }, (_, index) => index + 1).map(
      (level) => ({
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
            id: `level-${level}-draw`,
            label: "Draw",
            text: `Pay ${price} essence and gain a random reward from the pool. ${level === levelCount ? "End the Journey." : `Go to Level ${level + 1}.`}`,
            costs: [cost("essence", price)],
            effects: [
              {
                kind: "random_reward",
                pool: "visible_pool",
                replacement: "with_replacement",
              },
            ],
            cost: price,
            effect: 100,
            uncertainty: -15,
            ...(level === levelCount
              ? {
                  terminal: {
                    text: "End the Journey.",
                    outcome: "claim" as const,
                    costs: [cost("essence", price)],
                    effects: [
                      {
                        kind: "random_reward",
                        pool: "visible_pool",
                        replacement: "with_replacement",
                      },
                    ],
                    burdens: [],
                    targets: [],
                    routeEffects: [],
                  },
                }
              : { nextNodeId: `level-${level + 1}` }),
          }),
        ],
      }),
    ),
  );
}
