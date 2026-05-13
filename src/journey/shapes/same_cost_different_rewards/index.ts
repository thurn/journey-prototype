import { defineShapePlugin } from "../shared.js";
import { sameCostDifferentRewardsFill } from "./fill.js";

export const sameCostDifferentRewardsPlugin = defineShapePlugin({
  definition: {
    id: "same_cost_different_rewards",
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
    debugLabel: "Same cost, different rewards",
    versionContribution: {
      catalogVersion: "journey-shapes:v16",
      id: "same_cost_different_rewards",
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
  fill: sameCostDifferentRewardsFill,
});
