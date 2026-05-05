import type { ContentBundle } from "../content/model.js";
import { computeContentVersion } from "../content/version.js";
import { loadContent } from "../content/loadToml.js";
import { EFFECT_CATALOG, EFFECT_CATALOG_VERSION } from "../journey/effects.js";
import { MANIFEST_SCHEMA_VERSION, type JourneyManifest, type JourneyOption } from "../journey/manifest.js";
import {
  canonicalShapeDefinitions,
  JOURNEY_SHAPE_CATALOG_VERSION,
} from "../journey/shapes.js";
import {
  VALUE_MODEL_CONTRIBUTION,
  VALUE_MODEL_VERSION,
} from "../journey/value.js";
import type { JourneyContext } from "../quest/context.js";
import { buildJourneyContext } from "../quest/context.js";
import { QUEST_INITIALIZATION_VERSION } from "../quest/init.js";
import type { JourneyState, PickHistoryEntry } from "../state/schema.js";
import { ExitCode } from "../util/exitCodes.js";
import { stableStringify } from "../util/stableJson.js";
import type { CommandResult, CommonCommandOptions } from "./options.js";

export const TRANSITIONAL_RENDERER_VERSION = "renderer:command-transitions-v1";

export type LoadedContentContext = {
  content: ContentBundle;
  contentVersion: string;
};

export async function loadContentContext(
  projectRoot: string,
): Promise<LoadedContentContext> {
  const content = await loadContent(projectRoot);
  const contentVersion = computeContentVersion({
    content,
    journeyCatalogVersion: JOURNEY_SHAPE_CATALOG_VERSION,
    canonicalShapeDefinitions: canonicalShapeDefinitions(),
    effectCatalogVersion: EFFECT_CATALOG_VERSION,
    effectCatalogContribution: EFFECT_CATALOG.map(
      (entry) => entry.versionContribution,
    ),
    valueModelVersion: VALUE_MODEL_VERSION,
    valueModelContribution: VALUE_MODEL_CONTRIBUTION,
    manifestSchemaVersion: MANIFEST_SCHEMA_VERSION,
    rendererVersion: TRANSITIONAL_RENDERER_VERSION,
    questInitializationVersion: QUEST_INITIALIZATION_VERSION,
  });

  return { content, contentVersion };
}

export function buildContext(
  options: CommonCommandOptions,
  loaded: LoadedContentContext,
  state: JourneyState,
): JourneyContext {
  return buildJourneyContext({
    projectRoot: options.projectRoot,
    content: loaded.content,
    state,
    contentVersion: loaded.contentVersion,
  });
}

export function setupErrorResult(error: unknown): CommandResult {
  const detail = error instanceof Error ? error.message : String(error);

  return {
    exitCode: ExitCode.SetupOrSchema,
    stdout: "",
    stderr: `Error: ${detail}\n`,
  };
}

export function malformedStateResult(error: Error): CommandResult {
  return {
    exitCode: ExitCode.StateOrContent,
    stdout: "",
    stderr: `Error: local Journey state is malformed.\n\n${error.message}\n\nRun \`journey new --force\` to discard the old simulator state.\n`,
  };
}

export function contentMismatchResult(
  stateVersion: string,
  currentVersion: string,
): CommandResult {
  return {
    exitCode: ExitCode.StateOrContent,
    stdout: "",
    stderr: [
      "Error: local Journey state was created for a different content version.",
      "",
      `State content version: ${stateVersion}`,
      `Current content version: ${currentVersion}`,
      "",
      "Run `journey new --force` to discard the old simulator state.",
      "",
    ].join("\n"),
  };
}

export function usageErrorResult(message: string): CommandResult {
  return {
    exitCode: ExitCode.UsageOrInput,
    stdout: "",
    stderr: `Error: ${message}\n`,
  };
}

export function assertContentVersion(
  state: JourneyState,
  currentContentVersion: string,
): CommandResult | null {
  if (state.contentVersion === currentContentVersion) {
    return null;
  }

  return contentMismatchResult(state.contentVersion, currentContentVersion);
}

function optionLine(option: JourneyOption): string {
  const symbols = option.symbols.length > 0 ? `${option.symbols.join(" ")} ` : "";

  return `${option.number}. ${symbols}${option.text}`;
}

function pickCommandSuggestion(manifest: JourneyManifest): string {
  const commands = manifest.options.map((option) => `journey pick ${option.number}`);

  if (commands.length === 1) {
    return `Run \`${commands[0]}\`.`;
  }

  const quoted = commands.map((command) => `\`${command}\``);
  const last = quoted.pop();

  return `Run ${quoted.join(", ")} or ${last}.`;
}

