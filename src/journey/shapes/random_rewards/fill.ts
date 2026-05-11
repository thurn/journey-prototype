import {
  rewardSlotOption,
  rewardSlots,
} from "../../fillers/shared.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

// Stable RNG namespace — kept at the original shape ID to preserve seed
// determinism across the rename to `random_rewards`.
const SHAPE_LABEL = "random_allocation";

export function randomRewardsFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext, stage } = args;

  return {
    options: rewardSlots(context, drawContext, `${SHAPE_LABEL}:rewards`, stage)
      .slice(0, 3)
      .map((reward, index) => rewardSlotOption(index + 1, reward)),
    precommitted: {},
  };
}
