import type { JourneyContext } from "../../quest/context.js";
import {
  resolveCardTargets,
  resolveDreamsignTargets,
  resolveTargetSelector,
  type CardTargetPredicate,
  type DreamsignTargetPredicate,
} from "../effects.js";
import type {
  GeneratedObjectDefinition,
  JourneyOperation,
  TargetSelector,
} from "../manifest.js";
import { isRecord } from "./guards.js";
import { fail, type ValidationResult } from "./result.js";

export function validateTargetSelector(
  selector: TargetSelector,
  context: JourneyContext,
  optionNumber: number,
  generatedObjects: readonly GeneratedObjectDefinition[] = [],
): ValidationResult {
  if (!("required" in selector) || selector.required !== true) {
    return { ok: true };
  }

  const resolution = resolveTargetSelector(context.content, context.state.quest, selector, generatedObjects);

  if (resolution.candidateCount === 0) {
    return fail(
      "zero_legal_required_targets",
      `Option ${optionNumber} has no legal ${selector.selectorKind} targets`,
      { targetResolution: resolution },
    );
  }

  return { ok: true };
}

export const DECK_REQUIRED_CARD_OPERATION_KINDS = new Set([
  "card_purge",
  "card_duplicate",
  "card_transform",
  "card_replace",
  "card_transfigure",
  "card_text_modification",
  "card_type_change",
  "card_keyword_add",
  "card_keyword_remove",
  "card_opening_hand",
  "card_merge",
  "card_split",
  "card_temporary_copy",
  "card_delayed_transformation",
  "starter_cleanup",
  "starter_replacement",
]);

export function isDeckRequiredNamedCardOperation(operation: JourneyOperation): boolean {
  if (operation.operationKind !== "reward") {
    return false;
  }

  return DECK_REQUIRED_CARD_OPERATION_KINDS.has(operation.rewardKind);
}

export function validateNamedCardOperationTarget(
  operation: JourneyOperation,
  context: JourneyContext,
  optionNumber: number,
): ValidationResult {
  if (operation.operationKind !== "reward" || !isDeckRequiredNamedCardOperation(operation) || !operation.targetSelector) {
    return { ok: true };
  }

  const selector = operation.targetSelector;

  if (selector.selectorKind !== "card") {
    return { ok: true };
  }

  const deckSelector: Extract<TargetSelector, { selectorKind: "card" }> = {
    ...selector,
    source: "deck",
    predicate: {
      ...(typeof selector.predicate === "object" && selector.predicate !== null ? selector.predicate : {}),
      source: "deck",
    },
  };
  const resolution = resolveTargetSelector(context.content, context.state.quest, deckSelector);

  if (resolution.candidateCount === 0) {
    return fail(
      "named_card_target_unavailable",
      `Option ${optionNumber} ${operation.rewardKind} requires a named card in the simulated deck`,
      { targetResolution: resolution },
    );
  }

  return { ok: true };
}

export function validateOperationTargetSelectors(
  operations: readonly JourneyOperation[] | undefined,
  context: JourneyContext,
  location: string,
  generatedObjects: readonly GeneratedObjectDefinition[] = [],
): ValidationResult {
  for (const [index, operation] of (operations ?? []).entries()) {
    if (!("targetSelector" in operation) || !operation.targetSelector) {
      continue;
    }

    const namedCardResult = validateNamedCardOperationTarget(operation, context, index + 1);

    if (!namedCardResult.ok) {
      return fail(namedCardResult.rule, `${location} operation ${index + 1}: ${namedCardResult.message}`, namedCardResult.debug);
    }

    if (
      operation.targetSelector.selectorKind === "bane" &&
      operation.targetSelector.source === "state"
    ) {
      const resolution = resolveTargetSelector(context.content, context.state.quest, operation.targetSelector);

      if (resolution.candidateCount === 0) {
        return fail(
          "bane_current_state_target_unavailable",
          `${location} operation ${index + 1}: Current-state Bane operations require tracked Banes in state`,
          { targetResolution: resolution },
        );
      }
    }

    const result = validateTargetSelector(operation.targetSelector, context, index + 1, generatedObjects);

    if (!result.ok) {
      return fail(result.rule, `${location} operation ${index + 1}: ${result.message}`, result.debug);
    }
  }

  return { ok: true };
}

export function validateRequiredTarget(
  target: Record<string, unknown>,
  context: JourneyContext,
  optionNumber: number,
): ValidationResult {
  if (target.required !== true) {
    return { ok: true };
  }

  if (target.kind === "card") {
    const matches = resolveCardTargets(
      context.content,
      context.state.quest,
      (target.predicate ?? {}) as CardTargetPredicate,
    );

    if (matches.length === 0) {
      return fail(
        "zero_legal_required_targets",
        `Option ${optionNumber} has no legal card targets`,
        {
          targetResolution: resolveTargetSelector(context.content, context.state.quest, {
            selectorKind: "card",
            selection: "predicate",
            referenceKind: "content",
            ...((target.predicate as CardTargetPredicate | undefined)?.source
              ? { source: (target.predicate as CardTargetPredicate).source }
              : {}),
            predicate: target.predicate,
            required: true,
          }),
        },
      );
    }
  }

  if (target.kind === "dreamsign") {
    const matches = resolveDreamsignTargets(
      context.content,
      context.state.quest,
      (target.predicate ?? {}) as DreamsignTargetPredicate,
    );

    if (matches.length === 0) {
      return fail(
        "zero_legal_required_targets",
        `Option ${optionNumber} has no legal Dreamsign targets`,
        {
          targetResolution: resolveTargetSelector(context.content, context.state.quest, {
            selectorKind: "dreamsign",
            selection: "predicate",
            referenceKind: "content",
            ...((target.predicate as DreamsignTargetPredicate | undefined)?.source
              ? { source: (target.predicate as DreamsignTargetPredicate).source }
              : {}),
            predicate: target.predicate,
            required: true,
          }),
        },
      );
    }
  }

  return { ok: true };
}
