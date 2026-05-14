import { defineShapePlugin } from "../shared.js";
import { singleWagerFill } from "./fill.js";

export const singleWagerPlugin = defineShapePlugin({
  definition: {
    id: "single_wager",
    topology: "random_commit",
    rootOptionCount: { min: 1, max: 1 },
    supportedTags: [],
    validationRules: [
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    debugLabel: "Single wager",
    versionContribution: {
      catalogVersion: "journey-shapes:v18",
      id: "single_wager",
      topology: "random_commit",
    },
  },
  fill: singleWagerFill,
});
