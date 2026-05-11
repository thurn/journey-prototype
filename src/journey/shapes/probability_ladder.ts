import { fail, type ValidationResult } from "../validate/result.js";
import type { JourneyManifest } from "../manifest.js";
import { commonValidationRules, defineShapePlugin, versionContribution, decisionTreeValidator } from "./shared.js";

function validateProbabilityLadder(manifest: JourneyManifest): ValidationResult {
  const rewardBranches = manifest.tree?.nodes.flatMap((node) =>
    node.branches.filter((branch) =>
      branch.kind === "random_chance" &&
      branch.effects.length > 0
    )
  ) ?? [];
  const successBranches = manifest.tree?.nodes.flatMap((node) =>
    node.branches.filter((branch) => branch.terminal?.outcome === "claim")
  ) ?? [];

  if (successBranches.length === 0) {
    return fail("probability_ladder_missing_success", "Probability ladders require visible success outcomes");
  }

  for (const branch of rewardBranches) {
    if (branch.nextNodeId || branch.terminal?.outcome !== "claim") {
      return fail("fixed_reward_can_be_won_once", "Probability ladder success must end the Journey");
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
      repairPreferences: [
        "normalize_attempt_costs",
        "make_success_terminal",
        "simplify_ladder_level_count",
      ],
      debugLabel: "Probability ladder",
      versionContribution: versionContribution("probability_ladder", "decision_tree"),
      menuValueChecks: { positiveBands: false, symmetricBands: false, escalationOrRiskExempt: true },
    },
  repair: { actions: [{ action: "normalize_attempt_costs", kind: "adjust_cost_or_burden" }, { action: "make_success_terminal", kind: "repair_payload_family" }, { action: "simplify_ladder_level_count", kind: "simplify_fill" }] },
  validators: [decisionTreeValidator],
  treeValidator: (manifest) => validateProbabilityLadder(manifest),
});
