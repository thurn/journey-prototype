import type { JourneyContext } from "../../quest/context.js";
import {
  resolveCardTargets,
  resolveDreamsignTargets,
  resolveTargetSelector,
  type CardTargetPredicate,
} from "../effects.js";
import type { GeneratedObjectDefinition, JourneyOption } from "../manifest.js";
import { validateCosts } from "./costs.js";
import { dreamsignPredicateFromPayload, validateDreamsignPayload } from "./dreamsignPayloads.js";
import { isRecord } from "./guards.js";
import { isBaneCurrentStateRequirement, scanIllegalStructuredValue } from "./payloadScanning.js";
import { fail, type ValidationResult } from "./result.js";
import {
  validateNamedCardOperationTarget,
  validateRequiredTarget,
  validateTargetSelector,
} from "./targetSelectors.js";
import { validateNormalOutputText } from "./text.js";

function validateCardPayload(
  payload: Record<string, unknown>,
  context: JourneyContext,
  optionNumber: number,
): ValidationResult {
  if (payload.kind === "card_draft") {
    const takeCount = typeof payload.takeCount === "number" ? payload.takeCount : 1;
    const choiceCount = typeof payload.choiceCount === "number" ? payload.choiceCount : 0;
    const copyCount = typeof payload.copyCount === "number" ? payload.copyCount : 1;
    const predicate = (payload.predicate ?? {}) as CardTargetPredicate;
    const matches = resolveCardTargets(context.content, context.state.quest, predicate);

    if (takeCount < 1 || choiceCount < 1 || copyCount < 1) {
      return fail(
        "invalid_card_draft_counts",
        `Option ${optionNumber} card draft requires positive take, choice, and copy counts`,
      );
    }

    if (takeCount > choiceCount) {
      return fail(
        "invalid_card_draft_counts",
        `Option ${optionNumber} card draft cannot take more cards than it shows`,
      );
    }

    if (matches.length < choiceCount) {
      return fail(
        "card_draft_predicate_pool_too_small",
        `Option ${optionNumber} card draft requires ${choiceCount} eligible cards but only ${matches.length} match`,
        {
          targetResolution: resolveTargetSelector(context.content, context.state.quest, {
            selectorKind: "card",
            selection: "predicate",
            referenceKind: "content",
            ...(predicate.source ? { source: predicate.source } : {}),
            predicate,
            required: true,
          }),
        },
      );
    }
  }

  if (payload.kind === "card_gain" && payload.selection === "hidden_random") {
    const count = typeof payload.count === "number" ? payload.count : 1;
    const copyCount = typeof payload.copyCount === "number" ? payload.copyCount : 1;
    const predicate = (payload.predicate ?? {}) as CardTargetPredicate;
    const matches = resolveCardTargets(context.content, context.state.quest, predicate);

    if (count < 1 || copyCount < 1) {
      return fail(
        "invalid_random_card_gain_counts",
        `Option ${optionNumber} random card gain requires positive card and copy counts`,
      );
    }

    if (matches.length < count) {
      return fail(
        "random_card_gain_pool_too_small",
        `Option ${optionNumber} random card gain requires ${count} eligible cards but only ${matches.length} match`,
        {
          targetResolution: resolveTargetSelector(context.content, context.state.quest, {
            selectorKind: "card",
            selection: "hidden_random",
            referenceKind: "content",
            ...(predicate.source ? { source: predicate.source } : {}),
            predicate,
            required: true,
          }),
        },
      );
    }
  }

  return { ok: true };
}

function starterPredicateFromPayload(payload: Record<string, unknown>): CardTargetPredicate {
  return {
    source: "deck",
    starter: true,
    ...(isRecord(payload.predicate) ? payload.predicate : {}),
  } as CardTargetPredicate;
}

function minimumStarterTargets(payload: Record<string, unknown>): number {
  if (typeof payload.minRequiredTargets === "number") {
    return payload.minRequiredTargets;
  }

  if (payload.cleanupMode === "chosen_up_to") {
    return 1;
  }

  if (typeof payload.targetCount === "number") {
    return payload.targetCount;
  }

  if (typeof payload.count === "number") {
    return payload.count;
  }

  return 1;
}

