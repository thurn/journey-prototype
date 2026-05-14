import { defineShapePlugin } from "../shared.js";
import { alterDreamscapesFill } from "./fill.js";

export const alterDreamscapesPlugin = defineShapePlugin({
  definition: {
    id: "alter_dreamscapes",
    topology: "direct_menu",
    rootOptionCount: { min: 3, max: 3 },
    supportedTags: [],
    validationRules: [
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    debugLabel: "Alter dreamscapes",
    versionContribution: {
      catalogVersion: "journey-shapes:v20",
      id: "alter_dreamscapes",
      topology: "direct_menu",
    },
  },
  fill: alterDreamscapesFill,
});
