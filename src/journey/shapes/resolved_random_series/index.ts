import { defineShapePlugin } from "../shared.js";
import { resolvedRandomSeriesFill } from "./fill.js";

export const resolvedRandomSeriesPlugin = defineShapePlugin({
  definition: {
    id: "resolved_random_series",
    topology: "random_commit",
    rootOptionCount: { min: 2, max: 2 },
    supportedTags: [],
    payloadCompatibility: [
      {
        familyId: "random",
        variants: ["reveal-roll-wager"],
        legality: "legal",
        reason:
          "Shape exposes visible, resolved shared-reward series metadata before commitment.",
      },
    ],
    validationRules: [
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    repairPreferences: [],
    debugLabel: "Resolved random series",
    versionContribution: {
      catalogVersion: "journey-shapes:v16",
      id: "resolved_random_series",
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
  fill: resolvedRandomSeriesFill,
});