function debugLines(
  manifest: JourneyManifest,
  previousPick?: PickHistoryEntry,
): string[] {
  const lines = [
    "",
    "Debug",
    `Seed: ${manifest.seed}`,
  ];

  if (previousPick) {
    lines.push(
      `Previous journey: ${previousPick.journeyId}`,
      `Previous shape: ${previousPick.shapeId}`,
      `Recorded pick: ${previousPick.selectedOptionNumber}`,
      "Effect simulation: not applied",
    );

    if (previousPick.sequenceStep !== undefined) {
      lines.push(`Recorded step: ${previousPick.sequenceStep}`);
    }

    if (previousPick.sequenceStatus !== undefined) {
      lines.push(`Sequence status: ${previousPick.sequenceStatus}`);
    }
  }

  lines.push(
    `Journey: ${manifest.journeyId}`,
    `Stage: ${manifest.stage}`,
    `Selected shape: ${manifest.debug.selectedShapeId}`,
    `Selected tags: ${manifest.selectedTags.join(", ")}`,
  );

  if (manifest.sequence) {
    lines.push(
      `Sequence: step ${manifest.sequence.step}${manifest.sequence.maxSteps ? ` of ${manifest.sequence.maxSteps}` : ""}, ${manifest.sequence.status}`,
    );
  }

  const topScore = manifest.debug.shapeScores[0];
  if (topScore) {
    lines.push(`Shape scoring: ${topScore.shapeId} ${topScore.score}`);
  }

  for (const value of manifest.debug.optionValues) {
    lines.push(
      "",
      `${value.optionNumber}. Cost: ${value.cost} converted essence.`,
      `   Effect: ${value.effect} converted essence.`,
      `   Burden: ${value.burden} converted essence.`,
      `   Uncertainty: ${value.uncertainty} converted essence.`,
      `   Net: ${value.net >= 0 ? "+" : ""}${value.net} converted essence.`,
    );
  }

  return lines;
}

export function renderJourneyHuman(
  state: JourneyState,
  manifest: JourneyManifest,
  options: CommonCommandOptions,
  previousPick?: PickHistoryEntry,
): string {
  const lines = [
    "Dream Journey",
    `Quest: ${state.quest.dreamcaller.name}, ${state.quest.dreamcaller.title}`,
    `Essence: ${state.quest.resources.essence}/${state.quest.resources.maxEssence}    Omens: ${state.quest.resources.omens}    Dreamscape: ${state.quest.resources.dreamscape}`,
    "",
    ...manifest.options.map(optionLine),
  ];

  if (options.debug) {
    lines.push(...debugLines(manifest, previousPick));
  }

  lines.push("", pickCommandSuggestion(manifest));

  return `${lines.join("\n")}\n`;
}

export function renderSelectedLine(option: JourneyOption): string {
  const symbols = option.symbols.length > 0 ? `${option.symbols.join(" ")} ` : "";

  return `Selected ${option.number}. ${symbols}${option.text}\n\n`;
}

export function renderRunJson(
  state: JourneyState,
  manifest: JourneyManifest,
  command: "run" | "pick",
  previousPick?: PickHistoryEntry,
): string {
  return stableStringify({
    command,
    contentVersion: state.contentVersion,
    previousPick,
    quest: state.quest,
    generator: state.generator,
    pendingJourney: manifest,
    history: state.history,
  });
}

export function renderStateHuman(state: JourneyState): string {
  const pending = state.pendingJourney;
  const recentHistory = state.history.slice(-5);
  const lines = [
    "Quest State",
    `Seed: ${state.quest.seed}`,
    `Dreamcaller: ${state.quest.dreamcaller.name}, ${state.quest.dreamcaller.title}`,
    `Awakening: ${state.quest.dreamcaller.awakening}`,
    `Essence: ${state.quest.resources.essence}/${state.quest.resources.maxEssence}    Omens: ${state.quest.resources.omens}    Dreamscape: ${state.quest.resources.dreamscape}`,
    `Selected tides: ${state.quest.selectedTides.join(", ")}`,
    `Deck: ${state.quest.deck.summary.totalCards} cards, ${state.quest.deck.summary.starterCards} starters, ${state.quest.deck.summary.uniqueCards} unique`,
    `Dreamsigns: ${state.quest.activeDreamsigns.length} active, ${state.quest.dreamsignPoolSummary.tidalPoolCount} tidal in pool, ${state.quest.dreamsignPoolSummary.neutralCatalogCount} neutral in catalog`,
    `Draft pool: ${state.quest.draftPoolSummary.totalCopies} copies, ${state.quest.draftPoolSummary.uniqueCards} unique`,
    `Pending Journey: ${pending ? `${pending.journeyId} (${pending.shapeId})` : "none"}`,
  ];

  if (pending) {
    lines.push(...pending.options.map(optionLine));
  }

  lines.push(
    `Pacing ledger: ${stableStringify(state.quest.route.pacingLedger).trim()}`,
    `Unresolved hooks: ${state.quest.route.unresolvedHooks.length}`,
    "Recent history:",
  );

  if (recentHistory.length === 0) {
    lines.push("none");
  } else {
    lines.push(
      ...recentHistory.map(
        (entry) =>
          `${entry.journeyId} option ${entry.selectedOptionNumber}: ${entry.selectedOptionText} (${entry.effectSimulation})`,
      ),
    );
  }

  return `${lines.join("\n")}\n`;
}

export function renderStateJson(state: JourneyState): string {
  return stableStringify({
    command: "state",
    contentVersion: state.contentVersion,
    state,
  });
}

export function renderNewHuman(state: JourneyState): string {
  return [
    "New Journey state created.",
    `Seed: ${state.quest.seed}`,
    `Dreamcaller: ${state.quest.dreamcaller.name}, ${state.quest.dreamcaller.title}`,
    `Essence: ${state.quest.resources.essence}/${state.quest.resources.maxEssence}    Omens: ${state.quest.resources.omens}    Dreamscape: ${state.quest.resources.dreamscape}`,
    "",
    "Run `journey run` to show the first Dream Journey.",
    "",
  ].join("\n");
}

export function renderNewJson(state: JourneyState): string {
  return stableStringify({
    command: "new",
    contentVersion: state.contentVersion,
    state,
  });
}
