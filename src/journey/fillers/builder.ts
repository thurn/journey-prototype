import { RENDERER_VERSION } from "../../render/theme.js";
import {
  BANE_NAMES,
  EFFECT_CATALOG_VERSION,
  STANDARD_TRANSFIGURATIONS,
  attachTargetResolutionMetadata,
} from "../effects.js";
import type {
  GeneratedObjectDefinition,
  JourneyManifest,
  JourneyOption,
  PrecommittedOutcomes,
  RandomPrecommittedOutcome,
} from "../manifest.js";
import {
  MANIFEST_CONTRACT_VERSION,
  MANIFEST_SCHEMA_VERSION,
} from "../manifest.js";
import { adaptPrecommittedOperations } from "../operationAdapters.js";
import {
  JOURNEY_SHAPE_CATALOG_VERSION,
  getShapeDefinition,
  type JourneyShapeId,
} from "../shapes.js";
import { VALIDATION_CONTRACT_VERSION } from "../validate/index.js";
import {
  VALUE_MODEL_VERSION,
  evaluateOptionValue,
  type ValueBreakdown,
} from "../value.js";
import { baneGainPurgeTransformOptions } from "./banePayloads.js";
import {
  generatedObjectVariant,
  isBaneGainPurgeTransformPayload,
  isCompleteDecisionTreePayload,
  isDelayedTriggerMatrixPayload,
  isDreamsignTransformDuplicatePoolPayload,
  isDreamwellWindowPayload,
  isNamedCardOperationMenuPayload,
  isNamedDreamsignShopRowPayload,
  isPairedReturnSealBorrowTradePayload,
  isRandomRevealRollWagerPayload,
  isResourceEdgeCasePayload,
  isRouteEditsPayload,
  isShopEconomyPayload,
  isStarterCleanupReplacementPayload,
  isStatusRewardReplacementPayload,
  naturalGeneratedObjectKind,
} from "./debugPayloadRouting.js";
import { withCompleteDecisionTreePayload } from "./decisionTreePayload.js";
import {
  dreamsignTransformDuplicatePoolOptions,
  namedDreamsignShopRowOptions,
} from "./dreamsignPayloads.js";
import {
  dreamwellWindowOptions,
  routeEditOptions,
  shopEconomyOptions,
  statusRewardReplacementOptions,
} from "./environmentPayloads.js";
import {
  semanticFingerprintFor,
  withDistinctnessFingerprint,
} from "./fingerprint.js";
import {
  generatedObjectDefinition,
  generatedObjectOptions,
} from "./generatedObjects.js";
import {
  delayedTriggerMatrixOptions,
  pairedReturnSealBorrowTradeOptions,
} from "./hookPayloads.js";
import {
  namedCardOperationOptions,
  starterCleanupReplacementOptions,
} from "./namedCardPayloads.js";
import { randomRevealRollWagerFill } from "./randomPayloads.js";
import { resourceEdgeCaseOptions } from "./resourcePayloads.js";
import { fillOptions } from "./shapeFills.js";
import {
  BuildArgs,
  referencesFor,
  selectedCardTargets,
  selectedDreamsignTargets,
} from "./shared.js";
import {
  forcedTimedPayloadPrecommits,
  withResourceEdgeCaseValueBands,
} from "./valueBands.js";

type FilledJourney = ReturnType<typeof fillOptions>;
type RandomRevealRollWagerFill =
  | ReturnType<typeof randomRevealRollWagerFill>
  | undefined;

function completeDecisionTreeFill(
  args: BuildArgs,
  baseFilled: FilledJourney,
): FilledJourney {
  if (isCompleteDecisionTreePayload(args.debugPayload)) {
    return withCompleteDecisionTreePayload(args.shapeId, baseFilled);
  }

  return baseFilled;
}

function generatedObjectsFor(
  generatedKind: GeneratedObjectDefinition["generatedObjectKind"] | undefined,
  args: BuildArgs,
  sources: {
    cards: ReturnType<typeof selectedCardTargets>;
    dreamsigns: ReturnType<typeof selectedDreamsignTargets>;
  },
): GeneratedObjectDefinition[] {
  if (!generatedKind) {
    return [];
  }

  return [
    generatedObjectDefinition(
      args.debugPayload
        ? { kind: generatedKind, fixture: true }
        : {
            kind: generatedKind,
            drawContext: args.drawContext,
            shapeId: args.shapeId,
            stage: args.stage,
            cards: sources.cards,
            dreamsigns: sources.dreamsigns,
          },
    ),
  ];
}