function validateStarterPayload(
  payload: Record<string, unknown>,
  context: JourneyContext,
  optionNumber: number,
): ValidationResult {
  const isStarterPayload =
    payload.kind === "starter_cleanup" ||
    payload.kind === "starter_replacement" ||
    payload.starterTarget === true ||
    payload.transfigurationScope === "random_starters" ||
    payload.transfigurationScope === "two_chosen_starters" ||
    payload.transfigurationScope === "all_starters";

  if (!isStarterPayload) {
    return { ok: true };
  }

  const predicate = starterPredicateFromPayload(payload);
  const matches = resolveCardTargets(context.content, context.state.quest, predicate);
  const minimumTargets = minimumStarterTargets(payload);
  const targetResolution = resolveTargetSelector(context.content, context.state.quest, {
    selectorKind: "card",
    selection: payload.selection === "hidden_random"
      ? "hidden_random"
      : payload.selection === "predicate" ||
          payload.cleanupMode === "all" ||
          payload.replacementMode === "all"
        ? "predicate"
        : "chosen_after_commitment",
    referenceKind: "content",
    source: "deck",
    predicate,
    required: true,
  });

  if (matches.length < minimumTargets) {
    return fail(
      "starter_target_pool_too_small",
      `Option ${optionNumber} requires ${minimumTargets} Starter cards but only ${matches.length} are available`,
      { targetResolution },
    );
  }

  if (payload.kind === "starter_replacement" && payload.replacementMode === "draft") {
    const choiceCount = typeof payload.choiceCount === "number" ? payload.choiceCount : 0;
    const resultPredicate = {
      source: "draftPool",
      ...(isRecord(payload.resultPredicate) ? payload.resultPredicate : {}),
    } as CardTargetPredicate;
    const resultMatches = resolveCardTargets(
      context.content,
      context.state.quest,
      resultPredicate,
    );

    if (choiceCount < 1 || resultMatches.length < choiceCount) {
      return fail(
        "starter_replacement_pool_too_small",
        `Option ${optionNumber} starter draft replacement requires ${choiceCount} eligible cards but only ${resultMatches.length} match`,
        {
          targetResolution: resolveTargetSelector(context.content, context.state.quest, {
            selectorKind: "card",
            selection: "predicate",
            referenceKind: "content",
            source: "draftPool",
            predicate: resultPredicate,
            required: true,
          }),
        },
      );
    }
  }

  if (payload.kind === "starter_replacement" && payload.replacementMode === "all") {
    const resultPredicate = {
      source: "catalog",
      ...(isRecord(payload.resultPredicate) ? payload.resultPredicate : {}),
    } as CardTargetPredicate;
    const resultMatches = resolveCardTargets(
      context.content,
      context.state.quest,
      resultPredicate,
    );

    if (resultMatches.length < matches.length) {
      return fail(
        "starter_replacement_pool_too_small",
        `Option ${optionNumber} all-starter replacement requires ${matches.length} eligible replacement cards but only ${resultMatches.length} match`,
        {
          targetResolution: resolveTargetSelector(context.content, context.state.quest, {
            selectorKind: "card",
            selection: "predicate",
            referenceKind: "content",
            source: "catalog",
            predicate: resultPredicate,
            required: true,
          }),
        },
      );
    }
  }

  if (payload.kind === "starter_replacement" && payload.replacementMode === "random") {
    const resultPredicate = {
      source: "catalog",
      ...(isRecord(payload.resultPredicate) ? payload.resultPredicate : {}),
    } as CardTargetPredicate;
    const resultMatches = resolveCardTargets(
      context.content,
      context.state.quest,
      resultPredicate,
    );

    if (resultMatches.length === 0) {
      return fail(
        "starter_replacement_pool_too_small",
        `Option ${optionNumber} random starter replacement requires at least 1 eligible replacement card`,
        {
          targetResolution: resolveTargetSelector(context.content, context.state.quest, {
            selectorKind: "card",
            selection: "hidden_random",
            referenceKind: "content",
            source: "catalog",
            predicate: resultPredicate,
            required: true,
          }),
        },
      );
    }
  }

  return { ok: true };
}

