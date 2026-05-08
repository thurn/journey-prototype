import { commonValidationRules, defineShapePlugin, versionContribution, decisionTreeValidator } from "./shared.js";

export const randomPoolDrawsPlugin = defineShapePlugin({
  definition: {
      id: "random_pool_draws",
      topology: "decision_tree",
      rootOptionCount: { min: 0, max: 0 },
      supportedTags: ["sequence", "random", "pool", "reward", "tree"],
      validationRules: [
        "tree_has_complete_visible_levels",
        "pool_is_visible",
        "draw_replacement_policy_is_visible",
      ],
      repairPreferences: [
        "restore_fixed_pool",
        "normalize_draw_cost",
        "cap_draw_count",
      ],
      debugLabel: "Random pool draws",
      versionContribution: versionContribution("random_pool_draws", "decision_tree"),
    },
  scoreWeight: 0.6,
  repair: { actions: [{ action: "restore_fixed_pool", kind: "repair_payload_family" }, { action: "normalize_draw_cost", kind: "adjust_cost_or_burden" }, { action: "cap_draw_count", kind: "repair_payload_family" }] },
  validators: [decisionTreeValidator],
});
