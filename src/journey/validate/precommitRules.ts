import type { JourneyContext } from "../../quest/context.js";
import type { GeneratedObjectDefinition, JourneyManifest, JourneyOption } from "../manifest.js";
import { getShapeDefinition, getShapePlugin } from "../shapes.js";
import { isRecord } from "./guards.js";
import { validateOption, validateOptionShape } from "./options.js";
import { validateRouteEffects } from "./payloadContracts.js";
import { hasOdds } from "./randomContracts.js";
import { fail, type ValidationResult } from "./result.js";

export function hasPrecommitted(precommitted: unknown[] | Record<string, unknown> | undefined): boolean {
  if (Array.isArray(precommitted)) {
    return precommitted.length > 0;
  }

  return isRecord(precommitted) && Object.keys(precommitted).length > 0;
}

export function sequenceMenuKey(step: number): string {
  return `step${step}`;
}

export function containsRecordWhere(value: unknown, predicate: (record: Record<string, unknown>) => boolean): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => containsRecordWhere(entry, predicate));
  }

  if (!isRecord(value)) {
    return false;
  }

  if (predicate(value)) {
    return true;
  }

  return Object.values(value).some((entry) => containsRecordWhere(entry, predicate));
}

export function hasEnvelopeConstraint(
  value: Record<string, unknown>,
  shapeId: JourneyManifest["shapeId"],
  ruleId: string,
): boolean {
  return Array.isArray(value.constraints) &&
    value.constraints.some((constraint) =>
      isRecord(constraint) &&
      constraint.constraintKind === "shape_invariant" &&
      constraint.shapeId === shapeId &&
      constraint.ruleId === ruleId
    );
}

export function optionImpliesRandomOrHiddenOutcome(option: JourneyOption): boolean {
  if (option.operations.some((operation) =>
    operation.operationKind === "random_envelope" ||
    operation.operationKind === "reveal_envelope" ||
    operation.role === "random" ||
    operation.visibility === "precommitted"
  )) {
    return true;
  }

  return containsRecordWhere([
    option.costs,
    option.effects,
    option.burdens,
    option.targets,
    option.triggers,
  ], (record) => {
    const kind = typeof record.kind === "string" ? record.kind : "";
    const type = typeof record.type === "string" ? record.type : "";

    if (kind === "bane_random_purge") {
      return false;
    }

    return kind.includes("random") || type.includes("random") || record.hidden === true;
  });
}

export function optionImpliesDelayedOutcome(option: JourneyOption): boolean {
  if (option.operations.some((operation) =>
    operation.role === "delayed_hook" ||
    operation.role === "trigger" ||
    operation.operationKind === "delayed_hook"
  )) {
    return true;
  }

  return option.triggers.length > 0 ||
    containsRecordWhere([option.effects, option.triggers], (record) => {
      if (typeof record.timedWindowScope === "string") {
        return false;
      }

      const timing = typeof record.timing === "string" ? record.timing : "";
      const trigger = typeof record.trigger === "string" ? record.trigger : "";

      return timing.includes("next") || trigger.length > 0;
    });
}

export function hookBudgetCostFromPayload(value: unknown): number {
  if (!isRecord(value)) {
    return 0;
  }

  if (typeof value.hookBudgetCost === "number" && value.hookBudgetCost > 0) {
    return value.hookBudgetCost;
  }

  return typeof value.hook === "string" && value.hook.length > 0 ? 1 : 0;
}

function hasMechanicalPayload(option: JourneyOption | Record<string, unknown>): boolean {
  const costs = Array.isArray(option.costs) ? option.costs : [];
  const effects = Array.isArray(option.effects) ? option.effects : [];
  const burdens = Array.isArray(option.burdens) ? option.burdens : [];
  const targets = Array.isArray(option.targets) ? option.targets : [];
  const triggers = Array.isArray(option.triggers) ? option.triggers : [];
  const routeEffects = Array.isArray(option.routeEffects) ? option.routeEffects : [];
  const operations = Array.isArray(option.operations) ? option.operations : [];
  const convertedValues = [
    option.costConvertedEssence,
    option.effectConvertedEssence,
    option.burdenConvertedEssence,
    option.uncertaintyConvertedEssence,
    option.netConvertedEssence,
  ].filter((entry): entry is number => typeof entry === "number");

  return costs.length > 0 ||
    effects.length > 0 ||
    burdens.length > 0 ||
    targets.length > 0 ||
    triggers.length > 0 ||
    routeEffects.length > 0 ||
    operations.some((operation) =>
      isRecord(operation) &&
      operation.operationKind !== "validation_requirement" &&
      operation.operationKind !== "target"
    ) ||
    convertedValues.some((value) => value !== 0);
}

export function manifestHookBudgetCost(manifest: JourneyManifest): number {
  const rootPayloads: unknown[] = manifest.options.flatMap((option) => [
    ...option.effects,
    ...option.burdens,
    ...option.triggers,
  ]);
  const treePayloads: unknown[] = manifest.tree?.nodes.flatMap((node) =>
    node.branches.flatMap((branch) => [
      ...branch.effects,
      ...branch.burdens,
      ...branch.triggers,
      ...(branch.terminal?.effects ?? []),
      ...(branch.terminal?.burdens ?? []),
    ])
  ) ?? [];

  return [...rootPayloads, ...treePayloads].reduce<number>(
    (sum, payload) => sum + hookBudgetCostFromPayload(payload),
    0,
  );
}

