import { commonValidationRules, defineShapePlugin, versionContribution, singleWagerValidator } from "./shared.js";

export const singleWagerPlugin = defineShapePlugin({
  definition: {
      id: "single_wager",
      topology: "random_commit",
      rootOptionCount: { min: 2, max: 2 },
      supportedTags: ["wager", "random", "cost", "reward", "commit"],
      validationRules: [
        ...commonValidationRules,
        "known_stake_is_visible_before_commit",
        "reward_outcome_is_bounded_random_envelope",
      ],
      repairPreferences: [
        "make_stake_visible",
        "bound_reward_outcomes",
        "collapse_repeated_wager_steps",
      ],
      debugLabel: "Single wager",
      versionContribution: versionContribution("single_wager", "random_commit"),
      menuValueChecks: { positiveBands: false, symmetricBands: false, escalationOrRiskExempt: true },
    },
  scoreWeight: 0.75,
  repair: { actions: [{ action: "make_stake_visible", kind: "adjust_cost_or_burden" }, { action: "bound_reward_outcomes", kind: "repair_payload_family" }, { action: "collapse_repeated_wager_steps", kind: "simplify_fill" }] },
  validators: [singleWagerValidator],
});
