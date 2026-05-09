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
    repairPreferences: [
      "add_visible_trigger",
      "store_reward_in_precommitted_delayed_metadata",
      "replace_ambiguous_timing",
    ],
    debugLabel: "Reward after trigger",
    versionContribution: versionContribution(
      "reward_after_trigger",
      "delayed_hook",
    ),
  },
  scoreWeight: 1,
  repair: {
    actions: [
      { action: "add_visible_trigger", kind: "reveal_hidden_target_or_outcome" },
      { action: "store_reward_in_precommitted_delayed_metadata", kind: "repair_payload_family" },
      { action: "replace_ambiguous_timing", kind: "repair_payload_family" },
    ],
  },
  fill: rewardAfterTriggerFill,
});
