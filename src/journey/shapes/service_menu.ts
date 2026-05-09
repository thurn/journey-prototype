import { commonValidationRules, defineShapePlugin, versionContribution } from "./shared.js";

export const serviceMenuPlugin = defineShapePlugin({
  definition: {
      id: "service_menu",
      topology: "direct_menu",
      rootOptionCount: { min: 2, max: 4 },
      supportedTags: ["service", "reward", "target", "menu"],
      validationRules: [
        ...commonValidationRules,
        "services_share_unified_vendor_frame",
        "each_service_is_desirable_in_some_run_state",
      ],
      repairPreferences: [
        "replace_low_utility_service",
        "tighten_shared_scene_frame",
        "rebalance_service_values",
      ],
      debugLabel: "Service menu",
      versionContribution: versionContribution("service_menu", "direct_menu"),
      menuValueChecks: { positiveBands: true, symmetricBands: true, escalationOrRiskExempt: false },
      allowsRouteReward: true,
      allowsRouteSideEffects: true,
    },
  scoreWeight: 1.3,
  generatedObjects: { natural: true },
  repair: { fallbackRank: 2, actions: [{ action: "replace_low_utility_service", kind: "repair_payload_family" }, { action: "tighten_shared_scene_frame", kind: "repair_payload_family" }, { action: "rebalance_service_values", kind: "repair_payload_family" }] },
});
