import type { JourneyManifest, JourneyOption } from "../journey/manifest.js";
import { JOURNEY_SHAPE_CATALOG_VERSION } from "../journey/shapes.js";
import type { JourneyState, PickHistoryEntry } from "../state/schema.js";
import { stableStringify } from "../util/stableJson.js";
import type { CommonCommandOptions } from "../commands/options.js";
import type { debugPayloadListJson } from "../journey/debugPayloads.js";

function optionJson(option: JourneyOption) {
  return {
    number: option.number,
    symbols: option.symbols,
    text: option.text,
    pickBehavior: option.pickBehavior,
    operations: option.operations,
    costs: option.costs,
    effects: option.effects,
    burdens: option.burdens,
    targets: option.targets,
    triggers: option.triggers,
    routeEffects: option.routeEffects,
    convertedEssence: {
      cost: option.costConvertedEssence,
      effect: option.effectConvertedEssence,
      burden: option.burdenConvertedEssence,
      uncertainty: option.uncertaintyConvertedEssence,
      net: option.netConvertedEssence,
    },
  };
}

function manifestJson(manifest: JourneyManifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    versions: manifest.versions,
    journeyId: manifest.journeyId,
    seed: manifest.seed,
    rootJourneyIndex: manifest.rootJourneyIndex,
    shapeId: manifest.shapeId,
    stage: manifest.stage,
    dreamscape: manifest.dreamscape,
    selectedTags: manifest.selectedTags,
    sequence: manifest.sequence,
    generatedObjects: manifest.generatedObjects,
    options: manifest.options.map(optionJson),
    tree: manifest.tree,
    rewardPool: manifest.rewardPool,
    precommitted: manifest.precommitted,
    debug: manifest.debug,
    references: manifest.references,
  };
}

function stateSummaryJson(state: JourneyState) {
  return {
    schemaVersion: state.schemaVersion,
    seed: state.quest.seed,
    dreamcaller: state.quest.dreamcaller,
    resources: state.quest.resources,
    selectedTides: state.quest.selectedTides,
    mandatoryTides: state.quest.mandatoryTides,
    optionalSubset: state.quest.optionalSubset,
    deck: state.quest.deck,
    activeDreamsigns: state.quest.activeDreamsigns,
    dreamsignPoolIds: state.quest.dreamsignPoolIds,
    dreamsignPoolSummary: state.quest.dreamsignPoolSummary,
    draftPool: state.quest.draftPool,
    draftPoolSummary: state.quest.draftPoolSummary,
    route: state.quest.route,
    generator: state.generator,
    pendingJourney: state.pendingJourney ? manifestJson(state.pendingJourney) : null,
    history: state.history,
  };
}

export function journeyCommandPayload(
  state: JourneyState,
  manifest: JourneyManifest,
  command: "journey" | "run" | "pick",
  options?: PickHistoryEntry | CommonCommandOptions,
  previousPick?: PickHistoryEntry,
) {
  const commandOptions = options && "projectRoot" in options ? options : undefined;
  const pick = options && "selectedOptionNumber" in options ? options : previousPick;

  return {
    status: "ok",
    command,
    contentVersion: state.contentVersion,
    catalogVersion: JOURNEY_SHAPE_CATALOG_VERSION,
    seed: manifest.seed,
    stage: manifest.stage,
    shapeId: manifest.shapeId,
    parameters: commandOptions
      ? {
          seed: commandOptions.seed ?? null,
          stage: commandOptions.stage ?? null,
          shape: commandOptions.shape ?? null,
          count: commandOptions.count ?? 1,
          debug: commandOptions.debug,
          debugContext: commandOptions.debugContext,
          ...(commandOptions.debugPayloadFamily !== undefined
            ? { debugPayloadFamily: commandOptions.debugPayloadFamily }
            : {}),
          ...(commandOptions.debugPayloadVariant !== undefined
            ? { debugPayloadVariant: commandOptions.debugPayloadVariant }
            : {}),
        }
      : undefined,
    context: {
      schemaVersion: state.schemaVersion,
      seed: state.quest.seed,
      dreamcaller: state.quest.dreamcaller,
      resources: state.quest.resources,
      selectedTides: state.quest.selectedTides,
      mandatoryTides: state.quest.mandatoryTides,
      optionalSubset: state.quest.optionalSubset,
      deck: state.quest.deck,
      dreamsignPoolSummary: state.quest.dreamsignPoolSummary,
      dreamsignPoolIds: state.quest.dreamsignPoolIds,
      activeDreamsigns: state.quest.activeDreamsigns,
      draftPool: state.quest.draftPool,
      draftPoolSummary: state.quest.draftPoolSummary,
      generator: state.generator,
      historyCount: state.history.length,
    },
    manifest: manifestJson(manifest),
    previousPick: pick,
    debug: manifest.debug,
  };
}

export function journeyBatchCommandPayload(
  entries: readonly { state: JourneyState; manifest: JourneyManifest }[],
  command: "journey" | "run",
  options: CommonCommandOptions,
) {
  const first = entries[0];

  if (!first) {
    throw new Error("Batch Journey payload requires at least one Journey");
  }

  return {
    status: "ok",
    command,
    contentVersion: first.state.contentVersion,
    catalogVersion: JOURNEY_SHAPE_CATALOG_VERSION,
    seed: first.manifest.seed,
    count: entries.length,
    parameters: {
      seed: options.seed ?? null,
      stage: options.stage ?? null,
      shape: options.shape ?? null,
      count: options.count ?? entries.length,
      debug: options.debug,
      debugContext: options.debugContext,
      ...(options.debugPayloadFamily !== undefined
        ? { debugPayloadFamily: options.debugPayloadFamily }
        : {}),
      ...(options.debugPayloadVariant !== undefined
        ? { debugPayloadVariant: options.debugPayloadVariant }
        : {}),
    },
    journeys: entries.map(({ state, manifest }, index) => ({
      index: index + 1,
      seed: manifest.seed,
      stage: manifest.stage,
      shapeId: manifest.shapeId,
      context: {
        schemaVersion: state.schemaVersion,
        seed: state.quest.seed,
        dreamcaller: state.quest.dreamcaller,
        resources: state.quest.resources,
        selectedTides: state.quest.selectedTides,
        mandatoryTides: state.quest.mandatoryTides,
        optionalSubset: state.quest.optionalSubset,
        deck: state.quest.deck,
        dreamsignPoolSummary: state.quest.dreamsignPoolSummary,
        dreamsignPoolIds: state.quest.dreamsignPoolIds,
        activeDreamsigns: state.quest.activeDreamsigns,
        draftPool: state.quest.draftPool,
        draftPoolSummary: state.quest.draftPoolSummary,
        generator: state.generator,
        historyCount: state.history.length,
      },
      manifest: manifestJson(manifest),
      debug: manifest.debug,
    })),
  };
}

export function payloadListCommandPayload(
  payloads: ReturnType<typeof debugPayloadListJson>,
) {
  return {
    status: "ok",
    command: "debug-list-payloads",
    payloads,
  };
}

export function stateCommandPayload(state: JourneyState) {
  return {
    status: "ok",
    command: "state",
    contentVersion: state.contentVersion,
    state: stateSummaryJson(state),
  };
}

export function newCommandPayload(state: JourneyState) {
  return {
    status: "ok",
    command: "new",
    contentVersion: state.contentVersion,
    state: stateSummaryJson(state),
  };
}

export function renderCommandJson(payload: unknown): string {
  return stableStringify(payload);
}