export function validateSequenceMenu(
  menu: unknown,
  context: JourneyContext,
  path: string,
  maxSteps: number | undefined,
  generatedObjects: readonly GeneratedObjectDefinition[] = [],
): ValidationResult {
  if (!Array.isArray(menu) || menu.length === 0) {
    return fail("invalid_sequence_menu", `${path} must be a non-empty JourneyOption[]`);
  }

  const stepMatch = path.match(/step(\d+)$/u);
  const step = stepMatch ? Number.parseInt(stepMatch[1]!, 10) : undefined;

  for (const [index, option] of menu.entries()) {
    const optionShapeResult = validateOptionShape(option, index);

    if (!optionShapeResult.ok) {
      return optionShapeResult;
    }

    const result = validateOption(option, context, generatedObjects);

    if (!result.ok) {
      return result;
    }
  }

  if (!menu.some((entry) =>
    isRecord(entry) &&
    (entry.pickBehavior === "complete_sequence" || entry.pickBehavior === "leave")
  )) {
    return fail("missing_sequence_terminal_option", `${path} must include a completion or leave option`);
  }

  if (
    menu.some((entry) =>
      isRecord(entry) &&
      (entry.pickBehavior === "complete_sequence" || entry.pickBehavior === "leave") &&
      !hasMechanicalPayload(entry)
    )
  ) {
    return fail("fake_sequence_leave", `${path} has a fake sequence stop or leave option`);
  }

  if (
    step !== undefined &&
    maxSteps !== undefined &&
    step >= maxSteps &&
    menu.some((entry) => isRecord(entry) && entry.pickBehavior === "advance_sequence")
  ) {
    return fail("sequence_advances_past_cap", `${path} cannot advance past maxSteps`);
  }

  return { ok: true };
}

export function validateSequenceMenus(
  manifest: JourneyManifest,
  context: JourneyContext,
  generatedObjects: readonly GeneratedObjectDefinition[] = [],
): ValidationResult {
  if (!isRecord(manifest.precommitted.sequenceMenus)) {
    return fail("invalid_sequence_menu", "Sequential precommitted menus must be a record of JourneyOption[] values");
  }

  for (const [key, menu] of Object.entries(manifest.precommitted.sequenceMenus)) {
    const result = validateSequenceMenu(
      menu,
      context,
      key,
      manifest.sequence?.maxSteps,
      generatedObjects,
    );

    if (!result.ok) {
      return result;
    }
  }

  const nextStep = (manifest.sequence?.step ?? 0) + 1;

  if (
    manifest.sequence?.maxSteps === undefined ||
    nextStep <= manifest.sequence.maxSteps
  ) {
    const nextMenu = manifest.precommitted.sequenceMenus[sequenceMenuKey(nextStep)];

    if (!Array.isArray(nextMenu) || nextMenu.length === 0) {
      return fail("missing_precommitted_outcomes", "Sequential shapes require the next follow-up menu to be precommitted");
    }
  }

  return { ok: true };
}

export function randomPrecommittedResult(
  manifest: JourneyManifest,
  definition: ReturnType<typeof getShapeDefinition>,
): ValidationResult {
  if (
    (definition.topology === "random_commit" ||
      definition.requiresPrecommittedRandom ||
      manifest.options.some(optionImpliesRandomOrHiddenOutcome)) &&
    !hasPrecommitted(manifest.precommitted.random)
  ) {
    return fail("missing_precommitted_outcomes", "Random shapes require precommitted outcomes");
  }

  return { ok: true };
}

export function delayedPrecommittedResult(
  manifest: JourneyManifest,
  context: JourneyContext,
  definition: ReturnType<typeof getShapeDefinition>,
): ValidationResult {
  if (
    definition.topology !== "delayed_hook" &&
    !manifest.options.some(optionImpliesDelayedOutcome)
  ) {
    return { ok: true };
  }

  if (!hasPrecommitted(manifest.precommitted.delayed)) {
    return fail("missing_precommitted_outcomes", "Delayed shapes require precommitted future outcomes");
  }

  const precommitValidator = getShapePlugin(manifest.shapeId).precommitValidator;

  if (precommitValidator) {
    const result = precommitValidator(manifest);

    if (!result.ok) {
      return result;
    }
  }

  if (context.state.quest.route.unresolvedHooks.length + manifestHookBudgetCost(manifest) > 3) {
    return fail("delayed_hook_over_persistence_budget", "Delayed hooks exceed persistence budget");
  }

  return { ok: true };
}

export function routePrecommittedPresenceResult(
  manifest: JourneyManifest,
  definition: ReturnType<typeof getShapeDefinition>,
): ValidationResult {
  if (
    (definition.topology === "route_edit" ||
      manifest.options.some((option) => option.routeEffects.length > 0)) &&
    !hasPrecommitted(manifest.precommitted.routeEdits)
  ) {
    return fail("missing_precommitted_outcomes", "Route shapes require committed route edits");
  }

  return { ok: true };
}

export function routePrecommittedPayloadResult(manifest: JourneyManifest): ValidationResult {
  return manifest.precommitted.routeEdits !== undefined
    ? validateRouteEffects(manifest.precommitted.routeEdits)
    : { ok: true };
}
