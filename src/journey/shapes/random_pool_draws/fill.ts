import { pickSequentialVariant } from "../../fillers/shared.js";
import { visibleWheelPool } from "../../fillers/randomPayloads.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";
import { buildRandomPoolDrawsTree } from "./tree.js";

export function randomPoolDrawsFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext, stage } = args;
  const wheel = visibleWheelPool({
    context,
    drawContext,
    label: "random-pool",
    stage,
    size: pickSequentialVariant(drawContext, "random-pool:size", [5, 6]),
  });
  const pool = wheel.rewardPool;
  const drawCount = 2;

  return {
    options: [],
    tree: buildRandomPoolDrawsTree(context, drawContext),
    rewardPool: pool,
    precommitted: {
      random: [
        {
          ...wheel.visiblePoolEnvelope,
          poolId: "random-pool-draws",
        },
        {
          kind: "repeated_pool_draws",
          poolId: "random-pool-draws",
          drawCount,
          rewards: pool.rewards,
          committedDraws: wheel.candidates
            .slice(0, drawCount)
            .map((candidate) => candidate.payloads),
          replacement: pool.replacement,
          visibilityPolicy: {
            outcomeVisibility: "pre_rolled",
            disclosure:
              "Repeated draws use the fixed visible pool with replacement and are committed in metadata.",
            playerVisible: true,
          },
          expectedConvertedEssence:
            Number(wheel.visiblePoolEnvelope.expectedConvertedEssence ?? 0) *
            drawCount,
          riskPremiumConvertedEssence: -12,
          worstCaseBurdenConvertedEssence:
            Number(wheel.visiblePoolEnvelope.worstCaseBurdenConvertedEssence ?? 0) *
            drawCount,
          presentation: "random_pool_repeated_draws",
        },
      ],
    },
  };
}
