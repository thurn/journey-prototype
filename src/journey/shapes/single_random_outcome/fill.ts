import { drawInt } from "../../../util/rng.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";
import { revealChoiceOptions } from "./reveal.js";
import { wheelRootOptions } from "./wheel.js";

const SHAPE_LABEL = "single_random_outcome";
const RANDOM_FAMILIES = ["reveal_choice", "visible_wheel"] as const;

export function singleRandomOutcomeFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext, stage } = args;
  const family =
    RANDOM_FAMILIES[
      drawInt(drawContext, `${SHAPE_LABEL}:random-family`, 0, RANDOM_FAMILIES.length - 1)
    ]!;

  if (family === "visible_wheel") {
    const wheel = wheelRootOptions({
      context,
      drawContext,
      label: `${SHAPE_LABEL}:wheel`,
      stage,
    });

    return {
      options: wheel.options,
      rewardPool: wheel.rewardPool,
      precommitted: {
        random: wheel.precommitted,
      },
    };
  }

  const reveal = revealChoiceOptions({
    context,
    drawContext,
    label: `${SHAPE_LABEL}:reveal`,
    stage,
  });

  return {
    options: reveal.options,
    precommitted: {
      random: reveal.precommitted,
    },
  };
}
