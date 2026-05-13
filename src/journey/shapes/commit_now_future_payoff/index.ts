import { defineShapePlugin } from "../shared.js";
import { commitNowFuturePayoffFill } from "./fill.js";

export const commitNowFuturePayoffPlugin = defineShapePlugin({
  definition: {
    id: "commit_now_future_payoff",
    topology: "delayed_hook",
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
    debugLabel: "Commit now, future payoff",
    versionContribution: {
      catalogVersion: "journey-shapes:v16",
      id: "commit_now_future_payoff",
      topology: "delayed_hook",
      bypassStandardValidation: true,
    },
    menuValueChecks: {
      positiveBands: false,
      symmetricBands: false,
      escalationOrRiskExempt: false,
    },
    bypassStandardValidation: true,
  },
  fill: commitNowFuturePayoffFill,
});
