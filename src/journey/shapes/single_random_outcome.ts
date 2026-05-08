import { commonValidationRules, defineShapePlugin, versionContribution } from "./shared.js";

export const singleRandomOutcomePlugin = defineShapePlugin({
  definition: {
      id: "single_random_outcome",
      topology: "random_commit",
      rootOptionCount: { min: 2, max: 2 },
      supportedTags: ["random", "reward", "commit", "omen"],
      validationRules: [
        "root_option_count_within_bounds",
        "one_bounded_random_outcome_after_entry",
        "random_table_is_visible_or_debug_precommitted",
      ],
      repairPreferences: [
        "bound_random_table",
        "collapse_extra_random_rolls",
        "precommit_random_outcome",
      ],
      debugLabel: "Single random outcome",
      versionContribution: versionContribution(
        "single_random_outcome",
        "random_commit",
      ),
    },
  scoreWeight: 0.95,
  repair: { actions: [{ action: "bound_random_table", kind: "repair_payload_family" }, { action: "collapse_extra_random_rolls", kind: "simplify_fill" }, { action: "precommit_random_outcome", kind: "repair_payload_family" }] },
});
