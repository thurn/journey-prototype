import type { JourneyContext } from "../../quest/context.js";
import { resolveDreamsignTargets, resolveTargetSelector } from "../effects.js";
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
