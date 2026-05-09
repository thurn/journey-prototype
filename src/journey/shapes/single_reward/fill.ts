import { shuffleDeterministic } from "../../../util/rng.js";
import { renumberOptions } from "../../fillers/shared.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";
import { commonPositiveOptions } from "./commonPositiveOptions.js";

const SHAPE_LABEL = "single_reward";

export function singleRewardFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext } = args;

  return {
    options: renumberOptions(
      shuffleDeterministic(
        drawContext,
        `${SHAPE_LABEL}:single-reward-options`,
        commonPositiveOptions(
          context,
          drawContext,
          `${SHAPE_LABEL}:positive-menu`,
        ),
      ).slice(0, 2),
    ),
    precommitted: {},
  };
}
