import type { JourneyManifest } from "../../manifest.js";
import { isRecord } from "../../validate/guards.js";
import { fail, type ValidationResult } from "../../validate/result.js";
import type { ShapeValidator } from "../types.js";

function optionAppliesAStatus(
  option: JourneyManifest["options"][number],
): boolean {
  for (const entry of option.effects) {
    if (
      isRecord(entry) &&
      typeof entry.kind === "string" &&
      entry.kind.startsWith("status_") &&
      typeof entry.ruleMutationKind === "string"
    ) {
      return true;
    }
  }
  return false;
}

function validateSingleOptionAppliesARuleStatus(
  manifest: JourneyManifest,
): ValidationResult {
  const [only] = manifest.options;
  if (!only) {
    // The pipeline's root option-count rule guards the missing-option case;
    // shape-specific validators only fire when a single option is present.
    return { ok: true };
  }
  if (!optionAppliesAStatus(only)) {
    return fail(
      "single_option_applies_a_rule_status",
      "single_rule_trial option must declare a status effect with a ruleMutationKind",
    );
  }
  return { ok: true };
}

function validateSingleOptionHasNoMeaningfulCostOrChoice(
  manifest: JourneyManifest,
): ValidationResult {
  if (manifest.options.length !== 1) {
    // Root option-count rule reports the size mismatch; this validator focuses
    // on the cost-or-choice property of the single option when present.
    return { ok: true };
  }
  const [only] = manifest.options;
  if (!only) {
    return { ok: true };
  }
  if (only.costs.length > 0 || only.costConvertedEssence > 0) {
    return fail(
      "single_option_has_no_meaningful_cost_or_choice",
      "single_rule_trial option must not require a cost",
    );
  }
  if (only.burdens.length > 0) {
    return fail(
      "single_option_has_no_meaningful_cost_or_choice",
      "single_rule_trial option must not require a burden",
    );
  }
  if (only.pickBehavior === "leave") {
    return fail(
      "single_option_has_no_meaningful_cost_or_choice",
      "single_rule_trial option must not be a leave option",
    );
  }
  return { ok: true };
}

const singleOptionAppliesARuleStatus: ShapeValidator = {
  ruleId: "single_option_applies_a_rule_status",
  passMessage:
    "single_rule_trial declares one option that applies a status rule mutation.",
  checkedPayloads: ({ optionChecked }) => optionChecked,
  validate: ({ manifest }) => validateSingleOptionAppliesARuleStatus(manifest),
};

const singleOptionHasNoMeaningfulCostOrChoice: ShapeValidator = {
  ruleId: "single_option_has_no_meaningful_cost_or_choice",
  passMessage:
    "single_rule_trial option carries no meaningful cost, burden, or refusal.",
  checkedPayloads: ({ optionChecked }) => optionChecked,
  validate: ({ manifest }) =>
    validateSingleOptionHasNoMeaningfulCostOrChoice(manifest),
};

export const validators: readonly ShapeValidator[] = [
  singleOptionAppliesARuleStatus,
  singleOptionHasNoMeaningfulCostOrChoice,
];
