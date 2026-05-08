import { commonValidationRules, defineShapePlugin, versionContribution } from "./shared.js";

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
});
