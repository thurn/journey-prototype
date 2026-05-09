import { LOSS_CHOICE_VALUE_CONSTANTS } from "../value.js";
import { fail, type ValidationResult } from "../validate/result.js";
import { commonValidationRules, defineShapePlugin, versionContribution } from "./shared.js";

function validateChooseYourLossValues(nets: readonly number[]): ValidationResult {
  if (nets.some((net) => net >= 0)) {
    return fail("invalid_positive_negative_framing", "choose_your_loss options must be negative outcomes");
  }

  const magnitudes = nets
    .map((net) => Math.abs(net))
    .sort((left, right) => left - right);
  const lowest = magnitudes[0] ?? 0;
  const highest = magnitudes[magnitudes.length - 1] ?? 0;

  if (lowest < LOSS_CHOICE_VALUE_CONSTANTS.minimumComparableMagnitude) {
    return fail("loss_not_comparable", "choose_your_loss options must use meaningful loss magnitudes");
  }

  if (highest / lowest > LOSS_CHOICE_VALUE_CONSTANTS.maximumComparableRatio) {
    return fail("loss_not_comparable", "choose_your_loss options must be comparable damage-control choices");
  }

  return { ok: true };
}

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
      compoundCoherence: "skip",
    },
  scoreWeight: 0.85,
  repair: { actions: [{ action: "replace_positive_option_with_loss", kind: "repair_payload_family" }, { action: "normalize_loss_severity", kind: "repair_payload_family" }, { action: "remove_unrelated_reward_payload", kind: "repair_payload_family" }] },
  optionValueValidator: (nets) => validateChooseYourLossValues(nets),
});
