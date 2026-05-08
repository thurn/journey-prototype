import { commonValidationRules, defineShapePlugin, versionContribution, riskOrSkipValidator } from "./shared.js";

export const riskOrSkipPlugin = defineShapePlugin({
  definition: {
      id: "risk_or_skip",
      topology: "single_offer_refusal",
      rootOptionCount: { min: 2, max: 2 },
      supportedTags: ["risk", "reward", "random", "refusal", "temptation"],
      validationRules: [
        ...commonValidationRules,
        "accept_option_has_guaranteed_reward",
        "downside_is_random_inside_visible_envelope",
        "skip_option_has_leave_behavior",
      ],
      repairPreferences: [
        "add_skip_option",
        "move_guaranteed_cost_to_single_offer",
        "bound_random_downside",
      ],
      debugLabel: "Risk or skip",
      versionContribution: versionContribution(
        "risk_or_skip",
        "single_offer_refusal",
      ),
    },
  scoreWeight: 0.75,
  repair: { actions: [{ action: "add_skip_option", kind: "repair_payload_family" }, { action: "move_guaranteed_cost_to_single_offer", kind: "switch_to_shape", targetShapeId: "single_offer" }, { action: "bound_random_downside", kind: "repair_payload_family" }] },
  validators: [riskOrSkipValidator],
});
