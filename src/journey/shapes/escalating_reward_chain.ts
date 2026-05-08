import { commonValidationRules, defineShapePlugin, versionContribution, decisionTreeValidator } from "./shared.js";

export const escalatingRewardChainPlugin = defineShapePlugin({
  definition: {
      id: "escalating_reward_chain",
      topology: "decision_tree",
      rootOptionCount: { min: 0, max: 0 },
      supportedTags: ["sequence", "reward", "cost", "chain", "tree"],
      validationRules: [
        "tree_has_complete_visible_levels",
        "chain_rewards_share_family",
        "take_costs_scale_coherently",
      ],
      repairPreferences: [
        "align_reward_family",
        "normalize_cost_scaling",
        "simplify_chain_level_count",
      ],
      debugLabel: "Escalating reward chain",
      versionContribution: versionContribution("escalating_reward_chain", "decision_tree"),
    },
  scoreWeight: 0.5,
  repair: { actions: [{ action: "align_reward_family", kind: "repair_payload_family" }, { action: "normalize_cost_scaling", kind: "adjust_cost_or_burden" }, { action: "simplify_chain_level_count", kind: "simplify_fill" }] },
  validators: [decisionTreeValidator],
});
