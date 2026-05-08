import { commonValidationRules, defineShapePlugin, versionContribution } from "./shared.js";

export const mirroredOperationsPlugin = defineShapePlugin({
  definition: {
      id: "mirrored_operations",
      topology: "direct_menu",
      rootOptionCount: { min: 2, max: 4 },
      supportedTags: ["operation", "symmetry", "target", "rewrite"],
      validationRules: [
        ...commonValidationRules,
        "operations_are_tightly_parallel",
        "operations_share_target_polarity",
      ],
      repairPreferences: [
        "restore_operation_symmetry",
        "replace_polarity_mismatch",
        "rebalance_mirrored_values",
      ],
      debugLabel: "Mirrored operations",
      versionContribution: versionContribution(
        "mirrored_operations",
        "direct_menu",
      ),
    },
  scoreWeight: 0.75,
  generatedObjects: { natural: true, highWeirdness: true },
  repair: { actions: [{ action: "restore_operation_symmetry", kind: "repair_payload_family" }, { action: "replace_polarity_mismatch", kind: "repair_payload_family" }, { action: "rebalance_mirrored_values", kind: "repair_payload_family" }] },
});
