import {
  commonValidationRules,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";
import { independentRowsMenuFill } from "./fill.js";
import { validators } from "./validators.js";

function fillOrThrow(args: ShapeFillArgs): FilledJourney {
  const filled = independentRowsMenuFill(args);

  if (!filled) {
    throw new Error(
      "independent_rows_menu fill produced no result for the given draw context.",
    );
  }

  return filled;
}

export const independentRowsMenuPlugin = defineShapePlugin({
  definition: {
    id: "independent_rows_menu",
    topology: "direct_menu",
    rootOptionCount: { min: 2, max: 3 },
    supportedTags: ["menu", "heterogeneous"],
    payloadCompatibility: [
      {
        familyId: "adapter",
        variants: ["current"],
        legality: "legal",
        reason: "All canonical shapes can use the typed adapter payload.",
      },
      {
        familyId: "card",
        variants: ["adapter-compatible-card-operations"],
        legality: "legal",
        reason:
          "Each row independently selects a card target or card-operation frame.",
      },
      {
        familyId: "dreamsign",
        variants: ["adapter-compatible-dreamsign-operations"],
        legality: "legal",
        reason:
          "Each row independently selects a Dreamsign target, reward, or pool edit.",
      },
      {
        familyId: "bane",
        variants: ["adapter-compatible-bane-operations"],
        legality: "legal",
        reason:
          "Each row independently frames a Bane gain, purge, or transformation.",
      },
      {
        familyId: "resource",
        variants: ["adapter-compatible-resource-operations"],
        legality: "legal",
        reason:
          "Each row independently exposes its own visible resource cost or reward.",
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
        variants: ["adapter-compatible-generated-objects"],
        legality: "legal",
        reason:
          "Each row may independently host manifest-local generated object grants or transforms.",
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
      "each_row_draws_from_configured_pool",
      "rows_are_pairwise_distinct_on_at_least_one_axis",
    ],
    repairPreferences: ["resample_distinct_row", "swap_pool_assignment"],
    debugLabel: "Independent rows menu",
    versionContribution: versionContribution(
      "independent_rows_menu",
      "direct_menu",
    ),
    menuValueChecks: {
      positiveBands: false,
      symmetricBands: false,
      escalationOrRiskExempt: false,
    },
    compoundCoherence: "skip",
    requiresPrecommittedRandom: false,
  },
  scoreWeight: 1.0,
  repair: {
    actions: [
      { action: "resample_distinct_row", kind: "repair_payload_family" },
      { action: "swap_pool_assignment", kind: "repair_payload_family" },
    ],
  },
  fill: fillOrThrow,
  validators,
});
