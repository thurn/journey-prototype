import { pickSequentialVariant } from "../../fillers/shared.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";
import { revealChoiceOptions } from "./reveal.js";
import { wheelRootOptions } from "./wheel.js";

const SHAPE_LABEL = "single_random_outcome";

export function singleRandomOutcomeFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext, stage } = args;
  const family = pickSequentialVariant(
    drawContext,
    `${SHAPE_LABEL}:random-family`,
    ["reveal_choice", "visible_wheel"] as const,
  );

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
