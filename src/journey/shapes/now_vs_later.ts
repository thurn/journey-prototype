import { commonValidationRules, defineShapePlugin, versionContribution } from "./shared.js";

export const nowVsLaterPlugin = defineShapePlugin({
  definition: {
      id: "now_vs_later",
      topology: "delayed_hook",
      rootOptionCount: { min: 2, max: 2 },
      supportedTags: ["timing", "delayed", "reward", "patience"],
      validationRules: [
        ...commonValidationRules,
        "one_immediate_option_and_one_delayed_option",
        "delayed_reward_is_larger_than_immediate_reward",
      ],
      repairPreferences: [
        "increase_delayed_payoff",
        "clarify_delay_timing",
        "restore_two_option_timing_choice",
      ],
      debugLabel: "Now versus later",
      versionContribution: versionContribution("now_vs_later", "delayed_hook"),
    },
  scoreWeight: 0.85,
  repair: { actions: [{ action: "increase_delayed_payoff", kind: "repair_payload_family" }, { action: "clarify_delay_timing", kind: "repair_payload_family" }, { action: "restore_two_option_timing_choice", kind: "repair_payload_family" }] },
});
