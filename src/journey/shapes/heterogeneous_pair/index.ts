import { defineShapePlugin } from "../shared.js";
import { heterogeneousPairFill } from "./fill.js";

export const heterogeneousPairPlugin = defineShapePlugin({
  definition: {
    id: "heterogeneous_pair",
    topology: "direct_menu",
    rootOptionCount: { min: 2, max: 2 },
    supportedTags: [],
    payloadCompatibility: [],
    validationRules: [
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    repairPreferences: [],
    debugLabel: "Heterogeneous pair",
    versionContribution: {
      catalogVersion: "journey-shapes:v16",
      id: "heterogeneous_pair",
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
  fill: heterogeneousPairFill,
});
