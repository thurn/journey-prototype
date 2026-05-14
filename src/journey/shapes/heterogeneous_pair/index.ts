import { defineShapePlugin } from "../shared.js";
import { heterogeneousPairFill } from "./fill.js";

export const heterogeneousPairPlugin = defineShapePlugin({
  definition: {
    id: "heterogeneous_pair",
    topology: "direct_menu",
    rootOptionCount: { min: 2, max: 2 },
    supportedTags: [],
    validationRules: [
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    debugLabel: "Heterogeneous pair",
    versionContribution: {
      catalogVersion: "journey-shapes:v20",
      id: "heterogeneous_pair",
      topology: "direct_menu",
    },
  },
  fill: heterogeneousPairFill,
});
