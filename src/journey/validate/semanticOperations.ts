import type { JourneyManifest, JourneyOperation } from "../manifest.js";
import { isRecord } from "./guards.js";
import { fail, type ValidationResult } from "./result.js";

type CardOperationTargetMode =
  | "chosen"
  | "exact_named"
  | "random_predicate"
  | "all_matching"
  | "drafted_card";

export function operationPayloadCount(value: {
  costs?: readonly unknown[];
  effects?: readonly unknown[];
  burdens?: readonly unknown[];
  targets?: readonly unknown[];
  triggers?: readonly unknown[];
  routeEffects?: readonly unknown[];
}): number {
  return (value.costs?.length ?? 0) +
    (value.effects?.length ?? 0) +
    (value.burdens?.length ?? 0) +
    (value.targets?.length ?? 0) +
    (value.triggers?.length ?? 0) +
    (value.routeEffects?.length ?? 0);
}

export function validateOperationsShape(
  operations: readonly JourneyOperation[] | undefined,
  path: string,
  legacyPayloadCount: number,
): ValidationResult {
  if (legacyPayloadCount > 0 && (!Array.isArray(operations) || operations.length === 0)) {
    return fail("missing_semantic_operations", `${path} has legacy payload records without typed semantic operations`);
  }

  for (const [index, operation] of (operations ?? []).entries()) {
    if (!isRecord(operation) || typeof operation.operationKind !== "string" || typeof operation.role !== "string") {
      return fail("invalid_semantic_operation", `${path} operation ${index + 1} must be a typed semantic operation`);
    }
  }

  return { ok: true };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function isCardOperationTargetMode(value: string): value is CardOperationTargetMode {
  return value === "chosen" ||
    value === "exact_named" ||
    value === "random_predicate" ||
    value === "all_matching" ||
    value === "drafted_card";
}

function allowedCardTargetModes(operation: JourneyOperation): CardOperationTargetMode[] {
  const modes = isRecord(operation.payload)
    ? stringArray(operation.payload.cardOperationTargetModes)
    : [];

  return modes.filter(isCardOperationTargetMode);
}

function targetModeFromOperation(operation: JourneyOperation): CardOperationTargetMode | undefined {
  if (!operation.targetSelector || operation.targetSelector.selectorKind !== "card") {
    return undefined;
  }

  if (
    isRecord(operation.payload) &&
    typeof operation.payload.cardOperationTargetMode === "string" &&
    isCardOperationTargetMode(operation.payload.cardOperationTargetMode)
  ) {
    return operation.payload.cardOperationTargetMode;
  }

  const selector = operation.targetSelector;

  if (selector.source === "draftPool" && selector.selection === "chosen_after_commitment") {
    return "drafted_card";
  }

  if (selector.selection === "exact") {
    return "exact_named";
  }

  if (selector.selection === "hidden_random" || selector.selection === "visible_random") {
    return "random_predicate";
  }

  if (selector.selection === "predicate") {
    return "all_matching";
  }

  if (selector.selection === "chosen_after_commitment") {
    return "chosen";
  }

  return undefined;
}

function validateCardOperationTargetCompatibility(
  operations: readonly JourneyOperation[] | undefined,
  path: string,
): ValidationResult {
  for (const [index, operation] of (operations ?? []).entries()) {
    if (operation.operationKind !== "reward") {
      continue;
    }

    const allowed = allowedCardTargetModes(operation);

    if (allowed.length === 0) {
      continue;
    }

    const targetModes = [
      targetModeFromOperation(operation),
      ...(operations ?? [])
        .filter((candidate) => candidate.role === "target")
        .map(targetModeFromOperation),
    ].filter((mode): mode is CardOperationTargetMode => mode !== undefined);

    if (targetModes.length === 0) {
      return fail(
        "card_operation_target_compatibility",
        `${path} operation ${index + 1} declares card target compatibility but has no card target selector`,
      );
    }

    if (!targetModes.some((mode) => allowed.includes(mode))) {
      return fail(
        "card_operation_target_compatibility",
        `${path} operation ${index + 1} is incompatible with ${targetModes.join(", ")} card target mode`,
        {
          allowedCardOperationTargetModes: allowed,
          actualCardOperationTargetModes: targetModes,
        },
      );
    }
  }

  return { ok: true };
}

export function validateSemanticOperations(manifest: JourneyManifest): ValidationResult {
  for (const option of manifest.options) {
    const result = validateOperationsShape(
      option.operations,
      `Option ${option.number}`,
      operationPayloadCount(option),
    );

    if (!result.ok) {
      return result;
    }

    const targetCompatibilityResult = validateCardOperationTargetCompatibility(
      option.operations,
      `Option ${option.number}`,
    );

    if (!targetCompatibilityResult.ok) {
      return targetCompatibilityResult;
    }
  }

  for (const node of manifest.tree?.nodes ?? []) {
    for (const branch of node.branches) {
      const branchResult = validateOperationsShape(
        branch.operations,
        `Tree branch ${branch.id}`,
        operationPayloadCount(branch),
      );

      if (!branchResult.ok) {
        return branchResult;
      }

      const branchTargetCompatibilityResult = validateCardOperationTargetCompatibility(
        branch.operations,
        `Tree branch ${branch.id}`,
      );

      if (!branchTargetCompatibilityResult.ok) {
        return branchTargetCompatibilityResult;
      }

      if (branch.terminal) {
        const terminalResult = validateOperationsShape(
          branch.terminal.operations,
          `Tree branch ${branch.id} terminal`,
          operationPayloadCount(branch.terminal),
        );

        if (!terminalResult.ok) {
          return terminalResult;
        }

        const terminalTargetCompatibilityResult = validateCardOperationTargetCompatibility(
          branch.terminal.operations,
          `Tree branch ${branch.id} terminal`,
        );

        if (!terminalTargetCompatibilityResult.ok) {
          return terminalTargetCompatibilityResult;
        }
      }
    }
  }

  if (manifest.rewardPool) {
    const result = validateOperationsShape(
      manifest.rewardPool.operations,
      "Reward pool",
      manifest.rewardPool.rewards.length,
    );

    if (!result.ok) {
      return result;
    }

    const rewardPoolTargetCompatibilityResult = validateCardOperationTargetCompatibility(
      manifest.rewardPool.operations,
      "Reward pool",
    );

    if (!rewardPoolTargetCompatibilityResult.ok) {
      return rewardPoolTargetCompatibilityResult;
    }
  }

  const precommittedLegacyCount =
    (manifest.precommitted.random?.length ?? 0) +
    (manifest.precommitted.delayed?.length ?? 0) +
    (manifest.precommitted.pairedReturn?.length ?? 0) +
    (manifest.precommitted.routeEdits?.length ?? 0);
  const precommittedResult = validateOperationsShape(
    manifest.precommitted.operations,
    "Precommitted outcomes",
    precommittedLegacyCount,
  );

  if (!precommittedResult.ok) {
    return precommittedResult;
  }

  const precommittedTargetCompatibilityResult = validateCardOperationTargetCompatibility(
    manifest.precommitted.operations,
    "Precommitted outcomes",
  );

  if (!precommittedTargetCompatibilityResult.ok) {
    return precommittedTargetCompatibilityResult;
  }

  return { ok: true };
}
