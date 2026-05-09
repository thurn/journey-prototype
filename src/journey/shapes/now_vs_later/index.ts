import {
  commonValidationRules,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { nowVsLaterFill } from "./fill.js";

export const nowVsLaterPlugin = defineShapePlugin({
  definition: {
    id: "now_vs_later",
    topology: "delayed_hook",
    rootOptionCount: { min: 2, max: 2 },
    supportedTags: ["timing", "delayed", "reward", "patience"],
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
        variants: ["adapter-compatible-status-rules"],
        legality: "legal",
        reason:
          "Shape can expose one-time, temporary, or delayed rule mutations.",
      },
      {
        familyId: "hook",
        variants: ["adapter-compatible-delayed-hooks"],
        legality: "legal",
        reason:
          "Shape can store visible delayed hook contracts in precommitted metadata.",
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
      "one_immediate_option_and_one_delayed_option",
      "delayed_reward_is_larger_than_immediate_reward",
    ],
    repairPreferences: [
      "increase_delayed_payoff",
      "clarify_delay_timing",
      "restore_two_option_timing_choice",
    ],
    debugLabel: "Now versus later",
    versionContribution: versionContribution("now_vs_later", "delayed_hook"),
  },
  scoreWeight: 0.85,
  repair: {
    actions: [
      { action: "increase_delayed_payoff", kind: "repair_payload_family" },
      { action: "clarify_delay_timing", kind: "repair_payload_family" },
      {
        action: "restore_two_option_timing_choice",
        kind: "repair_payload_family",
      },
    ],
  },
  fill: nowVsLaterFill,
});
