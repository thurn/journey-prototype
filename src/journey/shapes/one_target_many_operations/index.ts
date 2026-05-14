import { defineShapePlugin } from "../shared.js";
import { oneTargetManyOperationsFill } from "./fill.js";

export const oneTargetManyOperationsPlugin = defineShapePlugin({
  definition: {
    id: "one_target_many_operations",
    topology: "direct_menu",
    rootOptionCount: { min: 3, max: 3 },
    supportedTags: [],
    validationRules: [
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    debugLabel: "One target, many operations",
    versionContribution: {
      catalogVersion: "journey-shapes:v20",
      id: "one_target_many_operations",
      topology: "direct_menu",
    },
  },
  fill: oneTargetManyOperationsFill,
});
