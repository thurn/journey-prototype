import {
  commonValidationRules,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { timedWindowMenuFillImpl } from "./fill.js";
import { validateTimedWindowMenu } from "./validators.js";

export const timedWindowMenuPlugin = defineShapePlugin({
  definition: {
    id: "timed_window_menu",
    topology: "direct_menu",
    rootOptionCount: { min: 2, max: 4 },
    supportedTags: ["timing", "window", "duration", "reward", "menu"],
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
        variants: ["adapter-compatible-dreamwell-window"],
        legality: "legal",
        reason:
          "Shape can expose bounded Dreamwell and battle-window modifiers.",
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
      "all_options_share_temporary_window",
      "shared_timing_is_primary_scene_identity",
      "timed_window_requires_temporary_window",
      "timed_window_resource_only_reward",
      "timed_window_low_impact",
    ],
    repairPreferences: [
      "align_option_timing_window",
      "replace_permanent_effect",
      "rebalance_timed_values",
    ],
    debugLabel: "Timed window menu",
    versionContribution: versionContribution(
      "timed_window_menu",
      "direct_menu",
    ),
    menuValueChecks: {
      positiveBands: true,
      symmetricBands: true,
      escalationOrRiskExempt: false,
    },
    allowsRouteReward: true,
  },
  scoreWeight: 0.85,
  repair: {
    actions: [
      { action: "align_option_timing_window", kind: "repair_payload_family" },
      { action: "replace_permanent_effect", kind: "repair_payload_family" },
      { action: "rebalance_timed_values", kind: "repair_payload_family" },
    ],
  },
  validators: [
    {
      ruleId: "timed_window_menu",
      passMessage:
        "Timed window menus use shared temporary windows with play-changing rewards when applicable.",
      checkedPayloads: ({ optionChecked }) => optionChecked,
      validate: ({ manifest }) => validateTimedWindowMenu(manifest),
    },
  ],
  fill: timedWindowMenuFillImpl,
});
