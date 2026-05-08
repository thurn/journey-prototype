import { commonValidationRules, defineShapePlugin, versionContribution } from "./shared.js";

export const singleRewardPlugin = defineShapePlugin({
  definition: {
      id: "single_reward",
      topology: "single_reward",
      rootOptionCount: { min: 2, max: 2 },
      supportedTags: ["reward", "boon", "cleanse", "single"],
      validationRules: [
        "root_option_count_within_bounds",
        "single_option_is_deterministic_reward",
        "option_has_no_meaningful_cost_or_refusal_tension",
      ],
      repairPreferences: [
        "remove_cost_or_burden",
        "collapse_extra_options",
        "replace_with_simple_reward",
      ],
      debugLabel: "Single reward",
      versionContribution: versionContribution("single_reward", "single_reward"),
    },
  scoreWeight: 0.65,
  repair: { fallbackRank: 1, actions: [{ action: "remove_cost_or_burden", kind: "adjust_cost_or_burden" }, { action: "collapse_extra_options", kind: "simplify_fill" }, { action: "replace_with_simple_reward", kind: "switch_to_shape", targetShapeId: "single_reward" }] },
});
