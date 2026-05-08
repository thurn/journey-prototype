import { commonValidationRules, defineShapePlugin, versionContribution, decisionTreeValidator } from "./shared.js";

export const pushYourLuckPlugin = defineShapePlugin({
  definition: {
      id: "push_your_luck",
      topology: "decision_tree",
      rootOptionCount: { min: 0, max: 0 },
      supportedTags: ["sequence", "risk", "random", "reward", "stop", "tree"],
      validationRules: [
        "tree_has_complete_visible_levels",
        "push_failure_ends_journey",
        "push_rewards_are_mechanically_connected",
      ],
      repairPreferences: [
        "make_failure_terminal",
        "align_reward_family",
        "cap_push_levels",
      ],
      debugLabel: "Push your luck",
      versionContribution: versionContribution("push_your_luck", "decision_tree"),
    },
  scoreWeight: 0.65,
  repair: { actions: [{ action: "make_failure_terminal", kind: "repair_payload_family" }, { action: "align_reward_family", kind: "repair_payload_family" }, { action: "cap_push_levels", kind: "repair_payload_family" }] },
  validators: [decisionTreeValidator],
});
