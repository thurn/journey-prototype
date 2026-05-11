import {
  commonValidationRules,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { shopRowFill } from "./fill.js";
import { validateNamedDreamsignShopRowCosts } from "./validators.js";

export const shopRowPlugin = defineShapePlugin({
  definition: {
    id: "shop_row",
    topology: "direct_menu",
    rootOptionCount: { min: 2, max: 4 },
    supportedTags: ["shop", "cost", "essence", "reward", "menu"],
    payloadCompatibility: [
      {
        familyId: "adapter",
        variants: ["current"],
        legality: "legal",
        reason: "All canonical shapes can use the typed adapter payload.",
      },
      {
        familyId: "card",
        variants: [],
        legality: "unsupported",
        reason: "Shape does not expose a legal card-target operation frame.",
      },
      {
        familyId: "dreamsign",
        variants: [
          "named-dreamsign-shop-row",
          "adapter-compatible-dreamsign-operations",
        ],
        legality: "legal",
        reason:
          "Shape can expose Dreamsign targets, rewards, shops, or pool edits.",
      },
      {
        familyId: "bane",
        variants: [],
        legality: "unsupported",
        reason: "Shape lacks a controlled Bane-operation or loss-choice frame.",
      },
      {
        familyId: "resource",
        variants: ["adapter-compatible-resource-operations"],
        legality: "legal",
        reason: "Shape can compare visible resource costs or rewards.",
      },
      {
        familyId: "route",
        variants: [],
        legality: "unsupported",
        reason: "Shape topology is not a route-edit scene.",
      },
      {
        familyId: "shop",
        variants: ["shop-economy"],
        legality: "legal",
        reason:
          "Shape has flat visible prices and shop-row comparison semantics.",
      },
      {
        familyId: "dreamwell",
        variants: [],
        legality: "unsupported",
        reason:
          "Shape does not provide a shared timing window for Dreamwell payloads.",
      },
      {
        familyId: "status",
        variants: [],
        legality: "unsupported",
        reason: "Shape lacks a legal status or rule-mutation frame.",
      },
      {
        familyId: "hook",
        variants: [],
        legality: "unsupported",
        reason: "Shape has no delayed hook contract surface.",
      },
      {
        familyId: "return",
        variants: [],
        legality: "unsupported",
        reason: "Shape does not create paired return anchors.",
      },
      {
        familyId: "random",
        variants: [],
        legality: "unsupported",
        reason:
          "Shape is deterministic and does not require random envelope metadata.",
      },
      {
        familyId: "generated_object",
        variants: ["adapter-compatible-generated-objects"],
        legality: "legal",
        reason:
          "Shape can host manifest-local generated object grants or transforms.",
      },
      {
        familyId: "decision_tree",
        variants: [],
        legality: "unsupported",
        reason: "Shape is not a decision-tree topology.",
      },
    ],
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
    menuValueChecks: {
      positiveBands: false,
      symmetricBands: true,
      escalationOrRiskExempt: false,
    },
  },
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
  repair: {
    actions: [
      { action: "clamp_price_to_stage_band", kind: "adjust_cost_or_burden" },
      { action: "replace_unpriced_offer", kind: "adjust_cost_or_burden" },
      { action: "rebalance_shop_row_value", kind: "repair_payload_family" },
    ],
  },
  fill: shopRowFill,
});
