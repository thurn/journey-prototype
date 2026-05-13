import {
  commonValidationRules,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { singleOfferFill } from "./fill.js";
import { singleOfferValidator } from "./validators.js";

export const singleOfferPlugin = defineShapePlugin({
  definition: {
    id: "single_offer",
    topology: "single_offer_refusal",
    rootOptionCount: { min: 2, max: 2 },
    supportedTags: ["offer", "cost", "reward", "refusal", "bargain"],
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
        variants: [],
        legality: "unsupported",
        reason:
          "Shape does not expose a legal Dreamsign target or shop frame.",
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
        variants: [],
        legality: "unsupported",
        reason: "Shape lacks a shop row price frame.",
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
        variants: [],
        legality: "unsupported",
        reason:
          "Shape topology has no legal manifest-local generated object host.",
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
  repair: {
    actions: [
      { action: "add_refusal_option", kind: "repair_payload_family" },
      { action: "make_trade_cost_visible", kind: "adjust_cost_or_burden" },
      { action: "rebalance_offer_value", kind: "repair_payload_family" },
    ],
  },
  validators: [singleOfferValidator],
  fill: singleOfferFill,
});
