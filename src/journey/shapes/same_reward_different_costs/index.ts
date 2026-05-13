import { defineShapePlugin } from "../shared.js";
import { sameRewardDifferentCostsFill } from "./fill.js";

export const sameRewardDifferentCostsPlugin = defineShapePlugin({
  definition: {
    id: "same_reward_different_costs",
    topology: "direct_menu",
    rootOptionCount: { min: 3, max: 3 },
    supportedTags: [],
    payloadCompatibility: [],
    validationRules: [
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    repairPreferences: [],
    debugLabel: "Same reward, different costs",
    versionContribution: {
      catalogVersion: "journey-shapes:v16",
      id: "same_reward_different_costs",
      topology: "direct_menu",
      bypassStandardValidation: true,
    },
    menuValueChecks: {
      positiveBands: false,
      symmetricBands: false,
      escalationOrRiskExempt: false,
    },
    bypassStandardValidation: true,
  },
  fill: sameRewardDifferentCostsFill,
});
