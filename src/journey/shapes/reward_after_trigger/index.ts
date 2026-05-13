import { commonValidationRules, defineShapePlugin, versionContribution } from "../shared.js";
import { rewardAfterTriggerFill } from "./fill.js";

export const rewardAfterTriggerPlugin = defineShapePlugin({
  definition: {
    id: "reward_after_trigger",
    topology: "delayed_hook",
    rootOptionCount: { min: 2, max: 2 },
    supportedTags: ["trigger", "delayed", "reward", "promise"],
    validationRules: [
      ...commonValidationRules,
      "future_reward_has_visible_trigger",
      "future_reward_is_stored_not_applied",
    ],
    debugLabel: "Reward after trigger",
    versionContribution: versionContribution(
      "reward_after_trigger",
      "delayed_hook",
    ),
  },
  fill: rewardAfterTriggerFill,
});
