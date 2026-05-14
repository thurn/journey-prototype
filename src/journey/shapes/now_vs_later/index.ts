import { defineShapePlugin } from "../shared.js";
import { nowVsLaterFill } from "./fill.js";

export const nowVsLaterPlugin = defineShapePlugin({
  definition: {
    id: "now_vs_later",
    topology: "delayed_hook",
    rootOptionCount: { min: 2, max: 2 },
    supportedTags: [],
    validationRules: [
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    debugLabel: "Now versus later",
    versionContribution: {
      catalogVersion: "journey-shapes:v21",
      id: "now_vs_later",
      topology: "delayed_hook",
    },
  },
  fill: nowVsLaterFill,
});
