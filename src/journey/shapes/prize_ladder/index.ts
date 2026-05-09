import {
  decisionTreeValidator,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { prizeLadderFill } from "./fill.js";

export const prizeLadderPlugin = defineShapePlugin({
  definition: {
    id: "prize_ladder",
    topology: "decision_tree",
    rootOptionCount: { min: 0, max: 0 },
    supportedTags: ["sequence", "ladder", "cost", "reward", "tree"],
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
        variants: ["complete-decision-tree"],
        legality: "legal",
        reason: "Shape owns complete multi-level tree visibility.",
      },
    ],
    validationRules: [
      "tree_has_complete_visible_levels",
      "stop_rewards_scale_coherently",
      "continue_costs_share_family",
    ],
    repairPreferences: [
      "normalize_cost_family",
      "align_stop_reward_family",
      "simplify_ladder_level_count",
    ],
    debugLabel: "Prize ladder",
    versionContribution: versionContribution("prize_ladder", "decision_tree"),
    menuValueChecks: {
      positiveBands: false,
      symmetricBands: false,
      escalationOrRiskExempt: true,
    },
  },
  scoreWeight: 0.65,
  repair: {
    actions: [
      { action: "normalize_cost_family", kind: "adjust_cost_or_burden" },
      { action: "align_stop_reward_family", kind: "repair_payload_family" },
      { action: "simplify_ladder_level_count", kind: "simplify_fill" },
    ],
  },
  validators: [decisionTreeValidator],
  fill: prizeLadderFill,
});
