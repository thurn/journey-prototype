import { LOSS_CHOICE_VALUE_CONSTANTS } from "../../value.js";
import { fail, type ValidationResult } from "../../validate/result.js";

export function validateChooseYourLossValues(
  nets: readonly number[],
): ValidationResult {
  if (nets.some((net) => net >= 0)) {
    return fail(
      "invalid_positive_negative_framing",
      "choose_your_loss options must be negative outcomes",
    );
  }

  const magnitudes = nets
    .map((net) => Math.abs(net))
    .sort((left, right) => left - right);
  const lowest = magnitudes[0] ?? 0;
  const highest = magnitudes[magnitudes.length - 1] ?? 0;

  if (lowest < LOSS_CHOICE_VALUE_CONSTANTS.minimumComparableMagnitude) {
    return fail(
      "loss_not_comparable",
      "choose_your_loss options must use meaningful loss magnitudes",
    );
  }

  if (highest / lowest > LOSS_CHOICE_VALUE_CONSTANTS.maximumComparableRatio) {
    return fail(
      "loss_not_comparable",
      "choose_your_loss options must be comparable damage-control choices",
    );
  }

  return { ok: true };
}
