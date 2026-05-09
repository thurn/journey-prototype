import type { JourneyContext } from "../quest/context.js";
import {
  buildConservativeJourneyForShape,
} from "./fillers/index.js";
import type {
  JourneyManifest,
  RepairOutcomeMetadata,
  RepairOutcomeStatus,
} from "./manifest.js";
import { adaptJourneyOptionOperations } from "./operationAdapters.js";
import {
  fallbackShapeIds,
  getShapePlugin,
  journeyShapePlugins,
  type JourneyShapeId,
  type ShapeRepairAction,
} from "./shapes.js";
import {
  buildValidationReport,
  validateJourneyManifest,
  type ValidationResult,
} from "./validate/index.js";
import { evaluateOptionValue } from "./value.js";

type RepairAction = ShapeRepairAction;

const COST_FAILURE_RULES = new Set([
  "unpayable_immediate_cost",
  "prices_are_nonnegative_and_affordable_for_stage",
]);

const TARGET_FAILURE_RULES = new Set([
  "unresolved_reference",
  "named_card_target_unavailable",
  "card_operation_result_missing",
  "card_keyword_operation_invalid",
  "card_type_change_invalid",
  "card_text_operation_invalid",
  "card_temporary_window_missing",
  "card_merge_mode_missing",
  "card_split_mode_missing",
  "dreamsign_loss_without_dreamsign",
  "bane_current_state_target_unavailable",
  "starter_target_pool_too_small",
  "starter_replacement_pool_too_small",
  "invalid_target_selector",
  "unresolved_target_selector",
]);

const ROUTE_FAILURE_RULES = new Set([
  "route_addition_standalone_positive_reward",
  "unsupported_route_operation",
  "unsupported_route_scope",
  "invalid_route_polarity",
  "invalid_route_site_type",
  "incoherent_route_mutation",
  "route_precommitted_outcomes",
  "route_precommitted_payloads",
]);

const RESOURCE_FAILURE_RULES = new Set([
  "invalid_resource_semantics",
  "invalid_resource_amount",
  "invalid_resource_percentage",
  "invalid_resource_random_range",
  "invalid_resource_cap_change",
  "invalid_resource_reward_reduction",
  "incoherent_resource_cost_semantics",
]);

const BANE_FAILURE_RULES = new Set([
  "bane_name_missing",
  "bane_count_invalid",
  "bane_temporary_duration_missing",
  "bane_delayed_timing_missing",
  "bane_replacement_missing",
  "bane_transform_result_missing",
]);

const WINDOW_FAILURE_RULES = new Set([
  "battle_window_operation_missing",
  "battle_window_player_invalid",
  "battle_window_polarity_invalid",
  "battle_window_duration_missing",
  "dreamwell_scope_invalid",
  "dreamwell_operation_missing",
  "dreamwell_count_invalid",
  "dreamwell_metadata_missing",
]);

const SHOP_STATUS_FAILURE_RULES = new Set([
  "shop_operation_missing",
  "shop_price_modifier_invalid",
  "shop_reroll_cap_invalid",
  "unsupported_status_scope",
  "invalid_status_duration",
  "incoherent_rule_mutation",
]);

const DELAYED_HOOK_FAILURE_RULES = new Set([
  "invalid_hook_trigger",
  "invalid_hook_duration",
  "invalid_hook_expiration",
  "invalid_hook_visibility",
  "invalid_delayed_hook_contract",
  "delayed_precommitted_outcomes",
]);

const RANDOM_FAILURE_RULES = new Set([
  "invalid_random_envelope",
  "unsupported_random_envelope",
  "risk_or_skip_envelope",
  "single_wager_envelope",
  "random_precommitted_outcomes",
]);

const GENERATED_OBJECT_FAILURE_RULES = new Set([
  "invalid_generated_object_operation",
  "generated_object_operation_mismatch",
  "invalid_generated_object_definition",
  "invalid_generated_object_id",
  "duplicate_generated_object_id",
  "invalid_generated_object_name",
  "invalid_generated_object_type",
  "invalid_generated_object_rules",
  "invalid_generated_object_tags",
  "invalid_generated_object_references",
  "generated_object_unresolved_reference",
  "invalid_generated_object_duration",
  "invalid_generated_object_lifetime",
  "invalid_generated_object_value",
  "invalid_generated_object_validation",
]);

const TREE_FAILURE_RULES = new Set([
  "decision_tree_invariants",
  "tree_has_complete_visible_levels",
  "push_failure_must_end",
  "pool_is_visible",
  "draw_replacement_policy_is_visible",
]);

