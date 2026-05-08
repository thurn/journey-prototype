import { commonValidationRules, defineShapePlugin, versionContribution } from "./shared.js";

export const resolvedRandomSeriesPlugin = defineShapePlugin({
  definition: {
      id: "resolved_random_series",
      topology: "random_commit",
      rootOptionCount: { min: 2, max: 2 },
      supportedTags: ["random", "series", "reward", "commit"],
      validationRules: [
        "root_option_count_within_bounds",
        "fixed_random_series_resolves_after_one_commitment",
        "series_outcomes_are_bounded",
      ],
      repairPreferences: [
        "bound_series_length",
        "precommit_random_outcomes",
        "remove_stop_or_continue_loop",
      ],
      debugLabel: "Resolved random series",
      versionContribution: versionContribution(
        "resolved_random_series",
        "random_commit",
      ),
    },
  scoreWeight: 1.2,
  repair: { actions: [{ action: "bound_series_length", kind: "repair_payload_family" }, { action: "precommit_random_outcomes", kind: "repair_payload_family" }, { action: "remove_stop_or_continue_loop", kind: "repair_payload_family" }] },
});
