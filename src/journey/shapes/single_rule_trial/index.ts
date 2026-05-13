import { defineShapePlugin, versionContribution } from "../shared.js";
import { singleRuleTrialFill } from "./fill.js";
import { validators } from "./validators.js";

export const singleRuleTrialPlugin = defineShapePlugin({
  definition: {
    id: "single_rule_trial",
    topology: "single_rule_trial",
    rootOptionCount: { min: 1, max: 1 },
    supportedTags: ["status", "rule", "trial", "single"],
    validationRules: [
      "root_option_count_within_bounds",
      "single_option_applies_a_rule_status",
      "single_option_has_no_meaningful_cost_or_choice",
    ],
    debugLabel: "Single rule trial",
    versionContribution: versionContribution(
      "single_rule_trial",
      "single_rule_trial",
    ),
  },
  fill: singleRuleTrialFill,
  validators,
});
