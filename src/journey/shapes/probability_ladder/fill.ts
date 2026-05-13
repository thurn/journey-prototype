import type { FilledJourney, ShapeFillArgs } from "../types.js";
import { buildPrecommittedOperations } from "../../operationBuilders.js";
import { buildProbabilityLadderTree, odds } from "./tree.js";

export function probabilityLadderFill(args: ShapeFillArgs): FilledJourney {
  const ladderTree = buildProbabilityLadderTree(
    args.context,
    args.drawContext,
    args.stage,
  );
  const firstAttempt = ladderTree.nodes[0]?.branches.find(
    (branch) => branch.label === "Attempt",
  );
  const precommitted = {
    random: [
      {
        kind: "probability_ladder",
        bounded: true,
        odds: firstAttempt?.odds ?? odds(50),
        visibilityPolicy: {
          outcomeVisibility: "visible",
          disclosure:
            "Probability ladder odds are bounded and shown on each branch.",
          playerVisible: true,
        },
      },
    ],
  };

  return {
    options: [],
    tree: ladderTree,
    precommitted: {
      ...precommitted,
      operations: buildPrecommittedOperations(precommitted),
    },
  };
}
