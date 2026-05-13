import { defineShapePlugin, versionContribution } from "../shared.js";
import { singleRewardFill } from "./fill.js";

export const singleRewardPlugin = defineShapePlugin({
  definition: {
    id: "single_reward",
    topology: "single_reward",
    rootOptionCount: { min: 1, max: 1 },
    supportedTags: ["reward", "boon", "cleanse", "single"],
    validationRules: [
      "root_option_count_within_bounds",
      "single_option_is_deterministic_reward",
      "option_has_no_meaningful_cost_or_refusal_tension",
    ],
    debugLabel: "Single reward",
    versionContribution: versionContribution("single_reward", "single_reward"),
  },
  fill: singleRewardFill,
});
