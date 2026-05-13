import {
  commonValidationRules,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { sharedPrefixMenuFill } from "./fill.js";

export const sharedPrefixMenuPlugin = defineShapePlugin({
  definition: {
    id: "shared_prefix_menu",
    topology: "direct_menu",
    rootOptionCount: { min: 3, max: 3 },
    supportedTags: ["burden", "cleanup", "card", "reward", "prefix", "menu"],
    validationRules: [
      ...commonValidationRules,
      "all_rows_share_visible_prefix",
      "prefix_resolves_before_varied_payoff",
      "each_option_contains_distinct_payoff_family",
    ],
    debugLabel: "Shared prefix menu",
    versionContribution: versionContribution("shared_prefix_menu", "direct_menu"),
  },
  fill: sharedPrefixMenuFill,
});
