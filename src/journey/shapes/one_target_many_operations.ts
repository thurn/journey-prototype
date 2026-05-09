import { commonValidationRules, defineShapePlugin, versionContribution } from "./shared.js";

export const oneTargetManyOperationsPlugin = defineShapePlugin({
  definition: {
      id: "one_target_many_operations",
      topology: "direct_menu",
      rootOptionCount: { min: 2, max: 4 },
      supportedTags: ["target", "operation", "card", "dreamsign", "rewrite"],
      validationRules: [
        ...commonValidationRules,
        "all_options_share_one_target",
        "operations_are_valid_for_target_class",
      ],
      repairPreferences: [
        "replace_invalid_operation_for_target",
        "choose_safer_target",
        "rebalance_operation_values",
      ],
      debugLabel: "One target, many operations",
      versionContribution: versionContribution(
        "one_target_many_operations",
        "direct_menu",
      ),
      menuValueChecks: { positiveBands: true, symmetricBands: true, escalationOrRiskExempt: false },
    },
  scoreWeight: 1.4,
  generatedObjects: { natural: true, highWeirdness: true },
  repair: { actions: [{ action: "replace_invalid_operation_for_target", kind: "repair_payload_family" }, { action: "choose_safer_target", kind: "repair_payload_family" }, { action: "rebalance_operation_values", kind: "repair_payload_family" }] },
});