function randomRevealRollWagerFor(args: BuildArgs): RandomRevealRollWagerFill {
  if (!isRandomRevealRollWagerPayload(args.debugPayload)) {
    return undefined;
  }

  return randomRevealRollWagerFill(args.context, args.drawContext);
}

function selectFilledOptions(args: {
  build: BuildArgs;
  filled: FilledJourney;
  generatedObjects: readonly GeneratedObjectDefinition[];
  randomRevealRollWager: RandomRevealRollWagerFill;
  rootOptionLimit: number;
}): JourneyOption[] {
  const { build, filled, generatedObjects, randomRevealRollWager } = args;

  if (isNamedCardOperationMenuPayload(build.debugPayload)) {
    return namedCardOperationOptions(build.context, build.drawContext);
  }

  if (isStarterCleanupReplacementPayload(build.debugPayload)) {
    return starterCleanupReplacementOptions(build.context, build.drawContext);
  }

  if (isNamedDreamsignShopRowPayload(build.debugPayload)) {
    return namedDreamsignShopRowOptions(build.context, build.drawContext);
  }

  if (isDreamsignTransformDuplicatePoolPayload(build.debugPayload)) {
    return dreamsignTransformDuplicatePoolOptions(
      build.context,
      build.drawContext,
    );
  }

  if (isBaneGainPurgeTransformPayload(build.debugPayload)) {
    return baneGainPurgeTransformOptions(build.context, build.drawContext);
  }

  if (isResourceEdgeCasePayload(build.debugPayload)) {
    return resourceEdgeCaseOptions(build.context);
  }

  if (isRouteEditsPayload(build.debugPayload)) {
    return routeEditOptions();
  }

  if (isShopEconomyPayload(build.debugPayload)) {
    return shopEconomyOptions();
  }

  if (isDreamwellWindowPayload(build.debugPayload)) {
    return dreamwellWindowOptions();
  }

  if (isStatusRewardReplacementPayload(build.debugPayload)) {
    return statusRewardReplacementOptions();
  }

  if (isDelayedTriggerMatrixPayload(build.debugPayload)) {
    return delayedTriggerMatrixOptions(build.context, build.drawContext);
  }

  if (isPairedReturnSealBorrowTradePayload(build.debugPayload)) {
    return pairedReturnSealBorrowTradeOptions(build.context, build.drawContext);
  }

  const generatedObject = generatedObjects[0];
  if (generatedObject) {
    return generatedObjectOptions(generatedObject);
  }

  if (randomRevealRollWager) {
    return randomRevealRollWager.options;
  }

  return filled.options.slice(0, args.rootOptionLimit);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function payloadKindIs(kind: string) {
  return (payload: unknown): payload is Record<string, unknown> =>
    isRecord(payload) && payload.kind === kind;
}

function stringProperty(
  payload: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const value = payload[key];

  if (typeof value === "string") {
    return value;
  }

  return fallback;
}

function collectCardDelayedPrecommits(
  args: BuildArgs,
  options: readonly JourneyOption[],
): unknown[] {
  if (!isNamedCardOperationMenuPayload(args.debugPayload)) {
    return [];
  }

  return options.flatMap((journeyOption) =>
    journeyOption.effects
      .filter(payloadKindIs("card_delayed_transformation"))
      .map((effect) => ({
        optionNumber: journeyOption.number,
        trigger: stringProperty(effect, "trigger", "after next victory"),
        reward: effect,
      })),
  );
}

function collectDreamsignDelayedPrecommits(
  args: BuildArgs,
  options: readonly JourneyOption[],
): unknown[] {
  if (!isDreamsignTransformDuplicatePoolPayload(args.debugPayload)) {
    return [];
  }

  return options.flatMap((journeyOption) =>
    journeyOption.effects
      .filter(payloadKindIs("dreamsign_trade_hook"))
      .map((effect) => ({
        optionNumber: journeyOption.number,
        trigger: stringProperty(effect, "timing", "after next battle"),
        reward: effect,
      })),
  );
}

function collectDreamsignRandomPrecommits(
  args: BuildArgs,
  options: readonly JourneyOption[],
): RandomPrecommittedOutcome[] {
  if (!isDreamsignTransformDuplicatePoolPayload(args.debugPayload)) {
    return [];
  }

  return options.flatMap((journeyOption) =>
    journeyOption.effects
      .filter(payloadKindIs("dreamsign_random_reward"))
      .map((effect) => ({
        optionNumber: journeyOption.number,
        kind: "dreamsign_random_reward",
        rewardPoolDreamsignIds: effect.rewardPoolDreamsignIds,
        selectedDreamsignId: effect.dreamsignId,
        selectedDreamsignName: effect.dreamsignName,
        odds: effect.odds,
      })),
  );
}

function collectBaneRandomPrecommits(
  args: BuildArgs,
  options: readonly JourneyOption[],
): RandomPrecommittedOutcome[] {
  if (!isBaneGainPurgeTransformPayload(args.debugPayload)) {
    return [];
  }

  return options.flatMap((journeyOption) =>
    journeyOption.effects
      .filter(payloadKindIs("bane_random_purge"))
      .map((effect) => ({
        optionNumber: journeyOption.number,
        kind: "bane_random_purge",
        baneName: effect.baneName,
        baneTargetContext: effect.baneTargetContext,
        committedResult: "purged",
      })),
  );
}

function collectResourceRandomPrecommits(
  args: BuildArgs,
  options: readonly JourneyOption[],
): RandomPrecommittedOutcome[] {
  if (!isResourceEdgeCasePayload(args.debugPayload)) {
    return [];
  }

  return options.flatMap((journeyOption) =>
    journeyOption.effects
      .filter(payloadKindIs("resource_random_range"))
      .map((effect) => ({
        optionNumber: journeyOption.number,
        kind: "resource_random_range",
        resource: effect.resource,
        minimum: effect.minimum,
        maximum: effect.maximum,
        committedAmount: effect.amount,
      })),
  );
}

function selectBasePrecommitted(
  args: BuildArgs,
  filled: FilledJourney,
  randomRevealRollWager: RandomRevealRollWagerFill,
): PrecommittedOutcomes {
  if (isPairedReturnSealBorrowTradePayload(args.debugPayload)) {
    return {};
  }

  if (randomRevealRollWager) {
    return randomRevealRollWager.precommitted;
  }

  return filled.precommitted;
}

function collectDelayedPrecommits(args: {
  build: BuildArgs;
  generatedKind: GeneratedObjectDefinition["generatedObjectKind"] | undefined;
  options: readonly JourneyOption[];
}): unknown[] {
  const delayed = [
    ...collectCardDelayedPrecommits(args.build, args.options),
    ...collectDreamsignDelayedPrecommits(args.build, args.options),
    ...forcedTimedPayloadPrecommits(args.build.debugPayload, args.options),
  ];

  if (args.generatedKind) {
    delayed.push(
      ...args.options.flatMap((journeyOption) => journeyOption.triggers),
    );
  }

  if (isDelayedTriggerMatrixPayload(args.build.debugPayload)) {
    delayed.push(
      ...args.options.flatMap((journeyOption) => journeyOption.triggers),
    );
  }

  if (isPairedReturnSealBorrowTradePayload(args.build.debugPayload)) {
    delayed.push(
      ...args.options.flatMap((journeyOption) => journeyOption.triggers),
    );
  }

  return delayed;
}

function collectRandomPrecommits(
  args: BuildArgs,
  options: readonly JourneyOption[],
): RandomPrecommittedOutcome[] {
  return [
    ...collectDreamsignRandomPrecommits(args, options),
    ...collectBaneRandomPrecommits(args, options),
    ...collectResourceRandomPrecommits(args, options),
  ];
}

function addDelayedPrecommits(
  basePrecommitted: PrecommittedOutcomes,
  delayedPrecommits: readonly unknown[],
): PrecommittedOutcomes {
  if (delayedPrecommits.length === 0) {
    return basePrecommitted;
  }

  return {
    ...basePrecommitted,
    delayed: [...(basePrecommitted.delayed ?? []), ...delayedPrecommits],
  };
}

function addRandomPrecommits(
  basePrecommitted: PrecommittedOutcomes,
  randomPrecommits: readonly RandomPrecommittedOutcome[],
): PrecommittedOutcomes {
  if (randomPrecommits.length === 0) {
    return basePrecommitted;
  }

  return {
    ...basePrecommitted,
    random: [...(basePrecommitted.random ?? []), ...randomPrecommits],
  };
}

function addRouteEdits(
  basePrecommitted: PrecommittedOutcomes,
  options: readonly JourneyOption[],
): PrecommittedOutcomes {
  const optionRouteEffects = options.flatMap(
    (journeyOption) => journeyOption.routeEffects,
  );

  if (optionRouteEffects.length === 0 || basePrecommitted.routeEdits) {
    return basePrecommitted;
  }

  return {
    ...basePrecommitted,
    routeEdits: optionRouteEffects,
  };
}

function addPairedReturnPrecommits(
  args: BuildArgs,
  basePrecommitted: PrecommittedOutcomes,
  options: readonly JourneyOption[],
): PrecommittedOutcomes {
  if (!isPairedReturnSealBorrowTradePayload(args.debugPayload)) {
    return basePrecommitted;
  }

  return {
    ...basePrecommitted,
    pairedReturn: [
      ...(basePrecommitted.pairedReturn ?? []),
      ...options.flatMap((journeyOption) => journeyOption.triggers),
    ],
  };
}

function buildPrecommittedOutcomes(args: {
  build: BuildArgs;
  filled: FilledJourney;
  generatedKind: GeneratedObjectDefinition["generatedObjectKind"] | undefined;
  options: readonly JourneyOption[];
  randomRevealRollWager: RandomRevealRollWagerFill;
}): PrecommittedOutcomes {
  const basePrecommitted = selectBasePrecommitted(
    args.build,
    args.filled,
    args.randomRevealRollWager,
  );
  const withDelayedPrecommits = addDelayedPrecommits(
    basePrecommitted,
    collectDelayedPrecommits({
      build: args.build,
      generatedKind: args.generatedKind,
      options: args.options,
    }),
  );
  const withRandomPrecommits = addRandomPrecommits(
    withDelayedPrecommits,
    collectRandomPrecommits(args.build, args.options),
  );
  const withRouteEdits = addRouteEdits(withRandomPrecommits, args.options);

  return addPairedReturnPrecommits(args.build, withRouteEdits, args.options);
}

function applyForcedOptionPostProcessing(
  args: BuildArgs,
  filledOptions: JourneyOption[],
): JourneyOption[] {
  if (isResourceEdgeCasePayload(args.debugPayload)) {
    return withResourceEdgeCaseValueBands(filledOptions);
  }

  return filledOptions;
}

function optionalFilledManifestFields(
  filled: FilledJourney,
): Pick<JourneyManifest, "tree" | "rewardPool"> {
  const fields: Pick<JourneyManifest, "tree" | "rewardPool"> = {};

  if (filled.tree) {
    fields.tree = filled.tree;
  }

  if (filled.rewardPool) {
    fields.rewardPool = filled.rewardPool;
  }

  return fields;
}

function repairPayloadFamily(args: BuildArgs): string {
  if (args.debugPayload) {
    return args.debugPayload.familyId;
  }

  return "adapter";
}

function previousPickDebug(args: BuildArgs): {
  previousPick?: JourneyManifest["debug"]["previousPick"];
} {
  if (!args.previousPick) {
    return {};
  }

  return { previousPick: args.previousPick };
}

function forcedDebugPayloadDebug(args: BuildArgs): {
  debugPayload?: NonNullable<JourneyManifest["debug"]["debugPayload"]>;
} {
  if (!args.debugPayload) {
    return {};
  }

  return { debugPayload: { ...args.debugPayload, source: "forced" } };
}

export function buildConservativeJourneyForShape(
  args: BuildArgs,
): JourneyManifest {
  const selectedCards = selectedCardTargets(
    args.context,
    args.drawContext,
  ).slice(0, 3);
  const selectedDreamsigns = selectedDreamsignTargets(
    args.context,
    args.drawContext,
  ).slice(0, 3);
  const shape = getShapeDefinition(args.shapeId);
  const baseFilled = fillOptions(args.shapeId, args.context, args.drawContext);
  const filled = completeDecisionTreeFill(args, baseFilled);
  const generatedKind =
    generatedObjectVariant(args.debugPayload) ??
    naturalGeneratedObjectKind(args);
  const generatedObjects = generatedObjectsFor(generatedKind, args, {
    cards: selectedCards,
    dreamsigns: selectedDreamsigns,
  });
  const randomRevealRollWager = randomRevealRollWagerFor(args);
  const filledOptions = selectFilledOptions({
    build: args,
    filled,
    generatedObjects,
    randomRevealRollWager,
    rootOptionLimit: shape.rootOptionCount.max,
  });
  const options = applyForcedOptionPostProcessing(args, filledOptions);
  const legacyPrecommittedWithPairedReturn = buildPrecommittedOutcomes({
    build: args,
    filled,
    generatedKind,
    options,
    randomRevealRollWager,
  });
  const precommitted = {
    ...legacyPrecommittedWithPairedReturn,
    operations: adaptPrecommittedOperations(legacyPrecommittedWithPairedReturn),
  };
  const optionValues: ValueBreakdown[] = options.map((journeyOption) =>
    evaluateOptionValue(journeyOption, args.context),
  );
  const semanticFingerprint = semanticFingerprintFor({
    shapeId: args.shapeId,
    stage: args.stage,
    selectedTags: args.selectedTags,
    debugPayload: args.debugPayload,
    options,
    tree: filled.tree,
    rewardPool: filled.rewardPool,
    generatedObjects,
    precommitted,
  });

  const manifest: JourneyManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    versions: {
      contentVersion: args.context.contentVersion,
      shapeCatalogVersion: JOURNEY_SHAPE_CATALOG_VERSION,
      effectCatalogVersion: EFFECT_CATALOG_VERSION,
      valueModelVersion: VALUE_MODEL_VERSION,
      rendererVersion: RENDERER_VERSION,
      manifestContractVersion: MANIFEST_CONTRACT_VERSION,
      validationContractVersion: VALIDATION_CONTRACT_VERSION,
    },
    journeyId: args.journeyId,
    seed: args.context.state.quest.seed,
    rootJourneyIndex: args.context.state.generator.rootJourneyIndex,
    shapeId: args.shapeId,
    stage: args.stage,
    dreamscape: args.context.state.quest.resources.dreamscape,
    selectedTags: args.selectedTags,
    options,
    distinctness: semanticFingerprint,
    generatedObjects,
    ...optionalFilledManifestFields(filled),
    precommitted,
    debug: {
      shapeScores: args.shapeScores,
      selectedShapeId: args.shapeId,
      selectedTags: args.selectedTags,
      optionValues,
      repairs: [],
      semanticFingerprint,
      validation: {
        ok: true,
        passed: 0,
        failed: 0,
        rules: [],
      },
      repair: {
        status: "accepted_immediately",
        forcedShape: false,
        finalShapeId: args.shapeId,
        payloadFamily: repairPayloadFamily(args),
      },
      ...previousPickDebug(args),
      ...forcedDebugPayloadDebug(args),
    },
    references: referencesFor(
      args.context.content,
      selectedCards.map((card) => card.id),
      selectedDreamsigns.map((dreamsign) => dreamsign.id),
    ),
  };

  const manifestWithTargetResolution = attachTargetResolutionMetadata(
    manifest,
    args.context.content,
    args.context.state.quest,
  );

  return withDistinctnessFingerprint({
    ...manifestWithTargetResolution,
  });
}

export const FALLBACK_SHAPE_IDS = Object.freeze([
  "curated_reward_trio",
  "single_reward",
  "service_menu",
] as const satisfies readonly JourneyShapeId[]);

export function fallbackShapeIds(): readonly JourneyShapeId[] {
  return FALLBACK_SHAPE_IDS;
}

export function allowedGeneratedVocabulary() {
  return {
    banes: [...BANE_NAMES],
    transfigurations: [...STANDARD_TRANSFIGURATIONS],
  };
}
