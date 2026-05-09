import {
  commonValidationRules,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { curatedRewardTrioFill } from "./fill.js";

export const curatedRewardTrioPlugin = defineShapePlugin({
  definition: {
    id: "curated_reward_trio",
    topology: "direct_menu",
    rootOptionCount: { min: 3, max: 3 },
    supportedTags: ["reward", "curated", "card", "dreamsign", "early"],
    payloadCompatibility: [
      {
        familyId: "adapter",
        variants: ["current"],
        legality: "legal",
        reason: "All canonical shapes can use the typed adapter payload.",
      },
      {
        familyId: "card",
        variants: [
          "starter-cleanup-replacement",
          "adapter-compatible-card-operations",
        ],
        legality: "legal",
        reason:
          "Shape can expose card targets or card-operation menu rows.",
      },
      {
        familyId: "dreamsign",
        variants: [
          "dreamsign-transform-duplicate-pool",
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
        variants: [
          "generated-card",
          "generated-dreamsign",
          "generated-status",
          "generated-transfiguration",
        ],
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
      "exactly_three_positive_options",
      "options_have_clear_internal_order",
    ],
    repairPreferences: [
      "replace_nonpositive_option",
      "restore_three_option_trio",
      "tighten_reward_theme",
    ],
    debugLabel: "Curated reward trio",
    versionContribution: versionContribution(
      "curated_reward_trio",
      "direct_menu",
    ),
    menuValueChecks: {
      positiveBands: true,
      symmetricBands: true,
      escalationOrRiskExempt: false,
    },
  },
  scoreWeight: 1.35,
  generatedObjects: { natural: true },
  repair: {
    fallbackRank: 0,
    actions: [
      { action: "replace_nonpositive_option", kind: "repair_payload_family" },
      { action: "restore_three_option_trio", kind: "repair_payload_family" },
      { action: "tighten_reward_theme", kind: "repair_payload_family" },
    ],
  },
  fill: curatedRewardTrioFill,
});
