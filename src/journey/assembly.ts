import type { ContentBundle } from "../content/model.js";
import type { JourneyContext } from "../quest/context.js";
import type { DrawContext } from "../util/rng.js";
import { shuffleDeterministic } from "../util/rng.js";
import { RENDERER_VERSION } from "../render/theme.js";
import {
  BANE_NAMES,
  EFFECT_CATALOG_VERSION,
  STANDARD_TRANSFIGURATIONS,
  attachTargetResolutionMetadata,
  isBaneName,
  resolveCardTargets,
  resolveDreamsignTargets,
} from "./effects.js";
import type {
  GeneratedObjectDefinition,
  JourneyManifest,
  JourneyOption,
  JourneyStage,
  JourneyTree,
  ManifestReferences,
  PrecommittedOutcomes,
  RandomPrecommittedOutcome,
} from "./manifest.js";
import {
  MANIFEST_CONTRACT_VERSION,
  MANIFEST_SCHEMA_VERSION,
} from "./manifest.js";
import {
  JOURNEY_SHAPE_CATALOG_VERSION,
  getShapePlugin,
  type FilledJourney,
  type JourneyShapeId,
} from "./shapes.js";
import {
  VALUE_MODEL_VERSION,
  evaluateOptionValue,
  type ValueBreakdown,
} from "./value.js";

export type BuildJourneyArgs = {
  context: JourneyContext;
  drawContext: DrawContext;
  journeyId: string;
  shapeId: JourneyShapeId;
  stage: JourneyStage;
  selectedTags: string[];
  shapeScores: { shapeId: JourneyShapeId; score: number }[];
  previousPick?: JourneyManifest["debug"]["previousPick"];
};

function optionalFilledManifestFields(
  filled: FilledJourney,
  tree: JourneyTree | undefined,
): Pick<JourneyManifest, "tree" | "rewardPool" | "sequence" | "presentation"> {
  const fields: Pick<
    JourneyManifest,
    "tree" | "rewardPool" | "sequence" | "presentation"
  > = {};

  if (filled.presentation) {
    fields.presentation = filled.presentation;
  }

  if (tree) {
    fields.tree = tree;
  }

  if (filled.rewardPool) {
    fields.rewardPool = filled.rewardPool;
  }

  if (filled.sequence) {
    fields.sequence = filled.sequence;
  }

  return fields;
}

function automaticLeaveEnabled(shapeId: JourneyShapeId): boolean {
  return getShapePlugin(shapeId).definition.automaticLeave !== false;
}

function automaticLeaveOption(number: number): JourneyOption {
  return {
    number,
    symbols: [],
    text: "Leave.",
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence: 0,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: 0,
    pickBehavior: "leave",
  };
}

function withAutomaticLeaveOptions(
  shapeId: JourneyShapeId,
  options: readonly JourneyOption[],
  tree: JourneyTree | undefined,
): JourneyOption[] {
  if (!automaticLeaveEnabled(shapeId) || tree) {
    return [...options];
  }

  const meaningfulOptions = options
    .filter((option) => option.pickBehavior !== "leave")
    .map((option, index) => ({ ...option, number: index + 1 }));

  return [
    ...meaningfulOptions,
    automaticLeaveOption(meaningfulOptions.length + 1),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function naturalResourceRandomPrecommits(
  options: readonly JourneyOption[],
): RandomPrecommittedOutcome[] {
  return options.flatMap((journeyOption) =>
    [
      ...journeyOption.costs,
      ...journeyOption.effects,
      ...journeyOption.burdens,
    ]
      .flatMap((payload): RandomPrecommittedOutcome[] => {
        if (
          !isRecord(payload) ||
          (payload.kind !== "resource_random_range" &&
            payload.resourceAmountKind !== "random_range") ||
          (payload.resource !== "essence" && payload.resource !== "omens") ||
          typeof payload.minimum !== "number" ||
          typeof payload.maximum !== "number" ||
          typeof payload.amount !== "number"
        ) {
          return [];
        }

        return [{
          optionNumber: journeyOption.number,
          kind: "resource_random_range",
          resource: payload.resource,
          minimum: payload.minimum,
          maximum: payload.maximum,
          committedAmount: payload.amount,
        }];
      }),
  );
}

function selectedCardTargets(
  context: JourneyContext,
  drawContext: DrawContext,
) {
  const selected = resolveCardTargets(context.content, context.state.quest, {
    source: "draftPool",
    tideOverlap: "selected",
  });
  const fallback = resolveCardTargets(context.content, context.state.quest, {
    source: "draftPool",
  });

  return shuffleDeterministic(
    drawContext,
    "targets:cards",
    selected.length > 0 ? selected : fallback,
  );
}

function selectedDreamsignTargets(
  context: JourneyContext,
  drawContext: DrawContext,
) {
  const selected = resolveDreamsignTargets(
    context.content,
    context.state.quest,
    {
      source: "pool",
      tideOverlap: "selected",
    },
  );
  const fallback = resolveDreamsignTargets(
    context.content,
    context.state.quest,
    {
      source: "pool",
    },
  );

  return shuffleDeterministic(
    drawContext,
    "targets:dreamsigns",
    selected.length > 0 ? selected : fallback,
  );
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
}

function addBaneReference(references: Set<string>, value: unknown): void {
  if (typeof value === "string" && isBaneName(value)) {
    references.add(value);
  }
}

function collectBaneReferencesFromValue(
  value: unknown,
  references: Set<string>,
): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectBaneReferencesFromValue(entry, references));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  addBaneReference(references, value.baneName);
  addBaneReference(references, value.newBaneName);

  if (Array.isArray(value.baneNames)) {
    value.baneNames.forEach((entry) => addBaneReference(references, entry));
  }

  if (Array.isArray(value.banes)) {
    value.banes.forEach((entry) => addBaneReference(references, entry));
  }

  if (
    (value.kind === "bane" || value.selectorKind === "bane") &&
    Array.isArray(value.names)
  ) {
    value.names.forEach((entry) => addBaneReference(references, entry));
  }

  Object.values(value).forEach((entry) =>
    collectBaneReferencesFromValue(entry, references),
  );
}

