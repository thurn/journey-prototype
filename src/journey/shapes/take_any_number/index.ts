import { defineShapePlugin } from "../shared.js";
import { takeAnyNumberFill } from "./fill.js";

export const takeAnyNumberPlugin = defineShapePlugin({
  definition: {
    id: "take_any_number",
    topology: "repeatable_menu",
    rootOptionCount: { min: 3, max: 3 },
    supportedTags: [],
    validationRules: [
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    debugLabel: "Take any number",
    versionContribution: {
      catalogVersion: "journey-shapes:v25",
      id: "take_any_number",
      topology: "repeatable_menu",
    },
  },
  fill: takeAnyNumberFill,
});
