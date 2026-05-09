import { isRecord } from "../validate/guards.js";
import { fail } from "../validate/result.js";
import { commonValidationRules, defineShapePlugin, versionContribution, decisionTreeValidator } from "./shared.js";

export const randomPoolDrawsPlugin = defineShapePlugin({
  definition: {
      id: "random_pool_draws",
      topology: "decision_tree",
      rootOptionCount: { min: 0, max: 0 },
      supportedTags: ["sequence", "random", "pool", "reward", "tree"],
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
      menuValueChecks: { positiveBands: false, symmetricBands: false, escalationOrRiskExempt: true },
    },
  scoreWeight: 0.6,
  repair: { actions: [{ action: "restore_fixed_pool", kind: "repair_payload_family" }, { action: "normalize_draw_cost", kind: "adjust_cost_or_burden" }, { action: "cap_draw_count", kind: "repair_payload_family" }] },
  validators: [decisionTreeValidator],
  treeValidator: (manifest) => {
    if (
      manifest.rewardPool?.replacement !== "with_replacement" &&
      manifest.rewardPool?.replacement !== "without_replacement"
    ) {
      return fail("missing_pool_replacement_policy", "Random pool draws must state the replacement policy");
    }

    const rewardPool = manifest.rewardPool;
    const poolEnvelope = manifest.precommitted.random?.find((entry) =>
      isRecord(entry) && entry.kind === "visible_pool"
    );
    const poolEnvelopeRecord = isRecord(poolEnvelope) ? poolEnvelope as Record<string, unknown> : undefined;

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
});
