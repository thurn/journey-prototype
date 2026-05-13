import { defineShapePlugin } from "../shared.js";
import { nowVsLaterFill } from "./fill.js";

export const nowVsLaterPlugin = defineShapePlugin({
  definition: {
    id: "now_vs_later",
    topology: "delayed_hook",
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
    debugLabel: "Now versus later",
    versionContribution: {
      catalogVersion: "journey-shapes:v16",
      id: "now_vs_later",
      topology: "delayed_hook",
      bypassStandardValidation: true,
    },
    menuValueChecks: {
      positiveBands: false,
      symmetricBands: false,
      escalationOrRiskExempt: false,
    },
    bypassStandardValidation: true,
  },
  fill: nowVsLaterFill,
});
