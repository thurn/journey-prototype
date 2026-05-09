import { commonValidationRules, defineShapePlugin, versionContribution, timedWindowMenuValidator } from "./shared.js";

export const timedWindowMenuPlugin = defineShapePlugin({
  definition: {
      id: "timed_window_menu",
      topology: "direct_menu",
      rootOptionCount: { min: 2, max: 4 },
      supportedTags: ["timing", "window", "duration", "reward", "menu"],
      validationRules: [
        ...commonValidationRules,
        "all_options_share_temporary_window",
        "shared_timing_is_primary_scene_identity",
        "timed_window_requires_temporary_window",
        "timed_window_resource_only_reward",
        "timed_window_low_impact",
      ],
      repairPreferences: [
        "align_option_timing_window",
        "replace_permanent_effect",
        "rebalance_timed_values",
      ],
      debugLabel: "Timed window menu",
      versionContribution: versionContribution(
        "timed_window_menu",
        "direct_menu",
      ),
      menuValueChecks: { positiveBands: true, symmetricBands: true, escalationOrRiskExempt: false },
      allowsRouteReward: true,
    },
  scoreWeight: 0.85,
  repair: { actions: [{ action: "align_option_timing_window", kind: "repair_payload_family" }, { action: "replace_permanent_effect", kind: "repair_payload_family" }, { action: "rebalance_timed_values", kind: "repair_payload_family" }] },
  validators: [timedWindowMenuValidator],
});
