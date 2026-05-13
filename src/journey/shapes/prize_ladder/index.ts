import { fail } from "../../validate/result.js";
import type { JourneyTreeBranch } from "../../manifest.js";
import {
  decisionTreeValidator,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { prizeLadderFill } from "./fill.js";

function primaryEffectKind(branch: JourneyTreeBranch): string | undefined {
  const primaryEffect = branch.effects[0];

  if (
    primaryEffect &&
    typeof primaryEffect === "object" &&
    "kind" in primaryEffect &&
    typeof primaryEffect.kind === "string"
  ) {
    return primaryEffect.kind;
  }

  return undefined;
}

function primaryCostKind(branch: JourneyTreeBranch): string | undefined {
  const primaryCost = branch.costs[0];

  if (
    primaryCost &&
    typeof primaryCost === "object" &&
    "kind" in primaryCost &&
    typeof primaryCost.kind === "string"
  ) {
    return primaryCost.kind;
  }

  return undefined;
}

export const prizeLadderPlugin = defineShapePlugin({
  definition: {
    id: "prize_ladder",
    topology: "decision_tree",
    rootOptionCount: { min: 0, max: 0 },
    supportedTags: ["sequence", "ladder", "cost", "reward", "tree"],
    validationRules: [
      "tree_has_complete_visible_levels",
      "stop_rewards_scale_coherently",
      "continue_costs_share_family",
    ],
    debugLabel: "Prize ladder",
    versionContribution: versionContribution("prize_ladder", "decision_tree"),
  },
  validators: [decisionTreeValidator],
  treeValidator: (manifest) => {
    if (!manifest.tree) {
      return { ok: true };
    }

    const stopRewardKinds = new Set<string>();
    const continueCostKinds = new Set<string>();
    let previousStopValue = -Infinity;
    let previousContinueCost = -Infinity;

    if (manifest.tree.nodes.length !== 3) {
      return fail(
        "prize_ladder_level_count",
        "Prize ladders must expose exactly three bounded levels",
      );
    }

    for (const [index, node] of manifest.tree.nodes.entries()) {
      const level = index + 1;

      if (node.id !== `level-${level}`) {
        return fail(
          "prize_ladder_level_sequence",
          "Prize ladder levels must form a visible ordered chain",
        );
      }

      if (node.branches.length !== 2) {
        return fail(
          "prize_ladder_branch_count",
          "Prize ladder levels must offer exactly stop and continue choices",
        );
      }

      const stopBranch = node.branches[0];
      const continueBranch = node.branches[1];
      const isFinal = index === manifest.tree.nodes.length - 1;

      if (
        !stopBranch ||
        stopBranch.label !== "Stop" ||
        stopBranch.nextNodeId ||
        stopBranch.terminal?.outcome !== "end"
      ) {
        return fail(
          "prize_ladder_stop_terminal",
          "Prize ladder stop branches must end the Journey",
        );
      }

      const stopRewardKind = primaryEffectKind(stopBranch);

      if (!stopRewardKind) {
        return fail(
          "prize_ladder_stop_reward_required",
          "Prize ladder stop branches must expose mechanical rewards",
        );
      }

      stopRewardKinds.add(stopRewardKind);

      if (stopBranch.effectConvertedEssence < previousStopValue) {
        return fail(
          "prize_ladder_stop_rewards_must_scale",
          "Prize ladder stop rewards must scale coherently by level",
        );
      }

      previousStopValue = stopBranch.effectConvertedEssence;

      if (
        !continueBranch ||
        continueBranch.label !== (isFinal ? "Claim" : "Continue")
      ) {
        return fail(
          "prize_ladder_continue_branch_required",
          "Prize ladder levels must expose a continue or claim branch",
        );
      }

      const costKind = primaryCostKind(continueBranch);

      if (!costKind || continueBranch.costs.length !== 1) {
        return fail(
          "prize_ladder_continue_cost_required",
          "Prize ladder continue branches must expose one payable cost",
        );
      }

      continueCostKinds.add(costKind);

      if (continueBranch.costConvertedEssence <= previousContinueCost) {
        return fail(
          "prize_ladder_continue_costs_must_scale",
          "Prize ladder continue costs must scale coherently by level",
        );
      }

      previousContinueCost = continueBranch.costConvertedEssence;

      if (isFinal) {
        const claimRewardKind = primaryEffectKind(continueBranch);

        if (
          continueBranch.nextNodeId ||
          continueBranch.terminal?.outcome !== "claim" ||
          !claimRewardKind
        ) {
          return fail(
            "prize_ladder_claim_terminal",
            "Prize ladder final claim must end with a connected prize",
          );
        }

        stopRewardKinds.add(claimRewardKind);
      } else if (
        continueBranch.nextNodeId !== manifest.tree.nodes[index + 1]?.id ||
        continueBranch.terminal
      ) {
        return fail(
          "prize_ladder_continue_progression",
          "Prize ladder continue branches must advance through the visible level chain",
        );
      }
    }

    if (stopRewardKinds.size > 1) {
      return fail(
        "prize_ladder_rewards_must_connect",
        "Prize ladder rewards must stay mechanically connected across levels",
      );
    }

    if (continueCostKinds.size > 1) {
      return fail(
        "prize_ladder_costs_must_share_family",
        "Prize ladder continuation costs must stay in one cost family",
      );
    }

    return { ok: true };
  },
  fill: prizeLadderFill,
});
