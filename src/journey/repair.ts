import type { JourneyContext } from "../quest/context.js";
import { buildJourneyForShape } from "./assembly.js";
import type {
  JourneyManifest,
  RepairOutcomeMetadata,
  RepairOutcomeStatus,
} from "./manifest.js";
import {
  fallbackShapeIds,
  type JourneyShapeId,
} from "./shapes.js";
import {
  validateJourneyManifest,
  type ValidationResult,
} from "./validate/index.js";

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
  return buildJourneyForShape({
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

function fallbackShape(manifest: JourneyManifest): JourneyShapeId {
  return (
    fallbackShapeIds().find((shapeId) =>
      manifest.debug.shapeScores.some((score) => score.shapeId === shapeId),
    ) ?? fallbackShapeIds()[0]!
  );
}

function repairMetadata(
  manifest: JourneyManifest,
  status: RepairOutcomeStatus,
  forcedShape: boolean,
  failed?: ValidationResult,
): RepairOutcomeMetadata {
  return {
    status,
    forcedShape,
    finalShapeId: manifest.shapeId,
    disposition:
      status === "accepted_immediately"
        ? "accepted"
        : status === "fallback"
          ? "fallback"
          : status === "forced_shape_failed"
            ? "forced_to_fail"
            : "unrepaired",
    payloadFamily: "adapter",
    ...(!failed?.ok && failed
      ? { failedRule: failed.rule, message: failed.message }
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

export function repairOrFallbackJourney(
  manifest: JourneyManifest,
  context: JourneyContext,
  failed: ValidationResult,
  options: { forcedShape?: boolean } = {},
): JourneyManifest {
  if (options.forcedShape) {
    return markJourneyForcedShapeFailure(manifest, failed);
  }

  const replacement = buildReplacement(manifest, context, fallbackShape(manifest));
  const validation = validateJourneyManifest(replacement, context);

  if (validation.ok) {
    return {
      ...replacement,
      debug: {
        ...replacement.debug,
        repairs: [
          ...manifest.debug.repairs,
          {
            attempt: 1,
            failedRule: failed.ok ? "unknown" : failed.rule,
            actionCategory: "fallback",
            action: "fallback",
            result: "fallback",
          },
        ],
        repair: repairMetadata(replacement, "fallback", false, failed),
      },
    };
  }

  return {
    ...manifest,
    debug: {
      ...manifest.debug,
      repair: repairMetadata(manifest, "unrepaired", false, failed),
    },
  };
}
