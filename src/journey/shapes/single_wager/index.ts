import { defineShapePlugin } from "../shared.js";
import { singleWagerFill } from "./fill.js";

export const singleWagerPlugin = defineShapePlugin({
  definition: {
    id: "single_wager",
    topology: "random_commit",
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
    debugLabel: "Single wager",
    versionContribution: {
      catalogVersion: "journey-shapes:v16",
      id: "single_wager",
      topology: "random_commit",
      bypassStandardValidation: true,
    },
    menuValueChecks: {
      positiveBands: false,
      symmetricBands: false,
      escalationOrRiskExempt: true,
    },
    bypassStandardValidation: true,
  },
  fill: singleWagerFill,
});
