import type { FilledJourney, ShapeFillArgs } from "../types.js";
import { buildPrecommittedOperations } from "../../operationBuilders.js";
import {
  buildPushYourLuckTree,
  odds,
  pushYourLuckAttemptBranches,
} from "./tree.js";

export function pushYourLuckFill(args: ShapeFillArgs): FilledJourney {
  const pushTree = buildPushYourLuckTree(args.context, args.drawContext);
  const attemptBranches = pushYourLuckAttemptBranches(pushTree);
  const firstAttempt = attemptBranches[0];
  const precommitted = {
    random: [
      {
        kind: "push_choice",
        bounded: true,
        odds: firstAttempt?.odds ?? odds(50),
        attempts: attemptBranches.map((branch) => ({
          id: branch.id,
          odds: branch.odds,
          costs: branch.costs,
          effects: branch.effects,
        })),
        hazard: {
          attempts: attemptBranches.map((branch) => ({
            id: branch.id,
            odds: branch.odds,
            costs: branch.costs,
            effects: branch.effects,
          })),
        },
        visibilityPolicy: {
          outcomeVisibility: "visible",
          disclosure:
            "Push-your-luck attempt odds, costs, and rewards are visible on each branch.",
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
