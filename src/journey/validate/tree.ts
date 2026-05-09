import type { JourneyContext } from "../../quest/context.js";
import type { GeneratedObjectDefinition, JourneyManifest } from "../manifest.js";
import { getShapePlugin } from "../shapes.js";
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

  const treeValidator = getShapePlugin(manifest.shapeId).treeValidator;

  if (treeValidator) {
    const result = treeValidator(manifest, context, generatedObjects);

    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}