const ROOT_TOPOLOGY_FAILURE_RULES = new Set([
  "root_option_count_within_bounds",
  "invalid_option",
  "root_option_payloads",
  "duplicate_root_option_mechanics",
  "offer_refusal_invariants",
  "repeatable_menu_leave_option",
  "repeatable_menu_limiting_structure",
  "semantic_operations",
]);

function actionKey(action: RepairAction): string {
  return `${action.kind}:${action.action}:${action.targetShapeId ?? ""}`;
}

function uniqueRepairActions(actions: readonly RepairAction[]): RepairAction[] {
  const seen = new Set<string>();
  const unique: RepairAction[] = [];

  for (const action of actions) {
    const key = actionKey(action);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(action);
  }

  return unique;
}

function typedFailureRepairActions(failed: ValidationResult): RepairAction[] {
  if (failed.ok) {
    return [];
  }

  if (failed.rule === "missing_precommitted_outcomes") {
    if (failed.message.includes("Delayed")) {
      return [
        {
          action: "repair_delayed_hook_payload_family",
          kind: "repair_payload_family",
        },
      ];
    }

    if (failed.message.includes("Route")) {
      return [
        { action: "repair_route_payload_family", kind: "repair_payload_family" },
      ];
    }

    if (failed.message.includes("Random")) {
      return [
        { action: "repair_random_payload_family", kind: "repair_payload_family" },
      ];
    }
  }

  if (COST_FAILURE_RULES.has(failed.rule)) {
    return [
      {
        action: "clamp_unpayable_cost_or_burden",
        kind: "adjust_cost_or_burden",
      },
      { action: "repair_cost_payload_family", kind: "repair_payload_family" },
    ];
  }

  if (RESOURCE_FAILURE_RULES.has(failed.rule)) {
    return [
      { action: "repair_resource_payload_family", kind: "repair_payload_family" },
      {
        action: "clamp_unpayable_cost_or_burden",
        kind: "adjust_cost_or_burden",
      },
    ];
  }

  if (TARGET_FAILURE_RULES.has(failed.rule)) {
    return [
      { action: "choose_resolvable_payload_target", kind: "repair_payload_family" },
    ];
  }

  if (BANE_FAILURE_RULES.has(failed.rule)) {
    return [
      { action: "repair_bane_payload_family", kind: "repair_payload_family" },
    ];
  }

  if (ROUTE_FAILURE_RULES.has(failed.rule)) {
    return [
      { action: "repair_route_payload_family", kind: "repair_payload_family" },
    ];
  }

  if (WINDOW_FAILURE_RULES.has(failed.rule)) {
    return [
      { action: "repair_timed_window_payload_family", kind: "repair_payload_family" },
    ];
  }

  if (SHOP_STATUS_FAILURE_RULES.has(failed.rule)) {
    return [
      { action: "repair_shop_status_payload_family", kind: "repair_payload_family" },
    ];
  }

  if (DELAYED_HOOK_FAILURE_RULES.has(failed.rule)) {
    return [
      { action: "repair_delayed_hook_payload_family", kind: "repair_payload_family" },
    ];
  }

  if (RANDOM_FAILURE_RULES.has(failed.rule)) {
    return [
      { action: "repair_random_payload_family", kind: "repair_payload_family" },
    ];
  }

  if (GENERATED_OBJECT_FAILURE_RULES.has(failed.rule)) {
    return [
      { action: "repair_generated_object_payload_family", kind: "repair_payload_family" },
    ];
  }

  if (TREE_FAILURE_RULES.has(failed.rule)) {
    return [
      { action: "repair_decision_tree_payload_family", kind: "repair_payload_family" },
    ];
  }

  if (ROOT_TOPOLOGY_FAILURE_RULES.has(failed.rule)) {
    return [
      { action: "restore_shape_topology", kind: "simplify_fill" },
    ];
  }

  return [];
}

function shapeRepairActions(manifest: JourneyManifest): RepairAction[] {
  const actions = getShapePlugin(manifest.shapeId).repair?.actions ?? [];

  return [
    ...actions.filter((action) => action.kind !== "switch_to_shape"),
    ...actions.filter((action) => action.kind === "switch_to_shape"),
  ];
}

function repairPlan(
  manifest: JourneyManifest,
  failed: ValidationResult,
): RepairAction[] {
  return uniqueRepairActions([
    ...typedFailureRepairActions(failed),
    ...shapeRepairActions(manifest),
    { action: "simplify_fill", kind: "simplify_fill" },
    { action: "switch_shape", kind: "switch_shape" },
    { action: "fallback", kind: "fallback" },
  ]);
}

