import {
  commonValidationRules,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { riskOrSkipFill } from "./fill.js";
import { riskOrSkipValidator } from "./validators.js";

// Acceptable shape-ID leaks outside this directory:
// - test/journey-shapes.test.ts: registry order assertions and the
//   `risk_or_skip_envelope` validator-id smoke check (test-only).
// - test/journey-generation.test.ts: end-to-end shape behavior tests that
//   call `fillForShape("risk_or_skip", ...)` and assert on the
//   `risk_or_skip_bounded_downside` shape_invariant in produced manifests.
//   These tests target this shape by design; their references are not
//   centralized logic.

export const riskOrSkipPlugin = defineShapePlugin({
  definition: {
    id: "risk_or_skip",
    topology: "single_offer_refusal",
    rootOptionCount: { min: 2, max: 2 },
    supportedTags: ["risk", "reward", "random", "refusal", "temptation"],
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
        variants: ["adapter-compatible-random-envelope"],
        legality: "legal",
        reason:
          "Shape exposes bounded random, reveal, odds, or wager metadata.",
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
      "accept_option_has_guaranteed_reward",
      "downside_is_random_inside_visible_envelope",
      "skip_option_has_leave_behavior",
    ],
    repairPreferences: [
      "add_skip_option",
      "move_guaranteed_cost_to_single_offer",
      "bound_random_downside",
    ],
    debugLabel: "Risk or skip",
    versionContribution: versionContribution(
      "risk_or_skip",
      "single_offer_refusal",
    ),
    menuValueChecks: {
      positiveBands: false,
      symmetricBands: false,
      escalationOrRiskExempt: true,
    },
    requiresPrecommittedRandom: true,
  },
  repair: {
    actions: [
      { action: "add_skip_option", kind: "repair_payload_family" },
      {
        action: "move_guaranteed_cost_to_single_offer",
        kind: "switch_to_shape",
        targetShapeId: "single_offer",
      },
      { action: "bound_random_downside", kind: "repair_payload_family" },
    ],
  },
  validators: [riskOrSkipValidator],
  fill: riskOrSkipFill,
});
