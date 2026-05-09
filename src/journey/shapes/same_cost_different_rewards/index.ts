import {
  commonValidationRules,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { sameCostDifferentRewardsFill } from "./fill.js";

export const sameCostDifferentRewardsPlugin = defineShapePlugin({
  definition: {
    id: "same_cost_different_rewards",
    topology: "direct_menu",
    rootOptionCount: { min: 2, max: 4 },
    supportedTags: ["cost", "reward", "bargain", "menu"],
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
      "all_options_share_visible_cost",
      "each_option_contains_real_reward",
    ],
    repairPreferences: [
      "normalize_cost_to_shared_amount",
      "replace_pure_burden_option",
      "rebalance_reward_values",
    ],
    debugLabel: "Same cost, different rewards",
    versionContribution: versionContribution(
      "same_cost_different_rewards",
      "direct_menu",
    ),
    menuValueChecks: {
      positiveBands: true,
      symmetricBands: true,
      escalationOrRiskExempt: false,
    },
    allowsRouteReward: true,
  },
  scoreWeight: 1.3,
  generatedObjects: { natural: true },
  repair: {
    actions: [
      {
        action: "normalize_cost_to_shared_amount",
        kind: "adjust_cost_or_burden",
      },
      {
        action: "replace_pure_burden_option",
        kind: "repair_payload_family",
      },
      { action: "rebalance_reward_values", kind: "repair_payload_family" },
    ],
  },
  fill: sameCostDifferentRewardsFill,
});