function drawContextFor(manifest: JourneyManifest) {
  return {
    seed: manifest.seed,
    contentVersion: "",
    rootJourneyIndex: manifest.rootJourneyIndex,
  };
}

function buildReplacement(
  manifest: JourneyManifest,
  context: JourneyContext,
  shapeId: JourneyShapeId,
): JourneyManifest {
  return buildConservativeJourneyForShape({
    context,
    drawContext: {
      ...drawContextFor(manifest),
      contentVersion: context.contentVersion,
    },
    journeyId: manifest.journeyId,
    shapeId,
    stage: manifest.stage,
    selectedTags: manifest.selectedTags,
    shapeScores: manifest.debug.shapeScores,
    previousPick: manifest.debug.previousPick,
    debugPayload: manifest.debug.debugPayload,
  });
}

function nextShape(manifest: JourneyManifest): JourneyShapeId {
  const selectedIds = manifest.debug.shapeScores.map((entry) => entry.shapeId);
  const orderedIds =
    selectedIds.length > 0
      ? selectedIds
      : journeyShapePlugins().map((plugin) => plugin.id);

  return (
    orderedIds.find((shapeId) => shapeId !== manifest.shapeId) ??
    "single_reward"
  );
}

function repairStatusForAction(
  action: RepairAction,
  result: "repaired" | "fallback" | "failed",
): Exclude<
  RepairOutcomeStatus,
  "accepted_immediately" | "forced_shape_failed" | "unrepaired"
> {
  if (result === "fallback" || action.kind === "fallback") {
    return "fallback";
  }

  if (
    action.kind === "adjust_cost_or_burden" ||
    action.kind === "adjust_quantity"
  ) {
    return "adjusted";
  }

  if (
    action.kind === "reveal_hidden_target_or_outcome" ||
    action.action.includes("target")
  ) {
    return "narrowed";
  }

  return "replaced";
}

function repairMetadata(
  manifest: JourneyManifest,
  status: RepairOutcomeStatus,
  forcedShape: boolean,
  failed?: ValidationResult,
  action?: RepairAction,
): RepairOutcomeMetadata {
  const firstFailure = manifest.debug.validation.firstFailure;
  const checkedWithTarget = firstFailure?.checked.find(
    (entry) => entry.targetResolution,
  );
  const disposition =
    status === "accepted_immediately"
      ? "accepted"
      : status === "forced_shape_failed"
        ? "forced_to_fail"
        : status === "unrepaired"
          ? "unrepaired"
          : action?.kind === "repair_payload_family"
            ? "payload_regenerated"
            : action?.kind === "simplify_fill"
              ? "simplified"
              : status;

  return {
    status,
    forcedShape,
    finalShapeId: manifest.shapeId,
    disposition,
    ...(action ? { action: action.action } : {}),
    ...(!failed?.ok && failed
      ? { failedRule: failed.rule, message: failed.message }
      : {}),
    ...(manifest.debug.debugPayload
      ? { payloadFamily: manifest.debug.debugPayload.familyId }
      : { payloadFamily: "adapter" }),
    ...(checkedWithTarget?.targetResolution
      ? { targetResolution: checkedWithTarget.targetResolution }
      : {}),
  };
}

export function markJourneyAcceptedImmediately(
  manifest: JourneyManifest,
  forcedShape = false,
): JourneyManifest {
  return {
    ...manifest,
    debug: {
      ...manifest.debug,
      repair: repairMetadata(manifest, "accepted_immediately", forcedShape),
    },
  };
}

export function markJourneyForcedShapeFailure(
  manifest: JourneyManifest,
  failed: ValidationResult,
): JourneyManifest {
  return {
    ...manifest,
    debug: {
      ...manifest.debug,
      repair: repairMetadata(manifest, "forced_shape_failed", true, failed),
    },
  };
}

function recordAttempt(
  previous: JourneyManifest,
  manifest: JourneyManifest,
  failed: ValidationResult,
  validation: ValidationResult,
  validationReport: JourneyManifest["debug"]["validation"],
  attempt: number,
  action: RepairAction,
  result: "repaired" | "fallback" | "failed",
): JourneyManifest {
  const actionCategory = repairStatusForAction(action, result);

  return {
    ...manifest,
    debug: {
      ...manifest.debug,
      validation: validationReport,
      repairs: [
        ...previous.debug.repairs,
        {
          attempt,
          failedRule: failed.ok ? "unknown" : failed.rule,
          actionCategory,
          action: action.action,
          result,
          ...(!validation.ok
            ? {
                validation: validationReport.firstFailure ?? {
                  ruleId: validation.rule,
                  message: validation.message,
                  severity: "error" as const,
                  checked: validationReport.rules[0]?.checked ?? [],
                },
              }
            : {}),
        },
      ],
    },
  };
}

