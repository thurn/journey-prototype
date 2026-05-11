// src/journey/shapes/random_trades/index.ts
import { defineShapePlugin } from "../shared.js";
import { randomTradesFill } from "./fill.js";

export const randomTradesPlugin = defineShapePlugin({
  definition: {
    id: "random_trades",
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
    debugLabel: "Random trades",
    versionContribution: {
      catalogVersion: "journey-shapes:v15",
      id: "random_trades",
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
  fill: randomTradesFill,
});
