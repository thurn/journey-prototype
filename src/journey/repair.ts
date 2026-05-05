import type { JourneyContext } from "../quest/context.js";
import {
  buildConservativeJourneyForShape,
  fallbackShapeIds,
} from "./fillers.js";
import type { JourneyManifest } from "./manifest.js";
import { JOURNEY_SHAPES, type JourneyShapeId } from "./shapes.js";
import { validateJourneyManifest, type ValidationResult } from "./validate.js";

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
    sequenceStep: manifest.sequence?.step,
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
  });
}

function nextShape(manifest: JourneyManifest): JourneyShapeId {
  const selectedIds = manifest.debug.shapeScores.map((entry) => entry.shapeId);
  const orderedIds = selectedIds.length > 0
    ? selectedIds
    : JOURNEY_SHAPES.map((shape) => shape.id);

  return orderedIds.find((shapeId) => shapeId !== manifest.shapeId) ?? "single_reward";
}

function recordAttempt(
  manifest: JourneyManifest,
  failed: ValidationResult,
  attempt: number,
  action: string,
  result: "repaired" | "fallback" | "failed",
): JourneyManifest {
  return {
    ...manifest,
    debug: {
      ...manifest.debug,
      repairs: [
        ...manifest.debug.repairs,
        {
          attempt,
          failedRule: failed.ok ? "unknown" : failed.rule,
          action,
          result,
        },
      ],
    },
  };
}

function withPayableCosts(manifest: JourneyManifest, context: JourneyContext): JourneyManifest {
  return {
    ...manifest,
    options: manifest.options.map((option) => {
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

      return {
        ...option,
        costs: adjustedCosts,
        costConvertedEssence: Math.min(option.costConvertedEssence, context.state.quest.resources.essence),
        netConvertedEssence:
          option.effectConvertedEssence -
          Math.min(option.costConvertedEssence, context.state.quest.resources.essence) +
          option.burdenConvertedEssence +
          option.uncertaintyConvertedEssence,
      };
    }),
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
      candidate = buildReplacement(current, context, nextShape(current));
    } else if (action === "fallback") {
      candidate = buildReplacement(current, context, fallbackShape(current));
    }

    const result = validateJourneyManifest(candidate, context);
    const repairResult = action === "fallback" ? "fallback" : "repaired";
    const recorded = recordAttempt(candidate, failed, attempt, action, result.ok ? repairResult : "failed");

    if (result.ok) {
      return recorded;
    }

    current = recorded;
  }

  return current;
}
