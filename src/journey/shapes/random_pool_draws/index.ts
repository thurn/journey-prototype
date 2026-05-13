import { defineShapePlugin } from "../shared.js";
import { randomPoolDrawsFill } from "./fill.js";

export const randomPoolDrawsPlugin = defineShapePlugin({
  definition: {
    id: "random_pool_draws",
    topology: "decision_tree",
    rootOptionCount: { min: 0, max: 0 },
    supportedTags: [],
    payloadCompatibility: [
      {
        familyId: "decision_tree",
        variants: ["complete-decision-tree"],
        legality: "legal",
        reason: "Shape owns complete multi-level tree visibility.",
      },
    ],
    validationRules: [
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    repairPreferences: [],
    debugLabel: "Random pool draws",
    versionContribution: {
      catalogVersion: "journey-shapes:v16",
      id: "random_pool_draws",
      topology: "decision_tree",
      bypassStandardValidation: true,
    },
    menuValueChecks: {
      positiveBands: false,
      symmetricBands: false,
      escalationOrRiskExempt: true,
    },
    bypassStandardValidation: true,
  },
  fill: randomPoolDrawsFill,
});
