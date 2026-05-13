import {
  commonValidationRules,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { flatEscalatingTradeFill } from "./fill.js";

export const flatEscalatingTradePlugin = defineShapePlugin({
  definition: {
    id: "flat_escalating_trade",
    topology: "direct_menu",
    rootOptionCount: { min: 3, max: 4 },
    supportedTags: [
      "cost",
      "reward",
      "resource",
      "trade",
      "escalation",
      "menu",
    ],
    validationRules: [
      ...commonValidationRules,
      "root_costs_strictly_increase",
      "root_rewards_strictly_increase",
      "menu_remains_flat_not_tree",
    ],
    repairPreferences: [
      "normalize_escalating_costs",
      "align_reward_family",
      "rebalance_escalating_values",
    ],
    debugLabel: "Flat escalating trade",
    versionContribution: versionContribution(
      "flat_escalating_trade",
      "direct_menu",
    ),
    menuValueChecks: {
      positiveBands: false,
      symmetricBands: false,
      escalationOrRiskExempt: true,
    },
  },
  repair: {
    actions: [
      { action: "normalize_escalating_costs", kind: "adjust_cost_or_burden" },
      { action: "align_reward_family", kind: "repair_payload_family" },
      { action: "rebalance_escalating_values", kind: "repair_payload_family" },
    ],
  },
  fill: flatEscalatingTradeFill,
});
