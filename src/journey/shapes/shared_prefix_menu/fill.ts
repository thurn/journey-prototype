import { weightedChoice } from "../../../util/rng.js";
import {
  fillOptions,
  sharedBaneBurdenRewardFill,
  sharedStarterCleanupRewardFill,
} from "../../fillers/shapeFills.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_LABEL = "shared_prefix_menu";

export function sharedPrefixMenuFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext, stage } = args;
  const prefixFamily = weightedChoice(
    drawContext,
    `${SHAPE_LABEL}:prefix-family`,
    [
      { item: "shared_bane_burden", weight: 3 },
      { item: "starter_cleanup_prefix", weight: 2 },
    ] as const,
  );
  const cleanupPrefixFill = prefixFamily === "starter_cleanup_prefix"
    ? sharedStarterCleanupRewardFill({
        context,
        drawContext,
        label: SHAPE_LABEL,
        stage,
      })
    : undefined;
  const prefixFill =
    cleanupPrefixFill ??
    sharedBaneBurdenRewardFill({
      context,
      drawContext,
      label: SHAPE_LABEL,
      stage,
    });

  if (prefixFill) {
    return {
      options: prefixFill.options,
      precommitted: {
        routeEdits: prefixFill.options.flatMap(
          (journeyOption) => journeyOption.routeEffects,
        ),
      },
      symmetryContracts: prefixFill.symmetryContracts,
    };
  }

  return fillOptions("same_cost_different_rewards", context, drawContext, stage);
}
