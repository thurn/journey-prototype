import { defineShapePlugin } from "../shared.js";
import { resolvedRandomSeriesFill } from "./fill.js";

export const resolvedRandomSeriesPlugin = defineShapePlugin({
  definition: {
    id: "resolved_random_series",
    topology: "random_commit",
    rootOptionCount: { min: 2, max: 2 },
    supportedTags: [],
    validationRules: [
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    debugLabel: "Resolved random series",
    versionContribution: {
      catalogVersion: "journey-shapes:v17",
      id: "resolved_random_series",
      topology: "random_commit",
    },
  },
  fill: resolvedRandomSeriesFill,
});
