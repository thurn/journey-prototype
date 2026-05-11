import { defineShapePlugin, versionContribution } from "../shared.js";
import { singleRuleTrialFill } from "./fill.js";
import { validators } from "./validators.js";

export const singleRuleTrialPlugin = defineShapePlugin({
  definition: {
    id: "single_rule_trial",
    topology: "single_rule_trial",
    rootOptionCount: { min: 1, max: 1 },
    supportedTags: ["status", "rule", "trial", "single"],
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
        variants: [],
        legality: "unsupported",
        reason:
          "Shape-specific status payloads own resource timing through rule-mutation metadata.",
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
        variants: ["adapter-compatible-status-rule-mutation"],
        legality: "legal",
        reason:
          "Shape applies a single rule-mutation status without offering a choice.",
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
      "single_option_applies_a_rule_status",
      "single_option_has_no_meaningful_cost_or_choice",
    ],
    repairPreferences: [
      "remove_extra_options",
      "remove_cost_or_burden",
      "promote_status_to_visible_effect",
    ],
    debugLabel: "Single rule trial",
    versionContribution: versionContribution(
      "single_rule_trial",
      "single_rule_trial",
    ),
    menuValueChecks: {
      positiveBands: false,
      symmetricBands: false,
      escalationOrRiskExempt: true,
    },
  },
  repair: {
    actions: [
      { action: "remove_extra_options", kind: "simplify_fill" },
      { action: "remove_cost_or_burden", kind: "adjust_cost_or_burden" },
      {
        action: "promote_status_to_visible_effect",
        kind: "repair_payload_family",
      },
    ],
  },
  fill: singleRuleTrialFill,
  validators,
});
