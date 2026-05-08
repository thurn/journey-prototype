import { commonValidationRules, defineShapePlugin, versionContribution } from "./shared.js";

export const randomAllocationPlugin = defineShapePlugin({
  definition: {
      id: "random_allocation",
      topology: "direct_menu",
      rootOptionCount: { min: 3, max: 4 },
      supportedTags: ["reward", "cost", "burden", "eclectic", "menu"],
      validationRules: [
        ...commonValidationRules,
        "options_share_scene_frame_without_required_symmetry",
        "each_option_has_independent_payload",
      ],
      repairPreferences: [
        "rebalance_outlier_option_value",
        "replace_off-theme_option",
        "reduce_to_three_authored_options",
      ],
      debugLabel: "Random allocation",
      versionContribution: versionContribution("random_allocation", "direct_menu"),
    },
  scoreWeight: 1.35,
  generatedObjects: { natural: true, highWeirdness: true },
  repair: { actions: [{ action: "rebalance_outlier_option_value", kind: "repair_payload_family" }, { action: "replace_off-theme_option", kind: "repair_payload_family" }, { action: "reduce_to_three_authored_options", kind: "simplify_fill" }] },
});
