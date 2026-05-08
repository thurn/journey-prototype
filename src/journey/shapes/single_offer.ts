import { commonValidationRules, defineShapePlugin, versionContribution } from "./shared.js";

export const singleOfferPlugin = defineShapePlugin({
  definition: {
      id: "single_offer",
      topology: "single_offer_refusal",
      rootOptionCount: { min: 2, max: 2 },
      supportedTags: ["offer", "cost", "reward", "refusal", "bargain"],
      validationRules: [
        ...commonValidationRules,
        "one_take_option_and_one_refusal_option",
        "take_option_has_visible_meaningful_trade",
      ],
      repairPreferences: [
        "add_refusal_option",
        "make_trade_cost_visible",
        "rebalance_offer_value",
      ],
      debugLabel: "Single offer",
      versionContribution: versionContribution(
        "single_offer",
        "single_offer_refusal",
      ),
    },
  scoreWeight: 0.65,
  repair: { actions: [{ action: "add_refusal_option", kind: "repair_payload_family" }, { action: "make_trade_cost_visible", kind: "adjust_cost_or_burden" }, { action: "rebalance_offer_value", kind: "repair_payload_family" }] },
});
