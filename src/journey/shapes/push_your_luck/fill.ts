import type { FilledJourney, ShapeFillArgs } from "../types.js";
import { buildPrecommittedOperations } from "../../operationBuilders.js";
import {
  buildPushYourLuckTree,
  odds,
  pushYourLuckFailureBranches,
} from "./tree.js";

export function pushYourLuckFill(args: ShapeFillArgs): FilledJourney {
  const pushTree = buildPushYourLuckTree(args.context, args.drawContext);
  const failureBranches = pushYourLuckFailureBranches(pushTree);
  const firstFailure = failureBranches[0];
  const precommitted = {
    random: [
      {
        kind: "push_choice",
        bounded: true,
        odds: firstFailure?.odds ?? odds(50),
        hazard: {
          branches: failureBranches.map((branch) => ({
            id: branch.id,
            odds: branch.odds,
            burdens: branch.burdens ?? [],
          })),
        },
        visibilityPolicy: {
          outcomeVisibility: "visible",
          disclosure:
            "Push-your-luck failure odds and hazards are visible on each push branch.",
          playerVisible: true,
        },
      },
    ],
  };

  return {
    options: [],
    tree: pushTree,
    precommitted: {
      ...precommitted,
      operations: buildPrecommittedOperations(precommitted),
    },
  };
}
