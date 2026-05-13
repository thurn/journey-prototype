import { defineShapePlugin } from "../shared.js";
import { takeAnyNumberFill } from "./fill.js";

export const takeAnyNumberPlugin = defineShapePlugin({
  definition: {
    id: "take_any_number",
    topology: "repeatable_menu",
    rootOptionCount: { min: 4, max: 4 },
    supportedTags: [],
    payloadCompatibility: [],
    validationRules: [
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    repairPreferences: [],
    debugLabel: "Take any number",
    versionContribution: {
      catalogVersion: "journey-shapes:v16",
      id: "take_any_number",
      topology: "repeatable_menu",
      bypassStandardValidation: true,
    },
    menuValueChecks: {
      positiveBands: false,
      symmetricBands: false,
      escalationOrRiskExempt: false,
    },
    bypassStandardValidation: true,
  },
  fill: takeAnyNumberFill,
});
