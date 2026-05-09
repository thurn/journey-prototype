import {
  commonValidationRules,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { revealChoiceMenuFill } from "./fill.js";

export const revealChoiceMenuPlugin = defineShapePlugin({
  definition: {
    id: "reveal_choice_menu",
    topology: "random_commit",
    rootOptionCount: { min: 3, max: 3 },
    supportedTags: ["random", "reveal", "choice", "reward", "menu"],
    validationRules: [
      ...commonValidationRules,
      "visible_reward_pool_is_precommitted",
      "reveal_choice_rows_have_matching_envelopes",
      "random_reward_outcomes_are_precommitted",
    ],
    repairPreferences: [
      "restore_visible_reward_pool",
      "split_combined_reveal_modes",
      "bound_random_reward_outcomes",
    ],
    debugLabel: "Reveal choice menu",
    versionContribution: versionContribution(
      "reveal_choice_menu",
      "random_commit",
    ),
    menuValueChecks: {
      positiveBands: false,
      symmetricBands: false,
      escalationOrRiskExempt: true,
    },
  },
  scoreWeight: 0.6,
  repair: {
    actions: [
      {
        action: "restore_visible_reward_pool",
        kind: "repair_payload_family",
      },
      { action: "split_combined_reveal_modes", kind: "simplify_fill" },
      {
        action: "bound_random_reward_outcomes",
        kind: "repair_payload_family",
      },
    ],
  },
  fill: revealChoiceMenuFill,
});
