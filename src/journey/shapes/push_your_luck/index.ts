import { fail } from "../../validate/result.js";
import {
  decisionTreeValidator,
  defineShapePlugin,
  versionContribution,
} from "../shared.js";
import { pushYourLuckFill } from "./fill.js";

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
  scoreWeight: 0.65,
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

    const allHaveFailureTerminal = manifest.tree.nodes.every((node) =>
      node.branches.some(
        (branch) =>
          branch.kind === "random_chance" &&
          branch.terminal?.outcome === "failure" &&
          !branch.nextNodeId,
      ),
    );

    if (!allHaveFailureTerminal) {
      return fail(
        "push_failure_must_end",
        "Push-your-luck failures must end the Journey",
      );
    }

    return { ok: true };
  },
  fill: pushYourLuckFill,
});
