import type { JourneyManifest, JourneyOption } from "../journey/manifest.js";
import { JOURNEY_SHAPE_CATALOG_VERSION } from "../journey/shapes.js";
import type { JourneyState, PickHistoryEntry } from "../state/schema.js";
import { stableStringify } from "../util/stableJson.js";
import type { CommonCommandOptions } from "../commands/options.js";

function optionJson(option: JourneyOption) {
  return {
    number: option.number,
    symbols: option.symbols,
    text: option.text,
    pickBehavior: option.pickBehavior,
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
    journeyId: manifest.journeyId,
    seed: manifest.seed,
    rootJourneyIndex: manifest.rootJourneyIndex,
    shapeId: manifest.shapeId,
    stage: manifest.stage,
    dreamscape: manifest.dreamscape,
    selectedTags: manifest.selectedTags,
    sequence: manifest.sequence,
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
          debug: commandOptions.debug,
          debugContext: commandOptions.debugContext,
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
