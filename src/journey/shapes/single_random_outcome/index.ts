import { defineShapePlugin } from "../shared.js";
import { singleRandomOutcomeFill } from "./fill.js";

export const singleRandomOutcomePlugin = defineShapePlugin({
  definition: {
    id: "single_random_outcome",
    topology: "random_commit",
    rootOptionCount: { min: 2, max: 2 },
    supportedTags: [],
    validationRules: [
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    debugLabel: "Single random outcome",
    versionContribution: {
      catalogVersion: "journey-shapes:v16",
      id: "single_random_outcome",
      topology: "random_commit",
    },
  },
  fill: singleRandomOutcomeFill,
});
