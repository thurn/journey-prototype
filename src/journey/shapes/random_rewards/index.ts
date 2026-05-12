// src/journey/shapes/random_rewards/index.ts
import { defineShapePlugin } from "../shared.js";
import { randomRewardsFill } from "./fill.js";

export const randomRewardsPlugin = defineShapePlugin({
  definition: {
    id: "random_rewards",
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
    debugLabel: "Random rewards",
    versionContribution: {
      catalogVersion: "journey-shapes:v16",
      id: "random_rewards",
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
  fill: randomRewardsFill,
});
