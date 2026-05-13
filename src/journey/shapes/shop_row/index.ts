import {
  JOURNEY_SHAPE_CATALOG_VERSION,
  defineShapePlugin,
} from "../shared.js";
import { shopRowFill } from "./fill.js";

export const shopRowPlugin = defineShapePlugin({
  definition: {
    id: "shop_row",
    topology: "direct_menu",
    rootOptionCount: { min: 2, max: 4 },
    supportedTags: ["shop", "cost", "essence", "reward", "menu"],
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
        variants: [
          "named-dreamsign-shop-row",
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
        variants: ["shop-economy"],
        legality: "legal",
        reason:
          "Shape has flat visible prices and shop-row comparison semantics.",
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
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ],
    repairPreferences: [],
    debugLabel: "Shop row",
    versionContribution: {
      catalogVersion: JOURNEY_SHAPE_CATALOG_VERSION,
      id: "shop_row",
      topology: "direct_menu",
      bypassStandardValidation: true,
    },
    menuValueChecks: {
      positiveBands: false,
      symmetricBands: false,
      escalationOrRiskExempt: false,
    },
    bypassStandardValidation: true,
  },
  fill: shopRowFill,
});
