import {
  commonValidationRules,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { alterDreamscapesFill } from "./fill.js";

export const alterDreamscapesPlugin = defineShapePlugin({
  definition: {
    id: "alter_dreamscapes",
    topology: "route_edit",
    rootOptionCount: { min: 2, max: 3 },
    supportedTags: ["route", "dreamscape", "timing", "structural"],
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
        variants: ["adapter-compatible-route-edits"],
        legality: "legal",
        reason: "Shape can expose route edits without mutating state.",
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
      "route_edits_are_described_without_mutating_state",
      "future_route_edits_have_explicit_timing",
    ],
    repairPreferences: [
      "prefer_current_dreamscape_edit",
      "make_future_site_visible_or_committed",
      "store_route_edit_metadata",
    ],
    debugLabel: "Alter dreamscapes",
    versionContribution: versionContribution("alter_dreamscapes", "route_edit"),
    allowsRouteReward: true,
    allowsRouteSideEffects: true,
    compoundAllowsRouteOnlyReward: true,
  },
  repair: {
    actions: [
      {
        action: "prefer_current_dreamscape_edit",
        kind: "repair_payload_family",
      },
      {
        action: "make_future_site_visible_or_committed",
        kind: "reveal_hidden_target_or_outcome",
      },
      { action: "store_route_edit_metadata", kind: "repair_payload_family" },
    ],
  },
  fill: alterDreamscapesFill,
});
