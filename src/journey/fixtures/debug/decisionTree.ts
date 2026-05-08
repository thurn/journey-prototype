import type {
  JourneyOption,
  JourneyRewardPool,
  JourneyTree,
  PrecommittedOutcomes,
  RandomPrecommittedOutcome,
} from "../../manifest.js";
import { adaptRewardPoolOperations } from "../../operationAdapters.js";
import { type JourneyShapeId } from "../../shapes.js";
import { randomVisibility } from "./random.js";

export function completeDecisionTreeRewardPool(
  tree: JourneyTree,
  existingPool: JourneyRewardPool | undefined,
): JourneyRewardPool | undefined {
  if (existingPool) {
    return existingPool;
  }

  const rewards = tree.nodes.flatMap((node) =>
    node.branches.flatMap((branch) => [
      ...branch.effects,
      ...(branch.terminal?.effects ?? []),
    ]),
  );

  if (rewards.length === 0) {
    return undefined;
  }

  const pool = {
    summary:
      "Complete decision-tree reward pool: all branch rewards are visible before choosing.",
    replacement: "without_replacement" as const,
    operations: [],
    rewards,
  };

  return {
    ...pool,
    operations: adaptRewardPoolOperations(pool),
  };
}

export function completeDecisionTreePrecommit(
  shapeId: JourneyShapeId,
  tree: JourneyTree,
): RandomPrecommittedOutcome {
  const branches = tree.nodes.flatMap((node) => node.branches);
  const stopBranchIds = branches
    .filter(
      (branch) =>
        branch.label === "Stop" ||
        branch.terminal?.outcome === "leave" ||
        branch.terminal?.outcome === "end",
    )
    .map((branch) => branch.id);
  const failureBranchIds = branches
    .filter((branch) => branch.terminal?.outcome === "failure")
    .map((branch) => branch.id);
  const rewardBranchIds = branches
    .filter(
      (branch) =>
        branch.effectConvertedEssence > 0 ||
        branch.effects.length > 0 ||
        (branch.terminal?.effects.length ?? 0) > 0,
    )
    .map((branch) => branch.id);
  const randomBranches = branches.filter((branch) => branch.odds);
  const averageExpectedValue =
    randomBranches.length > 0
      ? Math.round(
          randomBranches.reduce((total, branch) => {
            const percent = branch.odds?.percent ?? 100;

            return total + branch.netConvertedEssence * (percent / 100);
          }, 0) / randomBranches.length,
        )
      : undefined;

  return {
    kind: "complete_decision_tree",
    motif: shapeId,
    nodes: tree.nodes.map((node) => ({
      nodeId: node.id,
      levelLabel: node.levelLabel,
      branches: node.branches.map((branch) => ({
        branchId: branch.id,
        label: branch.label,
        kind: branch.kind,
        ...(branch.odds ? { odds: branch.odds } : {}),
        ...(branch.nextNodeId ? { nextNodeId: branch.nextNodeId } : {}),
        ...(branch.terminal
          ? { terminalOutcome: branch.terminal.outcome }
          : {}),
        operationCount:
          branch.operations.length + (branch.terminal?.operations.length ?? 0),
      })),
    })),
    stopBranchIds,
    failureBranchIds,
    rewardBranchIds,
    visibilityPolicy: randomVisibility(
      "visible",
      "The complete decision tree, stop options, failure terminals, odds, and reward branches are visible before choosing.",
      true,
    ),
    ...(averageExpectedValue !== undefined
      ? { expectedConvertedEssence: averageExpectedValue }
      : {}),
    riskPremiumConvertedEssence: failureBranchIds.length > 0 ? -20 : 0,
  };
}

export function withCompleteDecisionTreePayload(
  shapeId: JourneyShapeId,
  filled: {
    options: JourneyOption[];
    tree?: JourneyTree;
    rewardPool?: JourneyRewardPool;
    precommitted: PrecommittedOutcomes;
  },
): {
  options: JourneyOption[];
  tree?: JourneyTree;
  rewardPool?: JourneyRewardPool;
  precommitted: PrecommittedOutcomes;
} {
  if (!filled.tree) {
    return filled;
  }

  const treePrecommit = completeDecisionTreePrecommit(shapeId, filled.tree);

  return {
    ...filled,
    rewardPool: completeDecisionTreeRewardPool(filled.tree, filled.rewardPool),
    precommitted: {
      ...filled.precommitted,
      random: [...(filled.precommitted.random ?? []), treePrecommit],
    },
  };
}

export function recordKind(value: unknown): string | undefined {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "kind" in value &&
    typeof value.kind === "string"
    ? value.kind
    : undefined;
}

export function isResourceBandLegacyKind(kind: string | undefined): boolean {
  return (
    kind === "gain_essence" ||
    kind === "gain_omens" ||
    kind === "essence" ||
    kind === "omens" ||
    kind === "essence_loss" ||
    kind === "omen_loss" ||
    kind === "random_series"
  );
}

export function operationReceivesResourceBands(
  operation: JourneyOption["operations"][number],
): boolean {
  return (
    isResourceBandLegacyKind(operation.legacyKind) ||
    (operation.operationKind === "reward" &&
      operation.rewardKind === "resource") ||
    (operation.operationKind === "cost" &&
      (operation.resource === "essence" || operation.resource === "omens")) ||
    (operation.operationKind === "burden" &&
      operation.burdenKind === "resource_loss")
  );
}
