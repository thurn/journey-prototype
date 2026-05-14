import { defineShapePlugin } from "../shared.js";
import { randomPoolDrawsFill } from "./fill.js";

export const randomPoolDrawsPlugin = defineShapePlugin({
  definition: {
    id: "random_pool_draws",
    topology: "decision_tree",
    rootOptionCount: { min: 0, max: 0 },
    supportedTags: [],
    validationRules: [
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    debugLabel: "Random pool draws",
    versionContribution: {
      catalogVersion: "journey-shapes:v20",
      id: "random_pool_draws",
      topology: "decision_tree",
    },
  },
  fill: randomPoolDrawsFill,
});
