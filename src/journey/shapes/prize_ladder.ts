import { commonValidationRules, defineShapePlugin, versionContribution, decisionTreeValidator } from "./shared.js";

export const prizeLadderPlugin = defineShapePlugin({
  definition: {
      id: "prize_ladder",
      topology: "decision_tree",
      rootOptionCount: { min: 0, max: 0 },
      supportedTags: ["sequence", "ladder", "cost", "reward", "tree"],
      validationRules: [
        "tree_has_complete_visible_levels",
        "stop_rewards_scale_coherently",
        "continue_costs_share_family",
      ],
      repairPreferences: [
        "normalize_cost_family",
        "align_stop_reward_family",
        "simplify_ladder_level_count",
      ],
      debugLabel: "Prize ladder",
      versionContribution: versionContribution("prize_ladder", "decision_tree"),
    },
  scoreWeight: 0.65,
  repair: { actions: [{ action: "normalize_cost_family", kind: "adjust_cost_or_burden" }, { action: "align_stop_reward_family", kind: "repair_payload_family" }, { action: "simplify_ladder_level_count", kind: "simplify_fill" }] },
  validators: [decisionTreeValidator],
});
