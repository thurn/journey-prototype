import { defineShapePlugin } from "../shared.js";
import { singleRandomOutcomeFill } from "./fill.js";

export const singleRandomOutcomePlugin = defineShapePlugin({
  definition: {
    id: "single_random_outcome",
    topology: "random_commit",
    rootOptionCount: { min: 2, max: 2 },
    supportedTags: [],
    payloadCompatibility: [
      {
        familyId: "random",
        variants: ["reveal-roll-wager"],
        legality: "legal",
        reason:
          "Shape exposes bounded shared-reward random, reveal, and visible-pool metadata.",
      },
    ],
    validationRules: [
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    repairPreferences: [],
    debugLabel: "Single random outcome",
    versionContribution: {
      catalogVersion: "journey-shapes:v16",
      id: "single_random_outcome",
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
  fill: singleRandomOutcomeFill,
});
