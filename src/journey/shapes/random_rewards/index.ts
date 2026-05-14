// src/journey/shapes/random_rewards/index.ts
import { defineShapePlugin } from "../shared.js";
import { randomRewardsFill } from "./fill.js";

export const randomRewardsPlugin = defineShapePlugin({
  definition: {
    id: "random_rewards",
    topology: "direct_menu",
    rootOptionCount: { min: 3, max: 3 },
    supportedTags: [],
    validationRules: [
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    debugLabel: "Random rewards",
    versionContribution: {
      catalogVersion: "journey-shapes:v21",
      id: "random_rewards",
      topology: "direct_menu",
    },
  },
  fill: randomRewardsFill,
});
