import type { JourneyContext } from "../quest/context.js";
import type { PickHistoryEntry } from "../state/schema.js";
import { weightedChoice, deterministicTieJitter, type DrawContext } from "../util/rng.js";
import { buildConservativeJourneyForShape } from "./fillers.js";
import type { JourneyManifest, JourneyOption, JourneyStage, SequenceState } from "./manifest.js";
import { JOURNEY_SHAPES, type JourneyShapeDefinition } from "./shapes.js";
import { repairOrFallbackJourney } from "./repair.js";
import { validateJourneyManifest } from "./validate.js";
import { evaluateOptionValue } from "./value.js";

export type GenerationInput = {
  context: JourneyContext;
  previousPick?: PickHistoryEntry;
  forcedShapeId?: JourneyShapeDefinition["id"] | string;
  forcedStage?: JourneyStage;
};

export type SequenceAdvanceInput = {
  context: JourneyContext;
  manifest: JourneyManifest;
  selectedOptionNumber: number;
};

export type SequenceAdvanceResult =
  | { kind: "advanced"; manifest: JourneyManifest }
  | {
    kind: "complete";
    journeyId: string;
    rootJourneyIndex: number;
    sequence: SequenceState;
    shouldGenerateNextRoot: true;
  }
  | {
    kind: "left";
    journeyId: string;
    rootJourneyIndex: number;
    sequence: SequenceState;
    shouldGenerateNextRoot: true;
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

const SHAPE_VARIETY_WEIGHTS = {
  random_allocation: 1.35,
  same_cost_different_rewards: 1.3,
  same_reward_different_costs: 1.25,
  service_menu: 1.3,
  shop_row: 1.25,
  curated_reward_trio: 1.35,
  heterogeneous_pair: 1.25,
  one_target_many_operations: 1.4,
  mirrored_operations: 0.75,
  one_operation_many_targets: 1.4,
  choose_your_loss: 0.85,
  single_reward: 0.65,
  single_offer: 0.65,
  risk_or_skip: 0.75,
  single_wager: 0.75,
  now_vs_later: 0.85,
  reward_after_trigger: 1,
  paired_return: 1,
  timed_window_menu: 0.85,
  take_any_number: 1.25,
  push_your_luck: 0.65,
  prize_ladder: 0.65,
  probability_ladder: 0.6,
  random_pool_draws: 0.6,
  escalating_reward_chain: 0.5,
  resolved_random_series: 1.2,
  single_random_outcome: 0.95,
  commit_now_future_payoff: 1.2,
  alter_dreamscapes: 0.6,
} as const satisfies Record<JourneyShapeDefinition["id"], number>;

function scoreShapes(
  context: JourneyContext,
  drawContext: DrawContext,
  desiredTags: readonly string[],
  previousPick?: PickHistoryEntry,
): { shapeId: JourneyShapeDefinition["id"]; score: number }[] {
  return JOURNEY_SHAPES.map((shape) => {
    const contextualScore =
      1 +
      0.08 * overlapFraction(shape.supportedTags, desiredTags) +
      0.06 * broadRunNeedFit(shape, context) +
      0.04 * targetAvailability(shape, context) -
      0.1 * exactShapeRepetitionPenalty(shape, context, previousPick) -
      0.05 * tagRepetitionPenalty(shape, context);
    const score =
      contextualScore * SHAPE_VARIETY_WEIGHTS[shape.id] +
      deterministicTieJitter(drawContext, `shape:${shape.id}:tie`, 0.02);

    return {
      shapeId: shape.id,
      score: Number(Math.max(0.5, score).toFixed(6)),
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
  return weightedChoice(
    drawContext,
    "root:shape",
    scores.map((entry) => ({
      item: entry.shapeId,
      weight: entry.score,
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
    ...(previousPick.sequenceStatus !== undefined ? { sequenceStatus: previousPick.sequenceStatus } : {}),
  };
}

function sequenceMenuKey(step: number): string {
  return `step${step}`;
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

function isJourneyShapeId(value: string): value is JourneyShapeDefinition["id"] {
  return JOURNEY_SHAPES.some((shape) => shape.id === value);
}

export function generateNextJourney(input: GenerationInput): JourneyManifest {
  const { context, previousPick } = input;
  const drawContext: DrawContext = {
    seed: context.state.quest.seed,
    contentVersion: context.contentVersion,
    rootJourneyIndex: context.state.generator.rootJourneyIndex,
  };
  const stage = input.forcedStage ?? stageForDreamscape(context.state.quest.resources.dreamscape);
  const selectedTags = desiredTagsFor(context, stage);
  const shapeScores = scoreShapes(context, drawContext, selectedTags, previousPick);
  const selectedShapeId = input.forcedShapeId
    ? isJourneyShapeId(input.forcedShapeId)
      ? input.forcedShapeId
      : (() => {
          throw new Error(`Unknown Journey shape: ${input.forcedShapeId}`);
        })()
    : selectShape(drawContext, shapeScores);
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
    : repairOrFallbackJourney(manifest, context, validation, {
        forcedShape: input.forcedShapeId !== undefined,
      });

  if (input.forcedShapeId && finalManifest.shapeId !== input.forcedShapeId) {
    throw new Error(`Forced shape ${input.forcedShapeId} could not be generated legally`);
  }

  const finalValidation = validateJourneyManifest(finalManifest, context);

  if (!finalValidation.ok && input.forcedShapeId) {
    throw new Error(
      `Forced shape ${input.forcedShapeId} failed validation: ${finalValidation.message}`,
    );
  }

  return freezeSerializable(finalManifest);
}

function cloneOptions(options: readonly JourneyOption[]): JourneyOption[] {
  return options.map((journeyOption) => ({
    ...journeyOption,
    symbols: [...journeyOption.symbols],
    costs: [...journeyOption.costs],
    effects: [...journeyOption.effects],
    burdens: [...journeyOption.burdens],
    targets: [...journeyOption.targets],
    triggers: [...journeyOption.triggers],
    routeEffects: [...journeyOption.routeEffects],
  }));
}

export function advanceSequenceJourney(input: SequenceAdvanceInput): SequenceAdvanceResult {
  const { context, manifest, selectedOptionNumber } = input;

  if (!manifest.sequence || manifest.sequence.status !== "active") {
    throw new Error("Cannot advance a manifest without an active sequence");
  }

  const selectedOption = manifest.options.find((option) => option.number === selectedOptionNumber);

  if (!selectedOption) {
    throw new Error(`Option ${selectedOptionNumber} is not available in ${manifest.journeyId}`);
  }

  if (selectedOption.pickBehavior === "complete_sequence") {
    return {
      kind: "complete",
      journeyId: manifest.journeyId,
      rootJourneyIndex: manifest.rootJourneyIndex,
      sequence: { ...manifest.sequence, status: "complete" },
      shouldGenerateNextRoot: true,
    };
  }

  if (selectedOption.pickBehavior === "leave") {
    return {
      kind: "left",
      journeyId: manifest.journeyId,
      rootJourneyIndex: manifest.rootJourneyIndex,
      sequence: { ...manifest.sequence, status: "left" },
      shouldGenerateNextRoot: true,
    };
  }

  if (selectedOption.pickBehavior !== "advance_sequence") {
    throw new Error(`Option ${selectedOptionNumber} does not advance a sequence`);
  }

  const nextStep = manifest.sequence.step + 1;
  const maxSteps = manifest.sequence.maxSteps ?? nextStep;

  if (nextStep > maxSteps) {
    return {
      kind: "complete",
      journeyId: manifest.journeyId,
      rootJourneyIndex: manifest.rootJourneyIndex,
      sequence: { ...manifest.sequence, status: "complete" },
      shouldGenerateNextRoot: true,
    };
  }

  const nextMenu = manifest.precommitted.sequenceMenus?.[sequenceMenuKey(nextStep)];

  if (!nextMenu) {
    throw new Error(`Missing precommitted sequence menu for step ${nextStep}`);
  }

  const options = cloneOptions(nextMenu);
  const advanced: JourneyManifest = {
    ...manifest,
    options,
    sequence: {
      ...manifest.sequence,
      step: nextStep,
      status: "active",
    },
    debug: {
      ...manifest.debug,
      optionValues: options.map((journeyOption) =>
        evaluateOptionValue(journeyOption, context),
      ),
    },
  };
  const validation = validateJourneyManifest(advanced, context);

  if (!validation.ok) {
    throw new Error(`Advanced sequence manifest failed validation: ${validation.rule}`);
  }

  return {
    kind: "advanced",
    manifest: freezeSerializable(advanced),
  };
}
