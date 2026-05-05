import type { JourneyContext } from "../quest/context.js";
import type { PickHistoryEntry } from "../state/schema.js";
import { weightedChoice, deterministicTieJitter, type DrawContext } from "../util/rng.js";
import { buildConservativeJourneyForShape } from "./fillers.js";
import type { JourneyManifest, JourneyStage } from "./manifest.js";
import { JOURNEY_SHAPES, type JourneyShapeDefinition } from "./shapes.js";
import { repairOrFallbackJourney } from "./repair.js";
import { validateJourneyManifest } from "./validate.js";

export type GenerationInput = {
  context: JourneyContext;
  previousPick?: PickHistoryEntry;
};

function journeyId(rootJourneyIndex: number): string {
  return `J-${String(rootJourneyIndex).padStart(6, "0")}`;
}

function stageForDreamscape(dreamscape: number): JourneyStage {
  if (dreamscape <= 1) {
    return "early";
  }

  if (dreamscape <= 3) {
    return "mid";
  }

  return "late";
}

function desiredTagsFor(context: JourneyContext, stage: JourneyStage): string[] {
  const tags = new Set<string>(stage === "early"
    ? ["build", "cleanup", "reward", "immediate", "broad"]
    : stage === "mid"
      ? ["refine", "risk", "delayed", "economy", "reward"]
      : ["convert", "sacrifice", "gamble", "route", "reward"]);

  if (context.state.quest.resources.essence < context.state.quest.resources.maxEssence * 0.25) {
    tags.add("resource");
  }

  if (context.state.quest.activeDreamsigns.length === 0) {
    tags.add("dreamsign");
  }

  if (context.state.quest.deck.summary.starterCards > 0) {
    tags.add("cleanup");
  }

  return [...tags].sort((left, right) => left.localeCompare(right, "en-US"));
}

function overlapFraction(left: readonly string[], right: readonly string[]): number {
  if (right.length === 0) {
    return 0;
  }

  const leftSet = new Set(left);
  const matches = right.filter((tag) => leftSet.has(tag)).length;

  return matches / right.length;
}

function broadRunNeedFit(shape: JourneyShapeDefinition, context: JourneyContext): number {
  let score = 0;
  let possible = 0;

  possible += 1;
  if (context.state.quest.deck.summary.starterCards > 0 && shape.supportedTags.includes("cleanup")) {
    score += 1;
  }

  possible += 1;
  if (context.state.quest.activeDreamsigns.length === 0 && shape.supportedTags.includes("dreamsign")) {
    score += 1;
  }

  possible += 1;
  if (context.state.quest.resources.essence < 100 && shape.supportedTags.includes("reward")) {
    score += 1;
  }

  return score / possible;
}

function targetAvailability(shape: JourneyShapeDefinition, context: JourneyContext): number {
  const hasCards = context.state.quest.draftPool.length > 0;
  const hasDreamsigns = context.state.quest.dreamsignPoolIds.length > 0;

  if (shape.supportedTags.includes("card") && !hasCards) {
    return 0;
  }

  if (shape.supportedTags.includes("dreamsign") && !hasDreamsigns) {
    return 0;
  }

  return 1;
}

function exactShapeRepetitionPenalty(shape: JourneyShapeDefinition, context: JourneyContext, previousPick?: PickHistoryEntry): number {
  const latest = previousPick ?? context.state.history[context.state.history.length - 1];

  return latest?.shapeId === shape.id ? 1 : 0;
}

function tagRepetitionPenalty(shape: JourneyShapeDefinition, context: JourneyContext): number {
  const recent = context.state.history.slice(-3);

  if (recent.length === 0) {
    return 0;
  }

  return recent.some((entry) => {
    const previous = JOURNEY_SHAPES.find((shapeDefinition) => shapeDefinition.id === entry.shapeId);

    return previous?.supportedTags.some((tag) => shape.supportedTags.includes(tag));
  })
    ? 1
    : 0;
}

function scoreShapes(
  context: JourneyContext,
  drawContext: DrawContext,
  desiredTags: readonly string[],
  previousPick?: PickHistoryEntry,
): { shapeId: JourneyShapeDefinition["id"]; score: number }[] {
  return JOURNEY_SHAPES.map((shape) => {
    const score =
      40 * overlapFraction(shape.supportedTags, desiredTags) +
      25 * broadRunNeedFit(shape, context) +
      20 * targetAvailability(shape, context) -
      30 * exactShapeRepetitionPenalty(shape, context, previousPick) -
      15 * tagRepetitionPenalty(shape, context) +
      deterministicTieJitter(drawContext, `shape:${shape.id}:tie`, 2);

    return {
      shapeId: shape.id,
      score: Number(score.toFixed(6)),
    };
  }).sort((left, right) => {
    const scoreComparison = right.score - left.score;

    if (scoreComparison !== 0) {
      return scoreComparison;
    }

    return left.shapeId.localeCompare(right.shapeId, "en-US");
  });
}

function selectShape(
  drawContext: DrawContext,
  scores: readonly { shapeId: JourneyShapeDefinition["id"]; score: number }[],
) {
  const topScore = scores[0]?.score ?? 0;
  const nearTop = scores.filter((entry) => topScore - entry.score <= 10);

  return weightedChoice(
    drawContext,
    "root:shape",
    nearTop.map((entry) => ({
      item: entry.shapeId,
      weight: Math.max(1, entry.score - (topScore - 10) + 1),
    })),
  );
}

function previousPickDebug(previousPick: PickHistoryEntry | undefined): JourneyManifest["debug"]["previousPick"] | undefined {
  if (!previousPick) {
    return undefined;
  }

  return {
    journeyId: previousPick.journeyId,
    shapeId: previousPick.shapeId,
    selectedOptionNumber: previousPick.selectedOptionNumber,
    effectSimulation: "not_applied",
    ...(previousPick.sequenceStep !== undefined ? { sequenceStep: previousPick.sequenceStep } : {}),
  };
}

function freezeSerializable<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => freezeSerializable(entry))) as T;
  }

  if (typeof value === "object" && value !== null) {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, nested]) => [key, freezeSerializable(nested)]),
      ),
    ) as T;
  }

  return value;
}

export function generateNextJourney(input: GenerationInput): JourneyManifest {
  const { context, previousPick } = input;
  const drawContext: DrawContext = {
    seed: context.state.quest.seed,
    contentVersion: context.contentVersion,
    rootJourneyIndex: context.state.generator.rootJourneyIndex,
  };
  const stage = stageForDreamscape(context.state.quest.resources.dreamscape);
  const selectedTags = desiredTagsFor(context, stage);
  const shapeScores = scoreShapes(context, drawContext, selectedTags, previousPick);
  const selectedShapeId = selectShape(drawContext, shapeScores);
  const manifest = buildConservativeJourneyForShape({
    context,
    drawContext,
    journeyId: journeyId(context.state.generator.rootJourneyIndex),
    shapeId: selectedShapeId,
    stage,
    selectedTags,
    shapeScores,
    previousPick: previousPickDebug(previousPick),
  });
  const validation = validateJourneyManifest(manifest, context);
  const finalManifest = validation.ok
    ? manifest
    : repairOrFallbackJourney(manifest, context, validation);

  return freezeSerializable(finalManifest);
}
