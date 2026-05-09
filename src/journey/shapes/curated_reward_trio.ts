import { commonValidationRules, defineShapePlugin, versionContribution } from "./shared.js";

export const curatedRewardTrioPlugin = defineShapePlugin({
  definition: {
      id: "curated_reward_trio",
      topology: "direct_menu",
      rootOptionCount: { min: 3, max: 3 },
      supportedTags: ["reward", "curated", "card", "dreamsign", "early"],
      validationRules: [
        ...commonValidationRules,
        "exactly_three_positive_options",
        "options_have_clear_internal_order",
      ],
      repairPreferences: [
        "replace_nonpositive_option",
        "restore_three_option_trio",
        "tighten_reward_theme",
      ],
      debugLabel: "Curated reward trio",
      versionContribution: versionContribution(
        "curated_reward_trio",
        "direct_menu",
      ),
      menuValueChecks: { positiveBands: true, symmetricBands: true, escalationOrRiskExempt: false },
    },
  scoreWeight: 1.35,
  generatedObjects: { natural: true },
  repair: { fallbackRank: 0, actions: [{ action: "replace_nonpositive_option", kind: "repair_payload_family" }, { action: "restore_three_option_trio", kind: "repair_payload_family" }, { action: "tighten_reward_theme", kind: "repair_payload_family" }] },
});