export function validateOption(
  option: JourneyOption,
  context: JourneyContext,
  generatedObjects: readonly GeneratedObjectDefinition[] = [],
): ValidationResult {
  const textResult = validateNormalOutputText(option.text);

  if (!textResult.ok) {
    return textResult;
  }

  const costResult = validateCosts(option, context);

  if (!costResult.ok) {
    return costResult;
  }

  for (const target of option.targets) {
    if (!isRecord(target)) {
      continue;
    }

    const result = validateRequiredTarget(target, context, option.number);

    if (!result.ok) {
      return result;
    }
  }

  for (const operation of option.operations) {
    if (!("targetSelector" in operation) || !operation.targetSelector) {
      continue;
    }

    const namedCardResult = validateNamedCardOperationTarget(operation, context, option.number);

    if (!namedCardResult.ok) {
      return namedCardResult;
    }

    if (
      operation.targetSelector.selectorKind === "bane" &&
      operation.targetSelector.source === "state"
    ) {
      const resolution = resolveTargetSelector(context.content, context.state.quest, operation.targetSelector);

      if (resolution.candidateCount === 0) {
        return fail(
          "bane_current_state_target_unavailable",
          `Option ${option.number} has no tracked current-state Bane targets`,
          { targetResolution: resolution },
        );
      }
    }

    const result = validateTargetSelector(operation.targetSelector, context, option.number, generatedObjects);

    if (!result.ok) {
      return result;
    }
  }

  const structuredResult = scanIllegalStructuredValue([
    option.costs,
    option.effects,
    option.burdens,
    option.targets,
    option.triggers,
    option.routeEffects,
  ]);

  if (!structuredResult.ok) {
    return structuredResult;
  }

  if (
    option.effects.some((effect) => isRecord(effect) && effect.kind === "dreamsign_loss") &&
    context.state.quest.activeDreamsigns.length === 0
  ) {
    const hasResolvableNonActiveLoss = option.effects.some((effect) =>
      isRecord(effect) &&
      effect.kind === "dreamsign_loss" &&
      effect.source !== "active" &&
      resolveDreamsignTargets(
        context.content,
        context.state.quest,
        dreamsignPredicateFromPayload(effect, {
          id: "dreamsignId",
          name: "dreamsignName",
          source: "source",
        }),
      ).length > 0
    );

    if (!hasResolvableNonActiveLoss) {
      return fail("dreamsign_loss_without_dreamsign", "Dreamsign loss requires an active or explicitly targeted Dreamsign");
    }
  }

  for (const effect of option.effects) {
    if (isRecord(effect)) {
      const cardResult = validateCardPayload(effect, context, option.number);

      if (!cardResult.ok) {
        return cardResult;
      }

      const starterResult = validateStarterPayload(effect, context, option.number);

      if (!starterResult.ok) {
        return starterResult;
      }

      const result = validateDreamsignPayload(effect, context, option.number);

      if (!result.ok) {
        return result;
      }
    }
  }

  if (
    option.effects.some((effect) => isRecord(effect) && effect.kind === "starter_cleanup") &&
    context.state.quest.deck.summary.starterCards === 0
  ) {
    return fail("starter_cleanup_without_starters", "Starter cleanup requires Starter cards");
  }

  if (option.effects.some(isBaneCurrentStateRequirement)) {
    return fail("bane_current_state_target_unavailable", "Current-state Bane operations require tracked Banes in state");
  }

  if (option.operations.some((operation) =>
    operation.targetSelector?.selectorKind === "bane" &&
    operation.targetSelector.source === "state" &&
    operation.targetResolution?.candidateCount === 0
  )) {
    return fail("bane_current_state_target_unavailable", "Current-state Bane operations require tracked Banes in state");
  }

  if (
    option.netConvertedEssence > 0 &&
    option.routeEffects.some((routeEffect) => {
      if (!isRecord(routeEffect) || typeof routeEffect.kind !== "string") {
        return false;
      }

      return !("routeOperationKind" in routeEffect) &&
        (routeEffect.kind.includes("addition") || routeEffect.kind.includes("add"));
    })
  ) {
    return fail("route_addition_standalone_positive_reward", "Route addition cannot be a standalone positive reward");
  }

  return { ok: true };
}

export function validateOptionShape(option: unknown, index: number): ValidationResult {
  if (!isRecord(option) || typeof option.text !== "string") {
    return fail("invalid_option", `Option ${index + 1} must be a complete Journey option`);
  }

  return { ok: true };
}
