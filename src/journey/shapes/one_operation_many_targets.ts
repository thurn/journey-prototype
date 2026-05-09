import { commonValidationRules, defineShapePlugin, versionContribution } from "./shared.js";

export const oneOperationManyTargetsPlugin = defineShapePlugin({
  definition: {
      id: "one_operation_many_targets",
      topology: "direct_menu",
      rootOptionCount: { min: 2, max: 4 },
      supportedTags: ["operation", "target", "card", "dreamsign", "rewrite"],
      validationRules: [
        ...commonValidationRules,
        "all_options_share_one_operation",
        "all_targets_are_valid_for_operation",
      ],
      repairPreferences: [
        "replace_invalid_target",
        "align_operation_across_options",
        "rebalance_target_values",
      ],
      debugLabel: "One operation, many targets",
      versionContribution: versionContribution(
        "one_operation_many_targets",
        "direct_menu",
      ),
      menuValueChecks: { positiveBands: true, symmetricBands: true, escalationOrRiskExempt: false },
    },
  scoreWeight: 1.4,
  generatedObjects: { natural: true, highWeirdness: true },
  repair: { actions: [{ action: "replace_invalid_target", kind: "repair_payload_family" }, { action: "align_operation_across_options", kind: "repair_payload_family" }, { action: "rebalance_target_values", kind: "repair_payload_family" }] },
});
