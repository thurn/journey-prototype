import type { FilledJourney, ShapeFillArgs } from "../types.js";
import { timedWindowMenuFill } from "./payloads.js";

const SHAPE_ID = "timed_window_menu";

export function timedWindowMenuFillImpl(args: ShapeFillArgs): FilledJourney {
  const timedWindow = timedWindowMenuFill({
    context: args.context,
    drawContext: args.drawContext,
    shapeId: SHAPE_ID,
  });

  return {
    options: timedWindow.options,
    precommitted: timedWindow.routeEdits.length > 0
      ? { routeEdits: timedWindow.routeEdits }
      : {},
    symmetryContracts: timedWindow.symmetryContracts,
  };
}
