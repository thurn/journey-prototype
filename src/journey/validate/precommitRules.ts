import type { JourneyContext } from "../../quest/context.js";
import type { GeneratedObjectDefinition, JourneyManifest, JourneyOption } from "../manifest.js";
import { getShapeDefinition } from "../shapes.js";
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

function hasEnvelopeConstraint(
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

function isRiskDownsideEnvelope(value: unknown): value is Record<string, unknown> {
  return isRecord(value) &&
    hasEnvelopeConstraint(value, "risk_or_skip", "risk_or_skip_bounded_downside") &&
    (value.kind === "chance_to_gain_bane" || value.kind === "chance_to_pay_cost");
}

function isSingleWagerEnvelope(value: unknown): value is Record<string, unknown> {
  return isRecord(value) &&
    value.kind === "wager" &&
    hasEnvelopeConstraint(value, "single_wager", "single_wager_known_stake");
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

export function textSignalsDownsideEnvelope(text: string): boolean {
  const hasPercentChance =
    /\b\d+%\s+chance\b/iu.test(text) ||
    /\b(?:chance|risk)\b.*\b\d+%\b/iu.test(text) ||
    /\b\d+%\b.*\b(?:chance|risk)\b/iu.test(text);
  const hasSafeAlternative = /\botherwise\b|\bno downside\b|\bsafe\b|\bnothing\b/iu.test(text);

  return hasPercentChance && hasSafeAlternative;
}

export function validateRiskOrSkip(manifest: JourneyManifest): ValidationResult {
  const acceptOptions = manifest.options.filter((option) => option.pickBehavior !== "leave");

  if (acceptOptions.length !== 1 || manifest.options.length - acceptOptions.length !== 1) {
    return fail(
      "one_take_option_and_one_refusal_option",
      "Risk-or-skip requires one accept option and one leave option",
    );
  }

  const acceptOption = acceptOptions[0]!;

  if (acceptOption.effects.length === 0 || acceptOption.effectConvertedEssence <= 0) {
    return fail(
      "accept_option_has_guaranteed_reward",
      "Risk-or-skip accept option requires a guaranteed reward",
    );
  }

  if (
    acceptOption.costs.length > 0 ||
    acceptOption.burdens.length > 0 ||
    acceptOption.costConvertedEssence > 0 ||
    acceptOption.burdenConvertedEssence < 0
  ) {
    return fail(
      "downside_is_random_inside_visible_envelope",
      "Risk-or-skip costs and burdens must be random outcomes, not guaranteed accept-option payloads",
    );
  }

  if (acceptOption.uncertaintyConvertedEssence >= 0 || !textSignalsDownsideEnvelope(acceptOption.text)) {
    return fail(
      "downside_is_random_inside_visible_envelope",
      "Risk-or-skip accept option must show bounded downside odds and a safe alternative",
    );
  }

  if (!hasPrecommitted(manifest.precommitted.random)) {
    return fail("missing_precommitted_outcomes", "Random shapes require precommitted outcomes");
  }

  const downsideRolls = manifest.precommitted.random?.filter(isRiskDownsideEnvelope) ?? [];

  if (downsideRolls.length < acceptOptions.length) {
    return fail(
      "downside_is_random_inside_visible_envelope",
      "Risk-or-skip precommit must store one typed constrained downside envelope per accept option",
    );
  }

  for (const roll of downsideRolls) {
    const hasBaneEnvelope = roll.kind === "chance_to_gain_bane" &&
      typeof roll.baneName === "string" &&
      typeof roll.count === "number" &&
      (roll.committedResult === "bane" || roll.committedResult === "safe");
    const hasCostEnvelope = roll.kind === "chance_to_pay_cost" &&
      isRecord(roll.cost) &&
      (roll.committedResult === "paid" || roll.committedResult === "free");

    if (!hasOdds(roll) || (!hasBaneEnvelope && !hasCostEnvelope)) {
      return fail(
        "downside_is_random_inside_visible_envelope",
        "Risk-or-skip precommit must store odds, typed downside metadata, and the committed safe/downside result",
      );
    }
  }

  return { ok: true };
}

export function validateSingleWager(manifest: JourneyManifest): ValidationResult {
  const wagerOptions = manifest.options.filter((option) => option.pickBehavior !== "leave");

  for (const option of wagerOptions) {
    if (option.costs.length === 0) {
      return fail("known_stake_is_visible_before_commit", "Single wager requires a visible stake");
    }

    if (!/\b\d+%\s+chance\b/iu.test(option.text) || !/\botherwise\b|\bnothing\b|\bfail/iu.test(option.text)) {
      return fail(
        "reward_outcome_is_bounded_random_envelope",
        "Single wager must show odds and the failure outcome before commitment",
      );
    }
  }

  const wagers = (manifest.precommitted.random ?? [])
    .filter((entry) => isSingleWagerEnvelope(entry))
    .map((entry) => entry as Record<string, unknown>);

  if (wagers.length < wagerOptions.length) {
    return fail(
      "reward_outcome_is_bounded_random_envelope",
      "Single wager precommit must store one typed constrained wager envelope per wager option",
    );
  }

  for (const wager of wagers) {
    if (
      !hasOdds(wager) ||
      !isRecord(wager.stake) ||
      !("success" in wager) ||
      !("failure" in wager) ||
      typeof wager.roll !== "number" ||
      (wager.committedResult !== "success" && wager.committedResult !== "failure")
    ) {
      return fail(
        "reward_outcome_is_bounded_random_envelope",
        "Single wager precommit must store stake, odds, success and failure outcomes, and the committed roll",
      );
    }
  }

  return { ok: true };
}

export function validateSequenceMenu(
  menu: unknown,
  context: JourneyContext,
  path: string,
  maxSteps: number | undefined,
  shapeId: JourneyManifest["shapeId"],
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
      typeof entry.text === "string" &&
      /(?:no effect|refuse|strategic refusal)/iu.test(entry.text)
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

  if (shapeId === "take_any_number") {
    for (const entry of menu) {
      if (
        !isRecord(entry) ||
        typeof entry.text !== "string" ||
        !/^take\b/iu.test(entry.text)
      ) {
        continue;
      }

      const hasLimitingStructure =
        (Array.isArray(entry.costs) && entry.costs.length > 0) ||
        (Array.isArray(entry.burdens) && entry.burdens.length > 0) ||
        (typeof entry.uncertaintyConvertedEssence === "number" &&
          entry.uncertaintyConvertedEssence < 0);

      if (!hasLimitingStructure) {
        return fail(
          "open_pick_without_limiting_structure",
          `${path} has a take option without a cost, burden, or risk`,
        );
      }
    }
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
      manifest.shapeId,
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
      manifest.shapeId === "risk_or_skip" ||
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

  if (manifest.shapeId === "paired_return" && !hasPrecommitted(manifest.precommitted.pairedReturn)) {
    return fail("missing_precommitted_outcomes", "Paired return shapes require precommitted return metadata");
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
