import { isRecord } from "../../validate/guards.js";
import { fail } from "../../validate/result.js";
import {
  decisionTreeValidator,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { randomPoolDrawsFill } from "./fill.js";

export const randomPoolDrawsPlugin = defineShapePlugin({
  definition: {
    id: "random_pool_draws",
    topology: "decision_tree",
    rootOptionCount: { min: 0, max: 0 },
    supportedTags: ["sequence", "random", "pool", "reward", "tree"],
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
        variants: ["complete-decision-tree"],
        legality: "legal",
        reason: "Shape owns complete multi-level tree visibility.",
      },
    ],
    validationRules: [
      "tree_has_complete_visible_levels",
      "pool_is_visible",
      "draw_replacement_policy_is_visible",
    ],
    repairPreferences: [
      "restore_fixed_pool",
      "normalize_draw_cost",
      "cap_draw_count",
    ],
    debugLabel: "Random pool draws",
    versionContribution: versionContribution("random_pool_draws", "decision_tree"),
    menuValueChecks: {
      positiveBands: false,
      symmetricBands: false,
      escalationOrRiskExempt: true,
    },
  },
  scoreWeight: 0.6,
  repair: {
    actions: [
      { action: "restore_fixed_pool", kind: "repair_payload_family" },
      { action: "normalize_draw_cost", kind: "adjust_cost_or_burden" },
      { action: "cap_draw_count", kind: "repair_payload_family" },
    ],
  },
  validators: [decisionTreeValidator],
  treeValidator: (manifest) => {
    if (
      manifest.rewardPool?.replacement !== "with_replacement" &&
      manifest.rewardPool?.replacement !== "without_replacement"
    ) {
      return fail(
        "missing_pool_replacement_policy",
        "Random pool draws must state the replacement policy",
      );
    }

    const rewardPool = manifest.rewardPool;
    const poolEnvelope = manifest.precommitted.random?.find(
      (entry) => isRecord(entry) && entry.kind === "visible_pool",
    );
    const poolEnvelopeRecord = isRecord(poolEnvelope)
      ? (poolEnvelope as Record<string, unknown>)
      : undefined;

    if (
      !rewardPool ||
      !poolEnvelopeRecord ||
      poolEnvelopeRecord["replacement"] !== rewardPool.replacement ||
      !Array.isArray(poolEnvelopeRecord["rewards"]) ||
      poolEnvelopeRecord["rewards"].length !== rewardPool.rewards.length
    ) {
      return fail(
        "missing_pool_replacement_policy",
        "Random pool draws must mirror reward pool replacement and rewards in a typed visible-pool envelope",
      );
    }

    return { ok: true };
  },
  fill: randomPoolDrawsFill,
});
