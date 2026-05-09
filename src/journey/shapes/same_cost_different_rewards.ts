import { commonValidationRules, defineShapePlugin, versionContribution } from "./shared.js";

export const sameCostDifferentRewardsPlugin = defineShapePlugin({
  definition: {
      id: "same_cost_different_rewards",
      topology: "direct_menu",
      rootOptionCount: { min: 2, max: 4 },
      supportedTags: ["cost", "reward", "bargain", "menu"],
      validationRules: [
        ...commonValidationRules,
        "all_options_share_visible_cost",
        "each_option_contains_real_reward",
      ],
      repairPreferences: [
        "normalize_cost_to_shared_amount",
        "replace_pure_burden_option",
        "rebalance_reward_values",
      ],
      debugLabel: "Same cost, different rewards",
      versionContribution: versionContribution(
        "same_cost_different_rewards",
        "direct_menu",
      ),
      menuValueChecks: { positiveBands: true, symmetricBands: true, escalationOrRiskExempt: false },
      allowsRouteReward: true,
    },
  scoreWeight: 1.3,
  generatedObjects: { natural: true },
  repair: { actions: [{ action: "normalize_cost_to_shared_amount", kind: "adjust_cost_or_burden" }, { action: "replace_pure_burden_option", kind: "repair_payload_family" }, { action: "rebalance_reward_values", kind: "repair_payload_family" }] },
});
