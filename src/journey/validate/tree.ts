import type { JourneyContext } from "../../quest/context.js";
import type { GeneratedObjectDefinition, JourneyManifest } from "../manifest.js";
import { validateCosts } from "./costs.js";
import { isRecord } from "./guards.js";
import { scanIllegalStructuredValue } from "./payloadScanning.js";
import { fail, type ValidationResult } from "./result.js";
import { validateOperationTargetSelectors, validateRequiredTarget } from "./targetSelectors.js";
import { validateNormalOutputText } from "./text.js";

export function validateTreeBranch(
  branch: NonNullable<JourneyManifest["tree"]>["nodes"][number]["branches"][number],
  context: JourneyContext,
  generatedObjects: readonly GeneratedObjectDefinition[] = [],
): ValidationResult {
  const textResult = validateNormalOutputText(branch.text);

  if (!textResult.ok) {
    return textResult;
  }

  const costResult = validateCosts(
    {
      number: 0,
      symbols: [],
      text: branch.text,
      operations: branch.operations,
      costs: branch.costs,
      effects: branch.effects,
      burdens: branch.burdens,
      targets: branch.targets,
      triggers: branch.triggers,
      routeEffects: branch.routeEffects,
      costConvertedEssence: branch.costConvertedEssence,
      effectConvertedEssence: branch.effectConvertedEssence,
      burdenConvertedEssence: branch.burdenConvertedEssence,
      uncertaintyConvertedEssence: branch.uncertaintyConvertedEssence,
      netConvertedEssence: branch.netConvertedEssence,
      pickBehavior: "record_and_generate_next",
    },
    context,
  );

  if (!costResult.ok) {
    return costResult;
  }

  for (const target of branch.targets) {
    if (!isRecord(target)) {
      continue;
    }

    const result = validateRequiredTarget(target, context, 0);

    if (!result.ok) {
      return result;
    }
  }

  const branchSelectorResult = validateOperationTargetSelectors(
    branch.operations,
    context,
    `Tree branch ${branch.id}`,
    generatedObjects,
  );

  if (!branchSelectorResult.ok) {
    return branchSelectorResult;
  }

  if (branch.terminal) {
    const terminalSelectorResult = validateOperationTargetSelectors(
      branch.terminal.operations,
      context,
      `Tree branch ${branch.id} terminal`,
      generatedObjects,
    );

    if (!terminalSelectorResult.ok) {
      return terminalSelectorResult;
    }
  }

  return scanIllegalStructuredValue([
    branch.costs,
    branch.effects,
    branch.burdens,
    branch.targets,
    branch.triggers,
    branch.routeEffects,
    branch.terminal,
  ]);
}

export function validateProbabilityLadder(manifest: JourneyManifest): ValidationResult {
  const rewardBranches = manifest.tree?.nodes.flatMap((node) =>
    node.branches.filter((branch) =>
      branch.kind === "random_chance" &&
      branch.effects.length > 0
    )
  ) ?? [];
  const successBranches = manifest.tree?.nodes.flatMap((node) =>
    node.branches.filter((branch) => branch.terminal?.outcome === "claim")
  ) ?? [];

  if (successBranches.length === 0) {
    return fail("probability_ladder_missing_success", "Probability ladders require visible success outcomes");
  }

  for (const branch of rewardBranches) {
    if (branch.nextNodeId || branch.terminal?.outcome !== "claim") {
      return fail("fixed_reward_can_be_won_once", "Probability ladder success must end the Journey");
    }
  }

  return { ok: true };
}

export function validateDecisionTree(
  manifest: JourneyManifest,
  context: JourneyContext,
  generatedObjects: readonly GeneratedObjectDefinition[] = [],
): ValidationResult {
  if (!manifest.tree) {
    return fail("missing_decision_tree", "True sequential shapes require complete tree data");
  }

  if (manifest.tree.nodes.length === 0) {
    return fail("missing_tree_levels", "Decision trees require at least one level");
  }

  const nodeIds = new Set(manifest.tree.nodes.map((node) => node.id));

  if (!nodeIds.has(manifest.tree.rootNodeId)) {
    return fail("invalid_tree_root", "Decision tree root must reference an existing node");
  }

  for (const node of manifest.tree.nodes) {
    const hasRandomOutcomes = node.branches.some((branch) => branch.kind === "random_chance");

    if (node.description) {
      const descriptionResult = validateNormalOutputText(node.description);

      if (!descriptionResult.ok) {
        return descriptionResult;
      }
    }

    if (node.branches.length === 0) {
      return fail("missing_tree_branches", `${node.id} must have outgoing branches`);
    }

    if (!node.branches.some((branch) => branch.terminal || branch.nextNodeId)) {
      return fail("missing_terminal_outcome", `${node.id} has no visible terminal or transition`);
    }

    for (const branch of node.branches) {
      if (!branch.text || !branch.label) {
        return fail("invalid_tree_branch", `${node.id} has an unlabeled branch`);
      }

      if (branch.kind === "random_chance" && !branch.odds) {
        return fail("missing_random_odds", `${branch.id} must expose odds`);
      }

      if (branch.nextNodeId && !nodeIds.has(branch.nextNodeId)) {
        return fail("invalid_tree_transition", `${branch.id} points to a missing node`);
      }

      if (!branch.nextNodeId && !branch.terminal && !(branch.kind === "player_choice" && branch.odds && hasRandomOutcomes)) {
        return fail("missing_terminal_outcome", `${branch.id} must end or transition`);
      }

      const result = validateTreeBranch(branch, context, generatedObjects);

      if (!result.ok) {
        return result;
      }
    }
  }

  if (
    manifest.shapeId === "push_your_luck" &&
    !manifest.tree.nodes.every((node) =>
      node.branches.some((branch) =>
        branch.kind === "random_chance" &&
        branch.terminal?.outcome === "failure" &&
        !branch.nextNodeId,
      ),
    )
  ) {
    return fail("push_failure_must_end", "Push-your-luck failures must end the Journey");
  }

  if (
    manifest.shapeId === "random_pool_draws" &&
    (manifest.rewardPool?.replacement !== "with_replacement" &&
      manifest.rewardPool?.replacement !== "without_replacement")
  ) {
    return fail("missing_pool_replacement_policy", "Random pool draws must state the replacement policy");
  }

  if (manifest.shapeId === "random_pool_draws") {
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
  }

  if (manifest.shapeId === "probability_ladder") {
    const probabilityResult = validateProbabilityLadder(manifest);

    if (!probabilityResult.ok) {
      return probabilityResult;
    }
  }

  return { ok: true };
}
