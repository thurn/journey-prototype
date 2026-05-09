import type { FilledJourney, ShapeFillArgs } from "../types.js";
import { buildPrizeLadderTree } from "./tree.js";

export function prizeLadderFill(args: ShapeFillArgs): FilledJourney {
  return {
    options: [],
    tree: buildPrizeLadderTree(args.context, args.drawContext),
    precommitted: {},
  };
}
