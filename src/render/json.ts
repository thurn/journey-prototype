import type { JourneyManifest, JourneyOption } from "../journey/manifest.js";
import type { JourneyState, PickHistoryEntry } from "../state/schema.js";
import { stableStringify } from "../util/stableJson.js";

function nextCommands(manifest: JourneyManifest): string[] {
  return manifest.options.map((option) => `journey pick ${option.number}`);
}

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

function pendingJourneyJson(manifest: JourneyManifest) {
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
    pendingJourney: state.pendingJourney ? pendingJourneyJson(state.pendingJourney) : null,
    history: state.history,
  };
}

export function journeyCommandPayload(
  state: JourneyState,
  manifest: JourneyManifest,
  command: "journey" | "run" | "pick",
  previousPick?: PickHistoryEntry,
) {
  return {
    status: "ok",
    command,
    contentVersion: state.contentVersion,
    state: {
      schemaVersion: state.schemaVersion,
      seed: state.quest.seed,
      dreamcaller: state.quest.dreamcaller,
      resources: state.quest.resources,
      selectedTides: state.quest.selectedTides,
      deckSummary: state.quest.deck.summary,
      dreamsignPoolSummary: state.quest.dreamsignPoolSummary,
      draftPoolSummary: state.quest.draftPoolSummary,
      generator: state.generator,
      historyCount: state.history.length,
    },
    pendingJourney: pendingJourneyJson(manifest),
    previousPick,
    debug: manifest.debug,
    nextCommands: nextCommands(manifest),
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
    nextCommands: ["journey run"],
  };
}

export function renderCommandJson(payload: unknown): string {
  return stableStringify(payload);
}
