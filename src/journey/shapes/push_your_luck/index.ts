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

export const pushYourLuckPlugin = defineShapePlugin({
  definition: {
    id: "push_your_luck",
    topology: "decision_tree",
    rootOptionCount: { min: 0, max: 0 },
    supportedTags: ["sequence", "risk", "random", "reward", "stop", "tree"],
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
      "push_failure_ends_journey",
      "push_rewards_are_mechanically_connected",
    ],
    repairPreferences: [
      "make_failure_terminal",
      "align_reward_family",
      "cap_push_levels",
    ],
    debugLabel: "Push your luck",
    versionContribution: versionContribution("push_your_luck", "decision_tree"),
    menuValueChecks: {
      positiveBands: false,
      symmetricBands: false,
      escalationOrRiskExempt: true,
    },
  },
  repair: {
    actions: [
      { action: "make_failure_terminal", kind: "repair_payload_family" },
      { action: "align_reward_family", kind: "repair_payload_family" },
      { action: "cap_push_levels", kind: "repair_payload_family" },
    ],
  },
  validators: [decisionTreeValidator],
  treeValidator: (manifest) => {
    if (!manifest.tree) {
      return { ok: true };
    }

    const pushRewardKinds = new Set<string>();

    for (const [index, node] of manifest.tree.nodes.entries()) {
      const failureBranches = node.branches.filter(
        (branch) =>
          branch.kind === "random_chance" &&
          branch.terminal?.outcome === "failure" &&
          !branch.nextNodeId,
      );

      if (failureBranches.length !== 1) {
        return fail(
          "push_failure_must_end",
          "Push-your-luck failures must end the Journey",
        );
      }

      const pushBranch = node.branches.find(
        (branch) => branch.label === "Push" && branch.kind === "player_choice",
      );

      if (!pushBranch) {
        return fail(
          "push_branch_required",
          "Push-your-luck levels must expose a Push branch",
        );
      }

      const rewardKind = primaryEffectKind(pushBranch);

      if (!rewardKind) {
        return fail(
          "push_reward_required",
          "Push-your-luck pushes must expose a mechanical reward",
        );
      }

      pushRewardKinds.add(rewardKind);

      const expectedNextNodeId =
        index === manifest.tree.nodes.length - 1
          ? undefined
          : manifest.tree.nodes[index + 1]?.id;

      if (pushBranch.nextNodeId !== expectedNextNodeId) {
        return fail(
          "push_progression_must_continue",
          "Push-your-luck successes must advance through the visible level chain",
        );
      }
    }

    if (pushRewardKinds.size > 1) {
      return fail(
        "push_rewards_must_connect",
        "Push-your-luck rewards must stay mechanically connected across levels",
      );
    }

    return { ok: true };
  },
  fill: pushYourLuckFill,
});
