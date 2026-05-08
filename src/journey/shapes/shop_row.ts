import { validateNamedDreamsignShopRowCosts } from "../validate/costs.js";
import { commonValidationRules, defineShapePlugin, versionContribution } from "./shared.js";

export const shopRowPlugin = defineShapePlugin({
  definition: {
      id: "shop_row",
      topology: "direct_menu",
      rootOptionCount: { min: 2, max: 4 },
      supportedTags: ["shop", "cost", "essence", "reward", "menu"],
      validationRules: [
        ...commonValidationRules,
        "each_option_has_flat_visible_price",
        "prices_are_nonnegative_and_affordable_for_stage",
        "same_cost_different_named_goods",
      ],
      repairPreferences: [
        "clamp_price_to_stage_band",
        "replace_unpriced_offer",
        "rebalance_shop_row_value",
      ],
      debugLabel: "Shop row",
      versionContribution: versionContribution("shop_row", "direct_menu"),
    },
  scoreWeight: 1.25,
  generatedObjects: { natural: true },
  validators: [
    {
      ruleId: "same_cost_different_named_goods",
      passMessage:
        "Named Dreamsign shop rows validate shared costs as same cost, different named goods.",
      checkedPayloads: ({ optionChecked }) => optionChecked,
      validate: ({ manifest }) => validateNamedDreamsignShopRowCosts(manifest),
    },
  ],
  repair: { actions: [{ action: "clamp_price_to_stage_band", kind: "adjust_cost_or_burden" }, { action: "replace_unpriced_offer", kind: "adjust_cost_or_burden" }, { action: "rebalance_shop_row_value", kind: "repair_payload_family" }] },
});
