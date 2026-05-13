import { hasPrecommitted } from "../../validate/precommitRules.js";
import { fail } from "../../validate/result.js";
import {
  commonValidationRules,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { pairedReturnFill, pairedReturnJourneyFill } from "./fill.js";

export { pairedReturnFill };

export const pairedReturnPlugin = defineShapePlugin({
  definition: {
    id: "paired_return",
    topology: "delayed_hook",
    rootOptionCount: { min: 2, max: 3 },
    supportedTags: ["callback", "delayed", "memory", "reward", "choice"],
    validationRules: [
      ...commonValidationRules,
      "seed_scene_creates_specific_return_hook",
      "return_metadata_references_seed_choice_or_object",
    ],
    debugLabel: "Paired return",
    versionContribution: versionContribution("paired_return", "delayed_hook"),
  },
  fill: pairedReturnJourneyFill,
  precommitValidator: (manifest) => {
    if (!hasPrecommitted(manifest.precommitted.pairedReturn)) {
      return fail(
        "missing_precommitted_outcomes",
        "Paired return shapes require precommitted return metadata",
      );
    }

    return { ok: true };
  },
});
