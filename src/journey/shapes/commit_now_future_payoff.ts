import { fail, type ValidationResult } from "../validate/result.js";
import { commonValidationRules, defineShapePlugin, versionContribution } from "./shared.js";

function validateCommitNowFuturePayoffValues(nets: readonly number[]): ValidationResult {
  if (nets.length !== 3 || nets.some((net) => net <= 0)) {
    return fail(
      "option_values_are_comparable_for_shape",
      "commit_now_future_payoff options must all be positive commitments",
    );
  }

  const lowest = Math.min(...nets);
  const highest = Math.max(...nets);

  if (highest - lowest > 75) {
    return fail(
      "option_values_are_comparable_for_shape",
      "commit_now_future_payoff options must be comparable future-payoff choices",
    );
  }

  return { ok: true };
}

export const commitNowFuturePayoffPlugin = defineShapePlugin({
  definition: {
      id: "commit_now_future_payoff",
      topology: "delayed_hook",
      rootOptionCount: { min: 3, max: 3 },
      supportedTags: ["commitment", "delayed", "reward", "future"],
      validationRules: [
        ...commonValidationRules,
        "commitment_is_visible_immediately",
        "future_payoff_is_significant_and_precommitted",
      ],
      repairPreferences: [
        "clarify_commitment_terms",
        "increase_future_payoff",
        "store_future_payoff_metadata",
      ],
      debugLabel: "Commit now, future payoff",
      versionContribution: versionContribution(
        "commit_now_future_payoff",
        "delayed_hook",
      ),
    },
  scoreWeight: 1.2,
  repair: { actions: [{ action: "clarify_commitment_terms", kind: "repair_payload_family" }, { action: "increase_future_payoff", kind: "repair_payload_family" }, { action: "store_future_payoff_metadata", kind: "repair_payload_family" }] },
  optionValueValidator: (nets) => validateCommitNowFuturePayoffValues(nets),
});
