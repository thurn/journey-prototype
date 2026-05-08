import { commonValidationRules, defineShapePlugin, versionContribution } from "./shared.js";

export const chooseYourLossPlugin = defineShapePlugin({
  definition: {
      id: "choose_your_loss",
      topology: "direct_menu",
      rootOptionCount: { min: 2, max: 4 },
      supportedTags: ["loss", "burden", "triage", "negative", "menu"],
      validationRules: [
        ...commonValidationRules,
        "all_options_are_negative_outcomes",
        "losses_are_comparable_damage_control_choices",
      ],
      repairPreferences: [
        "replace_positive_option_with_loss",
        "normalize_loss_severity",
        "remove_unrelated_reward_payload",
      ],
      debugLabel: "Choose your loss",
      versionContribution: versionContribution("choose_your_loss", "direct_menu"),
    },
  scoreWeight: 0.85,
  repair: { actions: [{ action: "replace_positive_option_with_loss", kind: "repair_payload_family" }, { action: "normalize_loss_severity", kind: "repair_payload_family" }, { action: "remove_unrelated_reward_payload", kind: "repair_payload_family" }] },
});