function withPayableCosts(
  manifest: JourneyManifest,
  context: JourneyContext,
): JourneyManifest {
  const options = manifest.options.map((option) => {
    const adjustedCosts = option.costs.map((cost) => {
      if (typeof cost !== "object" || cost === null || Array.isArray(cost)) {
        return cost;
      }

      if ((cost as { kind?: unknown }).kind === "essence") {
        return {
          ...cost,
          amount: Math.min(
            Number((cost as { amount?: unknown }).amount ?? 0),
            context.state.quest.resources.essence,
          ),
        };
      }

      if ((cost as { kind?: unknown }).kind === "omens") {
        return {
          ...cost,
          amount: Math.min(
            Number((cost as { amount?: unknown }).amount ?? 0),
            context.state.quest.resources.omens,
          ),
        };
      }

      return cost;
    });

    const adjustedOption = {
      ...option,
      costs: adjustedCosts,
      costConvertedEssence: Math.min(
        option.costConvertedEssence,
        context.state.quest.resources.essence,
      ),
      netConvertedEssence:
        option.effectConvertedEssence -
        Math.min(
          option.costConvertedEssence,
          context.state.quest.resources.essence,
        ) +
        option.burdenConvertedEssence +
        option.uncertaintyConvertedEssence,
    };

    return {
      ...adjustedOption,
      operations: adaptJourneyOptionOperations(adjustedOption),
    };
  });

  return {
    ...manifest,
    options,
    debug: {
      ...manifest.debug,
      optionValues: options.map((option) =>
        evaluateOptionValue(option, context),
      ),
    },
  };
}

function revealHidden(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(revealHidden);
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        key === "hidden" ? false : revealHidden(nested),
      ]),
    );
  }

  return value;
}

function fallbackShape(manifest: JourneyManifest): JourneyShapeId {
  return (
    fallbackShapeIds().find((shapeId) =>
      manifest.debug.shapeScores.some((score) => score.shapeId === shapeId),
    ) ?? fallbackShapeIds()[0]!
  );
}

export function repairOrFallbackJourney(
  manifest: JourneyManifest,
  context: JourneyContext,
  failed: ValidationResult,
  options: { forcedShape?: boolean } = {},
): JourneyManifest {
  let current = manifest;
  const actions = repairPlan(manifest, failed);

  for (let index = 0; index < actions.length; index += 1) {
    const attempt = index + 1;
    const action = actions[index]!;
    let candidate = current;

    if (
      action.kind === "adjust_cost_or_burden" ||
      action.kind === "adjust_quantity"
    ) {
      candidate = withPayableCosts(current, context);
    } else if (action.kind === "reveal_hidden_target_or_outcome") {
      candidate = revealHidden(current) as JourneyManifest;
    } else if (
      action.kind === "repair_payload_family" ||
      action.kind === "simplify_fill"
    ) {
      candidate = buildReplacement(current, context, current.shapeId);
    } else if (action.kind === "switch_to_shape") {
      if (options.forcedShape || !action.targetShapeId) {
        continue;
      }
      candidate = buildReplacement(current, context, action.targetShapeId);
    } else if (action.kind === "switch_shape") {
      if (options.forcedShape) {
        continue;
      }
      candidate = buildReplacement(current, context, nextShape(current));
    } else if (action.kind === "fallback") {
      if (options.forcedShape) {
        continue;
      }
      candidate = buildReplacement(current, context, fallbackShape(current));
    }

    const result = validateJourneyManifest(candidate, context);
    const validationReport = buildValidationReport(candidate, context);
    const repairResult = action.kind === "fallback" ? "fallback" : "repaired";
    const recorded = recordAttempt(
      current,
      candidate,
      failed,
      result,
      validationReport,
      attempt,
      action,
      result.ok ? repairResult : "failed",
    );

    if (result.ok) {
      return {
        ...recorded,
        debug: {
          ...recorded.debug,
          repair: repairMetadata(
            recorded,
            repairStatusForAction(action, repairResult),
            options.forcedShape === true,
            failed,
            action,
          ),
        },
      };
    }

    current = recorded;
  }

  return {
    ...current,
    debug: {
      ...current.debug,
      repair: repairMetadata(
        current,
        options.forcedShape ? "forced_shape_failed" : "unrepaired",
        options.forcedShape === true,
        failed,
      ),
    },
  };
}
