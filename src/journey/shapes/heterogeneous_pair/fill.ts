import { shuffleDeterministic } from "../../../util/rng.js";
import {
  renumberOptions,
  rewardSlotOption,
  rewardSlots,
} from "../../fillers/shared.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_LABEL = "heterogeneous_pair";

export function heterogeneousPairFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext } = args;
  const positiveOptions = shuffleDeterministic(
    drawContext,
    `${SHAPE_LABEL}:positive-pair`,
    rewardSlots(context, drawContext, `${SHAPE_LABEL}:positive-menu`)
      .filter((reward) => reward.effect >= 150)
      .map((reward, index) => rewardSlotOption(index + 1, reward)),
  );
  const options = positiveOptions.slice(0, 2);

  return {
    options: renumberOptions(options),
    precommitted: {},
  };
}
