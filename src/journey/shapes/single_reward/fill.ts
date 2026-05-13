import { shuffleDeterministic } from "../../../util/rng.js";
import { renumberOptions } from "../../fillers/shared.js";
import type { JourneyOption } from "../../manifest.js";
import { POSITIVE_MENU_VALUE_CONSTANTS } from "../../value.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";
import { commonPositiveOptions } from "./commonPositiveOptions.js";

const SHAPE_LABEL = "single_reward";

function positiveOptionsAreComparable(options: readonly JourneyOption[]): boolean {
  const positiveNets = options
    .map((option) => option.netConvertedEssence)
    .filter((net) => net > 0);

  if (positiveNets.length < 2) {
    return true;
  }

  const lowest = Math.min(...positiveNets);
  const highest = Math.max(...positiveNets);
  const minimumComparableValue = Math.max(
    highest - POSITIVE_MENU_VALUE_CONSTANTS.maximumComparableSpread,
    highest * POSITIVE_MENU_VALUE_CONSTANTS.minimumComparableRatio,
  );

  return lowest >= minimumComparableValue;
}

function selectComparablePositivePair(
  options: readonly JourneyOption[],
): JourneyOption[] {
  for (let leftIndex = 0; leftIndex < options.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < options.length;
      rightIndex += 1
    ) {
      const pair = [options[leftIndex]!, options[rightIndex]!];

      if (positiveOptionsAreComparable(pair)) {
        return pair;
      }
    }
  }

  return [...options]
    .sort(
      (left, right) =>
        right.netConvertedEssence - left.netConvertedEssence ||
        left.number - right.number,
    )
    .slice(0, 2);
}

export function singleRewardFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext } = args;
  const shuffledOptions = shuffleDeterministic(
    drawContext,
    `${SHAPE_LABEL}:single-reward-options`,
    commonPositiveOptions(
      context,
      drawContext,
      `${SHAPE_LABEL}:positive-menu`,
    ),
  );

  return {
    options: renumberOptions(selectComparablePositivePair(shuffledOptions)),
    precommitted: {},
  };
}
