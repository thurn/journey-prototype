import { drawInt } from "../../../util/rng.js";
import { renumberOptions } from "../../fillers/shared.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";
import { commonPositiveOptions } from "./commonPositiveOptions.js";

const SHAPE_LABEL = "single_reward";

export function singleRewardFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext, stage } = args;
  const options = commonPositiveOptions(
    context,
    drawContext,
    `${SHAPE_LABEL}:visible-boon`,
    stage,
  );
  const selectedOption = options[
    drawInt(drawContext, `${SHAPE_LABEL}:selected-visible-boon`, 0, options.length - 1)
  ]!;

  return {
    options: renumberOptions([selectedOption]),
    precommitted: {},
  };
}
