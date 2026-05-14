import { defineShapePlugin } from "../shared.js";
import { chooseYourLossFill } from "./fill.js";

export const chooseYourLossPlugin = defineShapePlugin({
  definition: {
    id: "choose_your_loss",
    topology: "direct_menu",
    rootOptionCount: { min: 3, max: 3 },
    supportedTags: [],
    validationRules: [
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    debugLabel: "Choose your loss",
    automaticLeave: false,
    versionContribution: {
      catalogVersion: "journey-shapes:v23",
      id: "choose_your_loss",
      topology: "direct_menu",
    },
  },
  fill: chooseYourLossFill,
});
