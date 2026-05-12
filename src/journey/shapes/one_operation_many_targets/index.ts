// src/journey/shapes/one_operation_many_targets/index.ts
import { defineShapePlugin } from "../shared.js";
import { oneOperationManyTargetsFill } from "./fill.js";

export const oneOperationManyTargetsPlugin = defineShapePlugin({
  definition: {
    id: "one_operation_many_targets",
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
    debugLabel: "One operation, many targets",
    versionContribution: {
      catalogVersion: "journey-shapes:v16",
      id: "one_operation_many_targets",
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
  fill: oneOperationManyTargetsFill,
});
