import { defineShapePlugin } from "../shared.js";
import { serviceMenuFill } from "./fill.js";

export const serviceMenuPlugin = defineShapePlugin({
  definition: {
    id: "service_menu",
    topology: "direct_menu",
    rootOptionCount: { min: 2, max: 4 },
    supportedTags: ["service", "reward", "menu"],
    validationRules: [
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    debugLabel: "Service menu",
    versionContribution: {
      catalogVersion: "journey-shapes:v16",
      id: "service_menu",
      topology: "direct_menu",
    },
  },
  fill: serviceMenuFill,
});
