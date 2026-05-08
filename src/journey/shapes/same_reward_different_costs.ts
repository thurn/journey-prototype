import { commonValidationRules, defineShapePlugin, versionContribution } from "./shared.js";

export const sameRewardDifferentCostsPlugin = defineShapePlugin({
  definition: {
      id: "same_reward_different_costs",
      topology: "direct_menu",
      rootOptionCount: { min: 2, max: 4 },
      supportedTags: ["reward", "cost", "ambition", "menu"],
      validationRules: [
        ...commonValidationRules,
        "all_options_share_reward_class",
        "higher_costs_are_justified_by_higher_reward_quality",
      ],
      repairPreferences: [
        "align_reward_class",
        "lower_overpriced_cost",
        "increase_underpriced_reward_quality",
      ],
      debugLabel: "Same reward, different costs",
      versionContribution: versionContribution(
        "same_reward_different_costs",
        "direct_menu",
      ),
    },
  scoreWeight: 1.25,
  generatedObjects: { natural: true },
  repair: { actions: [{ action: "align_reward_class", kind: "repair_payload_family" }, { action: "lower_overpriced_cost", kind: "adjust_cost_or_burden" }, { action: "increase_underpriced_reward_quality", kind: "adjust_cost_or_burden" }] },
});
