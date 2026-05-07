import type { JourneyContext } from "../quest/context.js";
import {
  buildConservativeJourneyForShape,
  fallbackShapeIds,
} from "./fillers.js";
import type {
  JourneyManifest,
  RepairOutcomeMetadata,
  RepairOutcomeStatus,
} from "./manifest.js";
import { adaptJourneyOptionOperations } from "./operationAdapters.js";
import { JOURNEY_SHAPES, type JourneyShapeId } from "./shapes.js";
import {
  buildValidationReport,
  validateJourneyManifest,
  type ValidationResult,
} from "./validate.js";
import { evaluateOptionValue } from "./value.js";

const REPAIR_ACTIONS = [
  "swap_effect",
  "adjust_quantity",
  "adjust_cost_or_burden",
  "reveal_hidden_target_or_outcome",
  "simplify_fill",
  "convert_route_addition",
  "choose_another_target",
  "replace_delayed_hook",
  "switch_shape",
  "fallback",
] as const;

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
  const orderedIds = selectedIds.length > 0
    ? selectedIds
    : JOURNEY_SHAPES.map((shape) => shape.id);

  return orderedIds.find((shapeId) => shapeId !== manifest.shapeId) ?? "single_reward";
}

function repairStatusForAction(
  action: string,
  result: "repaired" | "fallback" | "failed",
): Exclude<RepairOutcomeStatus, "accepted_immediately" | "forced_shape_failed" | "unrepaired"> {
  if (result === "fallback" || action === "fallback") {
    return "fallback";
  }

  if (action === "adjust_cost_or_burden" || action === "adjust_quantity") {
    return "adjusted";
  }

  if (action === "reveal_hidden_target_or_outcome" || action === "choose_another_target") {
    return "narrowed";
  }

  return "replaced";
}

function repairMetadata(
  manifest: JourneyManifest,
  status: RepairOutcomeStatus,
  forcedShape: boolean,
  failed?: ValidationResult,
): RepairOutcomeMetadata {
  const firstFailure = manifest.debug.validation.firstFailure;
  const checkedWithTarget = firstFailure?.checked.find((entry) => entry.targetResolution);

  return {
    status,
    forcedShape,
    finalShapeId: manifest.shapeId,
    ...(!failed?.ok && failed ? { failedRule: failed.rule, message: failed.message } : {}),
    ...(manifest.debug.debugPayload ? { payloadFamily: manifest.debug.debugPayload.familyId } : { payloadFamily: "adapter" }),
    ...(checkedWithTarget?.targetResolution ? { targetResolution: checkedWithTarget.targetResolution } : {}),
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
  action: string,
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
          action,
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

function withPayableCosts(manifest: JourneyManifest, context: JourneyContext): JourneyManifest {
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
      costConvertedEssence: Math.min(option.costConvertedEssence, context.state.quest.resources.essence),
      netConvertedEssence:
        option.effectConvertedEssence -
        Math.min(option.costConvertedEssence, context.state.quest.resources.essence) +
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
      optionValues: options.map((option) => evaluateOptionValue(option, context)),
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

  for (let index = 0; index < REPAIR_ACTIONS.length; index += 1) {
    const attempt = index + 1;
    const action = REPAIR_ACTIONS[index]!;
    let candidate = current;

    if (action === "adjust_cost_or_burden" || action === "adjust_quantity") {
      candidate = withPayableCosts(current, context);
    } else if (action === "reveal_hidden_target_or_outcome") {
      candidate = revealHidden(current) as JourneyManifest;
    } else if (action === "simplify_fill") {
      candidate = buildReplacement(current, context, current.shapeId);
    } else if (action === "convert_route_addition") {
      candidate = current.shapeId === "alter_dreamscapes"
        ? buildReplacement(current, context, "alter_dreamscapes")
        : current;
    } else if (action === "choose_another_target") {
      candidate = buildReplacement(current, context, current.shapeId);
    } else if (action === "replace_delayed_hook") {
      candidate = ["now_vs_later", "reward_after_trigger", "paired_return", "commit_now_future_payoff"].includes(current.shapeId)
        ? buildReplacement(current, context, "single_reward")
        : current;
    } else if (action === "switch_shape") {
      if (options.forcedShape) {
        continue;
      }
      candidate = buildReplacement(current, context, nextShape(current));
    } else if (action === "fallback") {
      if (options.forcedShape) {
        continue;
      }
      candidate = buildReplacement(current, context, fallbackShape(current));
    }

    const result = validateJourneyManifest(candidate, context);
    const validationReport = buildValidationReport(candidate, context);
    const repairResult = action === "fallback" ? "fallback" : "repaired";
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
