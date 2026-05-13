import { defineShapePlugin, versionContribution } from "../shared.js";
import { singleRewardFill } from "./fill.js";

export const singleRewardPlugin = defineShapePlugin({
  definition: {
    id: "single_reward",
    topology: "single_reward",
    rootOptionCount: { min: 1, max: 1 },
    supportedTags: ["reward", "boon", "cleanse", "single"],
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
        reason: "Shape can grant one visible deterministic resource reward.",
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
      "root_option_count_within_bounds",
      "single_option_is_deterministic_reward",
      "option_has_no_meaningful_cost_or_refusal_tension",
    ],
    repairPreferences: [
      "remove_cost_or_burden",
      "collapse_extra_options",
      "replace_with_simple_reward",
    ],
    debugLabel: "Single reward",
    versionContribution: versionContribution("single_reward", "single_reward"),
    menuValueChecks: {
      positiveBands: true,
      symmetricBands: false,
      escalationOrRiskExempt: false,
    },
  },
  repair: {
    fallbackRank: 1,
    actions: [
      { action: "remove_cost_or_burden", kind: "adjust_cost_or_burden" },
      { action: "collapse_extra_options", kind: "simplify_fill" },
      {
        action: "replace_with_simple_reward",
        kind: "switch_to_shape",
        targetShapeId: "single_reward",
      },
    ],
  },
  fill: singleRewardFill,
});
