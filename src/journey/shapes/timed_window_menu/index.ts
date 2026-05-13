import { defineShapePlugin } from "../shared.js";
import { timedWindowMenuFillImpl } from "./fill.js";

export const timedWindowMenuPlugin = defineShapePlugin({
  definition: {
    id: "timed_window_menu",
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
    debugLabel: "Timed window menu",
    versionContribution: {
      catalogVersion: "journey-shapes:v16",
      id: "timed_window_menu",
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
  fill: timedWindowMenuFillImpl,
});