function collectBaneReferences(values: readonly unknown[]): string[] {
  const references = new Set<string>();

  values.forEach((value) => collectBaneReferencesFromValue(value, references));

  return uniqueSorted([...references]);
}

function referencesFor(
  content: ContentBundle,
  cardIds: readonly string[],
  dreamsignIds: readonly string[],
  baneReferenceSources: readonly unknown[] = [],
): ManifestReferences {
  const dreamcallerIds = content.dreamcallers.map(
    (dreamcaller) => dreamcaller.id,
  );

  return {
    cardIds: uniqueSorted(cardIds),
    dreamsignIds: uniqueSorted(dreamsignIds),
    dreamcallerIds: uniqueSorted(dreamcallerIds),
    baneNames: collectBaneReferences(baneReferenceSources),
  };
}

function previousPickDebug(args: BuildJourneyArgs): {
  previousPick?: JourneyManifest["debug"]["previousPick"];
} {
  if (!args.previousPick) {
    return {};
  }

  return { previousPick: args.previousPick };
}

export function buildJourneyForShape(args: BuildJourneyArgs): JourneyManifest {
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
  const filled = plugin.fill({
    context: args.context,
    drawContext: args.drawContext,
    stage: args.stage,
  });
  const tree = filled.tree;
  const options = withAutomaticLeaveOptions(
    args.shapeId,
    filled.options.slice(0, shape.rootOptionCount.max),
    tree,
  );
  const resourceRandomPrecommits = naturalResourceRandomPrecommits(options);
  const legacyPrecommitted: PrecommittedOutcomes = {
    ...filled.precommitted,
    ...(resourceRandomPrecommits.length > 0
      ? {
          random: [
            ...(filled.precommitted.random ?? []),
            ...resourceRandomPrecommits,
          ],
        }
      : {}),
  };
  const precommitted = {
    ...legacyPrecommitted,
    operations: filled.precommitted.operations ?? [],
  };
  const optionValues: ValueBreakdown[] = options.map((journeyOption) =>
    evaluateOptionValue(journeyOption, args.context),
  );
  const symmetryContracts = filled.symmetryContracts;
  const generatedObjects: GeneratedObjectDefinition[] = [
    ...(filled.generatedObjects ?? []),
  ];

  const manifest: JourneyManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    versions: {
      contentVersion: args.context.contentVersion,
      shapeCatalogVersion: JOURNEY_SHAPE_CATALOG_VERSION,
      effectCatalogVersion: EFFECT_CATALOG_VERSION,
      valueModelVersion: VALUE_MODEL_VERSION,
      rendererVersion: RENDERER_VERSION,
      manifestContractVersion: MANIFEST_CONTRACT_VERSION,
    },
    journeyId: args.journeyId,
    seed: args.context.state.quest.seed,
    rootJourneyIndex: args.context.state.generator.rootJourneyIndex,
    shapeId: args.shapeId,
    stage: args.stage,
    dreamscape: args.context.state.quest.resources.dreamscape,
    selectedTags: args.selectedTags,
    options,
    generatedObjects,
    ...optionalFilledManifestFields(filled, tree),
    precommitted,
    debug: {
      shapeScores: args.shapeScores,
      selectedShapeId: args.shapeId,
      selectedTags: args.selectedTags,
      optionValues,
      ...(symmetryContracts && symmetryContracts.length > 0
        ? { symmetryContracts: [...symmetryContracts] }
        : {}),
      ...previousPickDebug(args),
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

  return attachTargetResolutionMetadata(
    manifest,
    args.context.content,
    args.context.state.quest,
  );
}

export function allowedGeneratedVocabulary() {
  return {
    banes: [...BANE_NAMES],
    transfigurations: [...STANDARD_TRANSFIGURATIONS],
  };
}
