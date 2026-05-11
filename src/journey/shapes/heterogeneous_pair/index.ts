import {
  commonValidationRules,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { heterogeneousPairFill } from "./fill.js";

export const heterogeneousPairPlugin = defineShapePlugin({
  definition: {
    id: "heterogeneous_pair",
    topology: "direct_menu",
    rootOptionCount: { min: 2, max: 2 },
    supportedTags: ["reward", "comparison", "two_axis", "menu"],
    validationRules: [
      ...commonValidationRules,
      "exactly_two_options",
      "options_operate_on_distinct_axes",
    ],
    repairPreferences: [
      "replace_matching_axis_option",
      "rebalance_pair_values",
      "clarify_axis_difference",
    ],
    debugLabel: "Heterogeneous pair",
    versionContribution: versionContribution(
      "heterogeneous_pair",
      "direct_menu",
    ),
    menuValueChecks: {
      positiveBands: true,
      symmetricBands: false,
      escalationOrRiskExempt: false,
    },
  },
  repair: {
    actions: [
      { action: "replace_matching_axis_option", kind: "repair_payload_family" },
      { action: "rebalance_pair_values", kind: "repair_payload_family" },
      { action: "clarify_axis_difference", kind: "repair_payload_family" },
    ],
  },
  fill: heterogeneousPairFill,
});
