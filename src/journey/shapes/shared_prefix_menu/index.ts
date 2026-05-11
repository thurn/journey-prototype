import {
  commonValidationRules,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { sharedPrefixMenuFill } from "./fill.js";

export const sharedPrefixMenuPlugin = defineShapePlugin({
  definition: {
    id: "shared_prefix_menu",
    topology: "direct_menu",
    rootOptionCount: { min: 3, max: 3 },
    supportedTags: ["burden", "cleanup", "card", "reward", "prefix", "menu"],
    payloadCompatibility: [
      {
        familyId: "adapter",
        variants: ["current"],
        legality: "legal",
        reason: "All canonical shapes can use the typed adapter payload.",
      },
      {
        familyId: "card",
        variants: ["adapter-compatible-card-operations"],
        legality: "legal",
        reason:
          "Shape can expose card targets or card-operation menu rows.",
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
        variants: ["shared-bane-prefix"],
        legality: "legal",
        reason:
          "Shape can frame Bane gain, purge, and transformation decisions.",
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
      "all_rows_share_visible_prefix",
      "prefix_resolves_before_varied_payoff",
      "each_option_contains_distinct_payoff_family",
    ],
    repairPreferences: [
      "restore_shared_prefix",
      "replace_duplicate_payoff_family",
      "rebalance_prefix_payoff_values",
    ],
    debugLabel: "Shared prefix menu",
    versionContribution: versionContribution("shared_prefix_menu", "direct_menu"),
    menuValueChecks: {
      positiveBands: false,
      symmetricBands: true,
      escalationOrRiskExempt: false,
    },
    allowsRouteReward: true,
  },
  repair: {
    actions: [
      { action: "restore_shared_prefix", kind: "repair_payload_family" },
      { action: "replace_duplicate_payoff_family", kind: "repair_payload_family" },
      { action: "rebalance_prefix_payoff_values", kind: "repair_payload_family" },
    ],
  },
  fill: sharedPrefixMenuFill,
});
