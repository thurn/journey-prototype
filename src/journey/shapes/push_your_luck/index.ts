import { fail } from "../../validate/result.js";
import {
  decisionTreeValidator,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { pushYourLuckFill } from "./fill.js";
import type { JourneyTreeBranch } from "../../manifest.js";

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

export const pushYourLuckPlugin = defineShapePlugin({
  definition: {
    id: "push_your_luck",
    topology: "decision_tree",
    rootOptionCount: { min: 0, max: 0 },
    supportedTags: ["sequence", "chance", "cost", "reward", "stop", "tree"],
    validationRules: [
      "tree_has_complete_visible_levels",
      "push_attempts_repeat_cost_and_reward",
      "push_odds_rise_by_supported_step",
    ],
    debugLabel: "Push your luck",
    versionContribution: versionContribution("push_your_luck", "decision_tree"),
  },
  validators: [decisionTreeValidator],
  treeValidator: (manifest) => {
    if (!manifest.tree) {
      return { ok: true };
    }

    const pushRewardKinds = new Set<string>();
    const pushCostKinds = new Set<string>();
    const pushCosts = new Set<number>();
    const pushRewardValues = new Set<number>();
    const pushOdds: number[] = [];

    for (const [index, node] of manifest.tree.nodes.entries()) {
      if (
        node.branches.length !== 2 ||
        node.branches[0]?.label !== "Leave" ||
        node.branches[1]?.label !== "Attempt"
      ) {
        return fail(
          "push_visible_branches_must_repeat",
          "Push-your-luck levels must expose Leave and Attempt branches",
        );
      }

      const leaveBranch = node.branches[0];
      const pushBranch = node.branches[1];

      if (leaveBranch.terminal?.outcome !== "leave") {
        return fail(
          "push_leave_required",
          "Push-your-luck levels must allow leaving",
        );
      }

      if (pushBranch.kind !== "player_choice") {
        return fail(
          "push_attempt_required",
          "Push-your-luck levels must expose a player attempt branch",
        );
      }

      const costKind = primaryCostKind(pushBranch);
      const rewardKind = primaryEffectKind(pushBranch);

      if (!costKind || pushBranch.costConvertedEssence <= 0 || !rewardKind) {
        return fail(
          "push_attempts_must_repeat",
          "Push-your-luck attempts must expose a payable cost and mechanical reward",
        );
      }

      pushCostKinds.add(costKind);
      pushCosts.add(pushBranch.costConvertedEssence);
      pushRewardKinds.add(rewardKind);
      pushRewardValues.add(pushBranch.effectConvertedEssence);
      pushOdds.push(pushBranch.odds?.percent ?? 0);

      const expectedNextNodeId =
        index === manifest.tree.nodes.length - 1
          ? undefined
          : manifest.tree.nodes[index + 1]?.id;

      if (pushBranch.nextNodeId !== expectedNextNodeId) {
        return fail(
          "push_progression_must_continue",
          "Push-your-luck failed attempts must advance through the visible level chain",
        );
      }
    }

    if (
      pushCostKinds.size !== 1 ||
      pushCosts.size !== 1 ||
      pushRewardKinds.size !== 1 ||
      pushRewardValues.size !== 1
    ) {
      return fail(
        "push_attempts_must_repeat",
        "Push-your-luck attempts must repeat the same cost and reward",
      );
    }

    for (let index = 1; index < pushOdds.length; index += 1) {
      const step = pushOdds[index]! - pushOdds[index - 1]!;

      if (![10, 20, 25].includes(step)) {
        return fail(
          "push_odds_step_must_be_supported",
          "Push-your-luck odds must rise by a supported step",
        );
      }
    }

    return { ok: true };
  },
  fill: pushYourLuckFill,
});
