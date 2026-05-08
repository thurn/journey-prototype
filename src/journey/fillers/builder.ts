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
} from "../manifest.js";
import {
  MANIFEST_CONTRACT_VERSION,
  MANIFEST_SCHEMA_VERSION,
} from "../manifest.js";
import { adaptPrecommittedOperations } from "../operationAdapters.js";
import {
  JOURNEY_SHAPE_CATALOG_VERSION,
  getShapePlugin,
  type FilledJourney,
} from "../shapes.js";
import { VALIDATION_CONTRACT_VERSION } from "../validate/index.js";
import {
  VALUE_MODEL_VERSION,
  evaluateOptionValue,
  type ValueBreakdown,
} from "../value.js";
import { buildDebugFixtureOverride } from "../fixtures/debug/registry.js";
import {
  semanticFingerprintFor,
  withDistinctnessFingerprint,
} from "./fingerprint.js";
import { naturalGeneratedObjectKind } from "./generatedObjectSelection.js";
import {
  generatedObjectDefinition,
  generatedObjectOptions,
} from "./generatedObjects.js";
import {
  BuildArgs,
  referencesFor,
  selectedCardTargets,
  selectedDreamsignTargets,
} from "./shared.js";

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
    generatedObjectDefinition({
      kind: generatedKind,
      drawContext: args.drawContext,
      shapeId: args.shapeId,
      stage: args.stage,
      cards: sources.cards,
      dreamsigns: sources.dreamsigns,
    }),
  ];
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
  const plugin = getShapePlugin(args.shapeId);
  const shape = plugin.definition;
  const baseFilled = plugin.fill({
    context: args.context,
    drawContext: args.drawContext,
  });
  const debugOverride = args.debugPayload
    ? buildDebugFixtureOverride({
        context: args.context,
        drawContext: args.drawContext,
        shapeId: args.shapeId,
        stage: args.stage,
        debugPayload: args.debugPayload,
        baseFilled,
      })
    : undefined;
  const filled = debugOverride?.filled ?? baseFilled;
  const generatedKind = args.debugPayload
    ? undefined
    : naturalGeneratedObjectKind(args);
  const naturalGeneratedObjects = generatedObjectsFor(generatedKind, args, {
    cards: selectedCards,
    dreamsigns: selectedDreamsigns,
  });
  const generatedObjects =
    debugOverride?.generatedObjects ?? naturalGeneratedObjects;
  const generatedObject = generatedObjects[0];
  const options =
    debugOverride?.options ??
    (generatedObject
      ? generatedObjectOptions(generatedObject)
      : filled.options.slice(0, shape.rootOptionCount.max));
  const legacyPrecommittedWithPairedReturn = debugOverride?.precommitted ?? {
    ...filled.precommitted,
    ...(generatedKind
      ? {
          delayed: [
            ...(filled.precommitted.delayed ?? []),
            ...options.flatMap((journeyOption) => journeyOption.triggers),
          ],
        }
      : {}),
  };
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
      [
        options,
        generatedObjects,
        filled.tree,
        filled.rewardPool,
        precommitted,
      ],
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

export function allowedGeneratedVocabulary() {
  return {
    banes: [...BANE_NAMES],
    transfigurations: [...STANDARD_TRANSFIGURATIONS],
  };
}
