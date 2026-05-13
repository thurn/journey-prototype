import { defineShapePlugin } from "../shared.js";
import { alterDreamscapesFill } from "./fill.js";

export const alterDreamscapesPlugin = defineShapePlugin({
  definition: {
    id: "alter_dreamscapes",
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
    debugLabel: "Alter dreamscapes",
    versionContribution: {
      catalogVersion: "journey-shapes:v16",
      id: "alter_dreamscapes",
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
  fill: alterDreamscapesFill,
});
