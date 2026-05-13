import { defineShapePlugin } from "../shared.js";
import { serviceMenuFill } from "./fill.js";

export const serviceMenuPlugin = defineShapePlugin({
  definition: {
    id: "service_menu",
    topology: "direct_menu",
    rootOptionCount: { min: 2, max: 4 },
    supportedTags: ["service", "reward", "menu"],
    payloadCompatibility: [
      {
        familyId: "adapter",
        variants: ["current"],
        legality: "legal",
        reason: "All canonical shapes can use the typed adapter payload.",
      },
      {
        familyId: "card",
        variants: ["named-card-operation-menu"],
        legality: "legal",
        reason:
          "Shape can expose card targets or card-operation menu rows.",
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
        variants: ["bane-gain-purge-transform"],
        legality: "legal",
        reason:
          "Shape can frame Bane gain, purge, and transformation decisions.",
      },
      {
        familyId: "resource",
        variants: ["resource-edge-cases"],
        legality: "legal",
        reason: "Shape can compare visible resource costs or rewards.",
      },
      {
        familyId: "route",
        variants: ["route-edits"],
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
        variants: ["dreamwell-window"],
        legality: "legal",
        reason:
          "Shape can expose bounded Dreamwell and battle-window modifiers.",
      },
      {
        familyId: "status",
        variants: ["status-reward-replacement"],
        legality: "legal",
        reason:
          "Shape can expose one-time, temporary, or delayed rule mutations.",
      },
      {
        familyId: "hook",
        variants: ["delayed-trigger-matrix"],
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
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    repairPreferences: [],
    debugLabel: "Service menu",
    versionContribution: {
      catalogVersion: "journey-shapes:v16",
      id: "service_menu",
      topology: "direct_menu",
      bypassStandardValidation: true,
    },
    menuValueChecks: {
      positiveBands: false,
      symmetricBands: false,
      escalationOrRiskExempt: false,
    },
    allowsRouteReward: true,
    allowsRouteSideEffects: true,
    bypassStandardValidation: true,
  },
  repair: {
    fallbackRank: 2,
  },
  fill: serviceMenuFill,
});
