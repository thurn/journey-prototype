// src/journey/shapes/mirrored_operations/index.ts
import { defineShapePlugin } from "../shared.js";
import { mirroredOperationsFill } from "./fill.js";

export const mirroredOperationsPlugin = defineShapePlugin({
  definition: {
    id: "mirrored_operations",
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
    debugLabel: "Mirrored operations",
    versionContribution: {
      catalogVersion: "journey-shapes:v15",
      id: "mirrored_operations",
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
  fill: mirroredOperationsFill,
});
