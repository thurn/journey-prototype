import type { JourneyManifest } from "../manifest.js";
import { getShapeDefinition } from "../shapes.js";
import { POSITIVE_MENU_VALUE_CONSTANTS } from "../value.js";
import { fail, type ValidationResult } from "./result.js";

export function validatePositiveMenuValues(
  shapeId: JourneyManifest["shapeId"],
  nets: readonly number[],
): ValidationResult {
  if (!getShapeDefinition(shapeId).menuValueChecks.positiveBands) {
    return { ok: true };
  }

  const positiveNets = nets.filter((net) => net > 0);

  if (positiveNets.length < 2) {
    return { ok: true };
  }

  const lowest = Math.min(...positiveNets);
  const highest = Math.max(...positiveNets);
  const minimumComparableValue = Math.max(
    highest - POSITIVE_MENU_VALUE_CONSTANTS.maximumComparableSpread,
    highest * POSITIVE_MENU_VALUE_CONSTANTS.minimumComparableRatio,
  );

  if (lowest < minimumComparableValue) {
    return fail(
      "option_values_are_comparable_for_shape",
      `${shapeId} positive options must stay in comparable value bands`,
    );
  }

  return { ok: true };
}

export function validateSymmetricMenuValues(manifest: JourneyManifest): ValidationResult {
  const checks = getShapeDefinition(manifest.shapeId).menuValueChecks;

  if (checks.escalationOrRiskExempt) {
    return { ok: true };
  }

  const hasSymmetryContract = (manifest.debug.symmetryContracts?.length ?? 0) > 0;

  if (!hasSymmetryContract && !checks.symmetricBands) {
    return { ok: true };
  }

  const nets = manifest.options
    .filter((journeyOption) => journeyOption.pickBehavior !== "leave")
    .map((journeyOption) => journeyOption.netConvertedEssence);
  const positiveNets = nets.filter((net) => net > 0);

  if (positiveNets.length < 2) {
    return { ok: true };
  }

  const lowest = Math.min(...positiveNets);
  const highest = Math.max(...positiveNets);
  const minimumComparableValue = Math.max(
    highest - POSITIVE_MENU_VALUE_CONSTANTS.symmetricMaximumComparableSpread,
    highest * POSITIVE_MENU_VALUE_CONSTANTS.symmetricMinimumComparableRatio,
  );

  if (lowest < minimumComparableValue) {
    return fail(
      "symmetric_option_values_are_comparable",
      `${manifest.shapeId} symmetric rows must stay in comparable value bands`,
    );
  }

  return { ok: true };
}

function hasMeaningfulUpside(option: JourneyManifest["options"][number]): boolean {
  return option.effectConvertedEssence >= 100 ||
    option.effectConvertedEssence > option.costConvertedEssence ||
    option.operations.some((operation) =>
      (operation.role === "reward" || operation.role === "route_edit") &&
      (operation.value?.convertedEssence ?? 0) >= 100
    );
}

function hasOnlyDownside(option: JourneyManifest["options"][number]): boolean {
  const hasDownside =
    option.costs.length > 0 ||
    option.burdens.length > 0 ||
    option.costConvertedEssence > 0 ||
    option.burdenConvertedEssence < 0 ||
    option.operations.some((operation) =>
      operation.role === "cost" || operation.role === "burden"
    );

  return hasDownside &&
    option.effects.length === 0 &&
    option.routeEffects.length === 0 &&
    option.effectConvertedEssence <= 0 &&
    !option.operations.some((operation) =>
      operation.role === "reward" || operation.role === "route_edit"
    );
}

export function validateCompoundOptionCoherence(
  manifest: JourneyManifest,
): ValidationResult {
  const definition = getShapeDefinition(manifest.shapeId);

  if (definition.compoundCoherence === "skip") {
    return { ok: true };
  }

  for (const option of manifest.options.filter((entry) => entry.pickBehavior !== "leave")) {
    if (hasOnlyDownside(option)) {
      return fail(
        "pure_burden_positive_scene",
        "Positive Journey scenes cannot offer pure burden rows",
      );
    }

    if (
      (option.costs.length > 0 || option.costConvertedEssence > 0) &&
      !hasMeaningfulUpside(option)
    ) {
      return fail(
        "cost_without_meaningful_upside",
        "Costs must be paired with a meaningful upside",
      );
    }

    const routeOnly =
      option.routeEffects.length > 0 &&
      option.effects.length === 0 &&
      option.effectConvertedEssence > 0;

    if (routeOnly && !definition.allowsRouteReward) {
      return fail(
        "route_only_reward_in_non_route_shape",
        "Route-only rewards require an explicitly route-compatible shape",
      );
    }
  }

  return { ok: true };
}

