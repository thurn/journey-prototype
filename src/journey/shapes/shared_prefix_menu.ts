import { commonValidationRules, defineShapePlugin, versionContribution } from "./shared.js";

export const sharedPrefixMenuPlugin = defineShapePlugin({
  definition: {
      id: "shared_prefix_menu",
      topology: "direct_menu",
      rootOptionCount: { min: 3, max: 3 },
      supportedTags: ["burden", "cleanup", "card", "reward", "prefix", "menu"],
      validationRules: [
        ...commonValidationRules,
        "all_rows_share_visible_prefix",
        "prefix_resolves_before_varied_payoff",
        "each_option_contains_distinct_payoff_family",
      ],
      repairPreferences: [
        "restore_shared_prefix",
        "replace_duplicate_payoff_family",
        "rebalance_prefix_payoff_values",
      ],
      debugLabel: "Shared prefix menu",
      versionContribution: versionContribution("shared_prefix_menu", "direct_menu"),
    },
  scoreWeight: 0.8,
  repair: { actions: [{ action: "restore_shared_prefix", kind: "repair_payload_family" }, { action: "replace_duplicate_payoff_family", kind: "repair_payload_family" }, { action: "rebalance_prefix_payoff_values", kind: "repair_payload_family" }] },
});
