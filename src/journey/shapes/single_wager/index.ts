import {
  commonValidationRules,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import type { ShapeValidator } from "../types.js";
import { singleWagerFill } from "./fill.js";
import { validateSingleWager } from "./validators.js";

const singleWagerValidator: ShapeValidator = {
  ruleId: "single_wager_envelope",
  passMessage:
    "Single wager options expose stakes, odds, and committed roll metadata when applicable.",
  checkedPayloads: ({ checked }) => checked,
  validate: ({ manifest }) => validateSingleWager(manifest),
};

export const singleWagerPlugin = defineShapePlugin({
  definition: {
    id: "single_wager",
    topology: "random_commit",
    rootOptionCount: { min: 2, max: 2 },
    supportedTags: ["wager", "random", "cost", "reward", "commit"],
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
          "Shape-specific payloads own resource timing through sequence or commit metadata.",
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
      "known_stake_is_visible_before_commit",
      "reward_outcome_is_bounded_random_envelope",
    ],
    repairPreferences: [
      "make_stake_visible",
      "bound_reward_outcomes",
      "collapse_repeated_wager_steps",
    ],
    debugLabel: "Single wager",
    versionContribution: versionContribution("single_wager", "random_commit"),
    menuValueChecks: {
      positiveBands: false,
      symmetricBands: false,
      escalationOrRiskExempt: true,
    },
  },
  scoreWeight: 0.75,
  repair: {
    actions: [
      { action: "make_stake_visible", kind: "adjust_cost_or_burden" },
      { action: "bound_reward_outcomes", kind: "repair_payload_family" },
      { action: "collapse_repeated_wager_steps", kind: "simplify_fill" },
    ],
  },
  validators: [singleWagerValidator],
  fill: singleWagerFill,
});

// NOTE on remaining "single_wager" references outside this directory:
//  - src/journey/manifest.ts ruleId union ("single_wager_known_stake"): part of
//    the shared manifest schema's typed RandomEnvelopeConstraint surface; the
//    same union also names the risk_or_skip rule, so it is co-shape metadata,
//    not single_wager-specific code. Cleanup belongs to a schema-wide pass.
//  - src/journey/repair.ts RANDOM_FAILURE_RULES set ("single_wager_envelope"):
//    the central repair classifier categorises rule IDs into payload families
//    (random/tree/hook/...). It also lists risk_or_skip_envelope; routing rule
//    IDs to repair categories is the job of the central repair dispatcher and
//    is not appropriate plugin metadata for this migration alone.
