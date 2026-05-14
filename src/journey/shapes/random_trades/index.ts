// src/journey/shapes/random_trades/index.ts
import { defineShapePlugin } from "../shared.js";
import { randomTradesFill } from "./fill.js";

export const randomTradesPlugin = defineShapePlugin({
  definition: {
    id: "random_trades",
    topology: "direct_menu",
    rootOptionCount: { min: 3, max: 3 },
    supportedTags: [],
    validationRules: [
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    debugLabel: "Random trades",
    versionContribution: {
      catalogVersion: "journey-shapes:v22",
      id: "random_trades",
      topology: "direct_menu",
    },
  },
  fill: randomTradesFill,
});
