import type { FilledJourney, ShapeFillArgs } from "../types.js";
import { buildEscalatingRewardChainTree } from "./tree.js";

export function escalatingRewardChainFill(args: ShapeFillArgs): FilledJourney {
  return {
    options: [],
    tree: buildEscalatingRewardChainTree(
      args.context,
      args.drawContext,
      args.stage,
    ),
    precommitted: {},
  };
}
