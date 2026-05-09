import {
  commonValidationRules,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { randomAllocationFill } from "./fill.js";

export const randomAllocationPlugin = defineShapePlugin({
  definition: {
    id: "random_allocation",
    topology: "direct_menu",
    rootOptionCount: { min: 3, max: 4 },
    supportedTags: ["reward", "cost", "burden", "eclectic", "menu"],
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
      "options_share_scene_frame_without_required_symmetry",
      "each_option_has_independent_payload",
    ],
    repairPreferences: [
      "rebalance_outlier_option_value",
      "replace_off-theme_option",
      "reduce_to_three_authored_options",
    ],
    debugLabel: "Random allocation",
    versionContribution: versionContribution("random_allocation", "direct_menu"),
    menuValueChecks: {
      positiveBands: true,
      symmetricBands: false,
      escalationOrRiskExempt: false,
    },
  },
  scoreWeight: 1.35,
  generatedObjects: { natural: true, highWeirdness: true },
  repair: {
    actions: [
      {
        action: "rebalance_outlier_option_value",
        kind: "repair_payload_family",
      },
      { action: "replace_off-theme_option", kind: "repair_payload_family" },
      { action: "reduce_to_three_authored_options", kind: "simplify_fill" },
    ],
  },
  fill: randomAllocationFill,
});
