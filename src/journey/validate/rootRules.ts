import type { JourneyContext } from "../../quest/context.js";
import { stableStringify } from "../../util/stableJson.js";
import type { GeneratedObjectDefinition, JourneyManifest, JourneyOption } from "../manifest.js";
import { getShapeDefinition, getShapePlugin } from "../shapes.js";
import { isRecord } from "./guards.js";
import { validateOption, validateOptionShape } from "./options.js";
import { hasPrecommitted } from "./precommitRules.js";
import { fail, type ValidationResult } from "./result.js";
import {
  validateCompoundOptionCoherence,
  validatePositiveMenuValues,
  validateSymmetricMenuValues,
} from "./values.js";

export function normalizedMechanicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizedMechanicalValue);
  }

  if (!isRecord(value)) {
    return typeof value === "number" ? "#" : value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => ![
        "text",
        "description",
        "amount",
        "count",
        "choiceCount",
        "takeCount",
        "costConvertedEssence",
        "effectConvertedEssence",
        "burdenConvertedEssence",
        "uncertaintyConvertedEssence",
        "netConvertedEssence",
      ].includes(key))
      .sort(([left], [right]) => left.localeCompare(right, "en-US"))
      .map(([key, entry]) => [key, normalizedMechanicalValue(entry)]),
  );
}

export function randomPrecommitForOption(manifest: JourneyManifest, optionNumber: number): unknown {
  const random = manifest.precommitted.random;

  if (!Array.isArray(random)) {
    return undefined;
  }

  return random.find((entry) =>
    isRecord(entry) && entry.optionNumber === optionNumber
  ) ?? random[optionNumber - 1];
}

export function mechanicalOptionSignature(manifest: JourneyManifest, option: JourneyOption): string {
  return JSON.stringify(normalizedMechanicalValue({
    costs: option.costs,
    effects: option.effects,
    burdens: option.burdens,
    targets: option.targets,
    triggers: option.triggers,
    routeEffects: option.routeEffects,
    pickBehavior: option.pickBehavior,
    randomPrecommit: randomPrecommitForOption(manifest, option.number),
  }));
}

export function validateRootMechanicalDistinction(manifest: JourneyManifest): ValidationResult {
  if (manifest.options.length < 2) {
    return { ok: true };
  }

  if (
    getShapeDefinition(manifest.shapeId).topology === "random_commit" &&
    !hasPrecommitted(manifest.precommitted.random)
  ) {
    return { ok: true };
  }

  const seen = new Map<string, number>();

  for (const option of manifest.options) {
    if (option.pickBehavior === "leave") {
      continue;
    }

    const signature = mechanicalOptionSignature(manifest, option);
    const previous = seen.get(signature);

    if (previous !== undefined) {
      return fail(
        "duplicate_root_option_mechanics",
        `Options ${previous} and ${option.number} have duplicate mechanical payloads`,
      );
    }

    seen.set(signature, option.number);
  }

  return { ok: true };
}

export function rootOptionCountResult(
  manifest: JourneyManifest,
  definition: ReturnType<typeof getShapeDefinition>,
): ValidationResult {
  if (manifest.options.length === 0 && definition.topology !== "decision_tree") {
    return fail("missing_options", "Non-tree Journey manifests require at least one option");
  }

  if (
    manifest.options.length < definition.rootOptionCount.min ||
    manifest.options.length > definition.rootOptionCount.max
  ) {
    return fail("root_option_count_within_bounds", `${manifest.shapeId} has an invalid root option count`);
  }

  return { ok: true };
}

export function rootOptionPayloadsResult(
  manifest: JourneyManifest,
  context: JourneyContext,
  generatedObjects: readonly GeneratedObjectDefinition[] = [],
): ValidationResult {
  for (const [index, option] of manifest.options.entries()) {
    const optionShapeResult = validateOptionShape(option, index);

    if (!optionShapeResult.ok) {
      return optionShapeResult;
    }

    const result = validateOption(option, context, generatedObjects);

    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}

export function rootValueResult(manifest: JourneyManifest): ValidationResult {
  const compoundCoherence = validateCompoundOptionCoherence(manifest);

  if (!compoundCoherence.ok) {
    return compoundCoherence;
  }

  const nets = manifest.options
    .filter((journeyOption) => journeyOption.pickBehavior !== "leave")
    .map((journeyOption) => journeyOption.netConvertedEssence);

  const optionValueValidator = getShapePlugin(manifest.shapeId).optionValueValidator;

  if (optionValueValidator) {
    return optionValueValidator(nets, manifest);
  }

  if (nets.length > 0 && nets.every((net) => net < 0)) {
    return fail("negative_only_positive_scene", "Positive Journey scenes cannot contain only negative options");
  }

  const symmetricValues = validateSymmetricMenuValues(manifest);

  if (!symmetricValues.ok) {
    return symmetricValues;
  }

  return validatePositiveMenuValues(manifest.shapeId, nets);
}

export function offerRefusalResult(
  manifest: JourneyManifest,
  definition: ReturnType<typeof getShapeDefinition>,
): ValidationResult {
  if (
    definition.topology === "single_offer_refusal" &&
    !manifest.options.some((journeyOption) => journeyOption.pickBehavior === "leave")
  ) {
    return fail("fake_strategic_refusal", "Offer shapes require a real leave option");
  }

  return { ok: true };
}

export function repeatableMenuLeaveResult(
  manifest: JourneyManifest,
  definition: ReturnType<typeof getShapeDefinition>,
): ValidationResult {
  if (
    definition.topology === "repeatable_menu" &&
    !manifest.options.some((option) => option.pickBehavior === "leave")
  ) {
    return fail("missing_leave_option", "Repeatable menus require a leave option");
  }

  return { ok: true };
}

export function repeatableMenuLimitResult(
  manifest: JourneyManifest,
  definition: ReturnType<typeof getShapeDefinition>,
): ValidationResult {
  if (definition.topology !== "repeatable_menu") {
    return { ok: true };
  }

  for (const option of manifest.options) {
    if (option.pickBehavior === "leave" || option.pickBehavior === "complete_sequence") {
      continue;
    }

    const hasLimitingStructure =
      option.costs.length > 0 ||
      option.burdens.length > 0 ||
      option.uncertaintyConvertedEssence < 0;

    if (!hasLimitingStructure) {
      return fail(
        "open_pick_without_limiting_structure",
        "Repeatable take options require a cost, burden, or risk",
      );
    }
  }

  return { ok: true };
}
