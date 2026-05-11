// NOTE: The shape ID `single_random_outcome` still appears once in
// `src/journey/fixtures/debug/metadata.ts` as part of the `random` debug
// payload family registry — that fixture catalogues which shapes exercise
// each debug variant. Migration of debug-fixture metadata is tracked as a
// follow-up across all shapes; isolating that registry is out of scope here.
import { defineShapePlugin, versionContribution } from "../shared.js";
import { singleRandomOutcomeFill } from "./fill.js";

export const singleRandomOutcomePlugin = defineShapePlugin({
  definition: {
    id: "single_random_outcome",
    topology: "random_commit",
    rootOptionCount: { min: 2, max: 2 },
    supportedTags: ["random", "reward", "commit", "omen"],
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
        variants: ["reveal-roll-wager"],
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
      "root_option_count_within_bounds",
      "one_bounded_random_outcome_after_entry",
      "random_table_is_visible_or_debug_precommitted",
    ],
    repairPreferences: [
      "bound_random_table",
      "collapse_extra_random_rolls",
      "precommit_random_outcome",
    ],
    debugLabel: "Single random outcome",
    versionContribution: versionContribution(
      "single_random_outcome",
      "random_commit",
    ),
    menuValueChecks: {
      positiveBands: true,
      symmetricBands: false,
      escalationOrRiskExempt: true,
    },
  },
  repair: {
    actions: [
      { action: "bound_random_table", kind: "repair_payload_family" },
      { action: "collapse_extra_random_rolls", kind: "simplify_fill" },
      { action: "precommit_random_outcome", kind: "repair_payload_family" },
    ],
  },
  fill: singleRandomOutcomeFill,
});
