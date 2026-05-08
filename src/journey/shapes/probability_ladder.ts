import { commonValidationRules, defineShapePlugin, versionContribution, decisionTreeValidator } from "./shared.js";

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
    },
  scoreWeight: 0.6,
  repair: { actions: [{ action: "normalize_attempt_costs", kind: "adjust_cost_or_burden" }, { action: "make_success_terminal", kind: "repair_payload_family" }, { action: "simplify_ladder_level_count", kind: "simplify_fill" }] },
  validators: [decisionTreeValidator],
});
