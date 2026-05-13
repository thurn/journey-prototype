import { fail, type ValidationResult } from "../../validate/result.js";
import type { JourneyManifest } from "../../manifest.js";
import {
  decisionTreeValidator,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { probabilityLadderFill } from "./fill.js";

function validateProbabilityLadder(manifest: JourneyManifest): ValidationResult {
  const rewardBranches =
    manifest.tree?.nodes.flatMap((node) =>
      node.branches.filter((branch) =>
        branch.kind === "random_chance" &&
        branch.effects.length > 0
      )
    ) ?? [];
  const successBranches =
    manifest.tree?.nodes.flatMap((node) =>
      node.branches.filter((branch) => branch.terminal?.outcome === "claim")
    ) ?? [];

  if (successBranches.length === 0) {
    return fail(
      "probability_ladder_missing_success",
      "Probability ladders require visible success outcomes",
    );
  }

  for (const branch of rewardBranches) {
    if (branch.nextNodeId || branch.terminal?.outcome !== "claim") {
      return fail(
        "fixed_reward_can_be_won_once",
        "Probability ladder success must end the Journey",
      );
    }
  }

  return { ok: true };
}

export const probabilityLadderPlugin = defineShapePlugin({
  definition: {
    id: "probability_ladder",
    topology: "decision_tree",
    rootOptionCount: { min: 0, max: 0 },
    supportedTags: ["sequence", "chance", "cost", "reward", "tree"],
    validationRules: [
      "tree_has_complete_visible_levels",
      "fixed_reward_can_be_won_once",
      "attempt_costs_share_family",
    ],
    debugLabel: "Probability ladder",
    versionContribution: versionContribution(
      "probability_ladder",
      "decision_tree",
    ),
  },
  validators: [decisionTreeValidator],
  treeValidator: (manifest) => validateProbabilityLadder(manifest),
  fill: probabilityLadderFill,
});
