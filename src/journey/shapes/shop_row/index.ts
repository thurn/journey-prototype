import {
  JOURNEY_SHAPE_CATALOG_VERSION,
  defineShapePlugin,
} from "../shared.js";
import { shopRowFill } from "./fill.js";

export const shopRowPlugin = defineShapePlugin({
  definition: {
    id: "shop_row",
    topology: "direct_menu",
    rootOptionCount: { min: 2, max: 4 },
    supportedTags: ["shop", "cost", "essence", "reward", "menu"],
    validationRules: [
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    debugLabel: "Shop row",
    versionContribution: {
      catalogVersion: JOURNEY_SHAPE_CATALOG_VERSION,
      id: "shop_row",
      topology: "direct_menu",
    },
  },
  fill: shopRowFill,
});
