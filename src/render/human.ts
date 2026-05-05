import type { JourneyManifest, JourneyOption } from "../journey/manifest.js";
import type { JourneyState, PickHistoryEntry } from "../state/schema.js";
import { ansiTruecolor } from "../util/ansi.js";
import { stableStringify } from "../util/stableJson.js";
import { THEME } from "./theme.js";

export type RenderOptions = {
  json: boolean;
  debug: boolean;
  color: boolean;
};

export type RenderedOutput = {
  stdout: string;
  stderr: string;
};

const SYMBOL_GLYPHS: Record<string, string> = {
  reward: "*",
  cost: "$",
  risk: "!",
  route: ">",
  leave: "<",
  loss: "-",
  "no-op": ".",
};

function color(
  text: string,
  key: keyof typeof THEME,
  options: RenderOptions,
): string {
  return ansiTruecolor(text, THEME[key], options.color && !options.json);
}

function resourceLine(state: JourneyState, options: RenderOptions): string {
  const resources = state.quest.resources;
  const label = (text: string) => color(text, "resourceLabel", options);
  const value = (text: string | number) =>
    color(String(text), "resourceValue", options);

  return [
    `${label("Essence")}: ${value(resources.essence)}/${value(resources.maxEssence)}`,
    `${label("Omens")}: ${value(resources.omens)}`,
    `${label("Dreamscape")}: ${value(resources.dreamscape)}`,
  ].join("    ");
}

function displaySymbols(option: JourneyOption): string {
  return option.symbols
    .map((symbol) => SYMBOL_GLYPHS[symbol] ?? symbol)
    .slice(0, 2)
    .join(" ");
}

function optionTone(option: JourneyOption): keyof typeof THEME {
  if (option.netConvertedEssence < 0 || option.costConvertedEssence > 0) {
    return "warning";
  }

  if (option.effectConvertedEssence > 0) {
    return "positive";
  }

  return "resourceValue";
}

function optionLine(option: JourneyOption, options: RenderOptions): string {
  const symbols = displaySymbols(option);
  const prefix = `${color(`${option.number}.`, "optionNumber", options)}${symbols.length > 0 ? ` ${symbols}` : ""}`;

  return `${prefix} ${color(option.text, optionTone(option), options)}`;
}

function selectedLine(option: JourneyOption, options: RenderOptions): string {
  const symbols = displaySymbols(option);
  const symbolText = symbols.length > 0 ? `${symbols} ` : "";

  return `${color(`Selected ${option.number}.`, "optionNumber", options)} ${symbolText}${option.text}\n\n`;
}

function formatPickCommands(manifest: JourneyManifest): string {
  const commands = manifest.options.map((option) => `journey pick ${option.number}`);

  if (commands.length === 0) {
    return "Run `journey run` to show the pending choices again.";
  }

  if (commands.length === 1) {
    return `Run \`${commands[0]}\`.`;
  }

  if (commands.length === 2) {
    return `Run \`${commands[0]}\` or \`${commands[1]}\`.`;
  }

  const head = commands.slice(0, -1).map((command) => `\`${command}\``).join(", ");
  const tail = commands[commands.length - 1];

  return `Run ${head}, or \`${tail}\`.`;
}

function optionValueDebugLines(
  value: JourneyManifest["debug"]["optionValues"][number],
): string[] {
  const [firstLine, ...remainingLines] = value.detail;

  if (!firstLine) {
    return [`${value.optionNumber}.`];
  }

  return [
    `${value.optionNumber}. ${firstLine}`,
    ...remainingLines.map((line) => `   ${line}`),
  ];
}

function previousPickFor(state: JourneyState, manifest: JourneyManifest): PickHistoryEntry | JourneyManifest["debug"]["previousPick"] | undefined {
  if (manifest.debug.previousPick) {
    return manifest.debug.previousPick;
  }

  const latest = state.history[state.history.length - 1];

  if (!latest) {
    return undefined;
  }

  if (latest.journeyId === manifest.journeyId || latest.journeyId !== state.generator.lastJourneyId) {
    return latest;
  }

  return undefined;
}

function debugLines(state: JourneyState, manifest: JourneyManifest, options: RenderOptions): string[] {
  const lines = ["", "Debug", `Seed: ${manifest.seed}`];
  const previousPick = previousPickFor(state, manifest);

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
    const max = manifest.sequence.maxSteps ? ` of ${manifest.sequence.maxSteps}` : "";
    lines.push(`Sequence: step ${manifest.sequence.step}${max}, ${manifest.sequence.status}`);
  }

  const topScore = manifest.debug.shapeScores[0];
  if (topScore) {
    lines.push(`Shape scoring: ${topScore.shapeId} ${topScore.score}`);
  }

  for (const optionValue of manifest.debug.optionValues) {
    lines.push(
      "",
      ...optionValueDebugLines(optionValue),
    );
  }

  if (manifest.debug.repairs.length > 0) {
    lines.push("", "Repairs:");
    for (const repair of manifest.debug.repairs) {
      lines.push(
        `Attempt ${repair.attempt}: ${repair.failedRule}; ${repair.action}; ${repair.result}.`,
      );
    }
  }

  return lines.map((line) => {
    if (line === "Debug") {
      return color(line, "heading", options);
    }

    return line.length === 0 ? line : color(line, "debug", options);
  });
}

export function renderJourneyHuman(
  state: JourneyState,
  manifest: JourneyManifest,
  options: RenderOptions,
): string {
  const lines = [
    color("Dream Journey", "heading", options),
    `Quest: ${state.quest.dreamcaller.name}, ${state.quest.dreamcaller.title}`,
    resourceLine(state, options),
    "",
    ...manifest.options.map((option) => optionLine(option, options)),
  ];

  if (options.debug) {
    lines.push(...debugLines(state, manifest, options));
  }

  lines.push("", formatPickCommands(manifest));

  return `${lines.join("\n")}\n`;
}

export function renderSelectedHuman(
  option: JourneyOption,
  options: RenderOptions,
): string {
  return selectedLine(option, options);
}

export function renderStateHuman(
  state: JourneyState,
  options: RenderOptions,
): string {
  const pending = state.pendingJourney;
  const recentHistory = state.history.slice(-5);
  const lines = [
    color("Quest State", "heading", options),
    `Seed: ${state.quest.seed}`,
    `Dreamcaller: ${state.quest.dreamcaller.name}, ${state.quest.dreamcaller.title}`,
    `Awakening: ${state.quest.dreamcaller.awakening}`,
    resourceLine(state, options),
    "",
    "Selected tides",
    state.quest.selectedTides.join(", "),
    "",
    "Deck summary",
    `${state.quest.deck.summary.totalCards} cards, ${state.quest.deck.summary.starterCards} starters, ${state.quest.deck.summary.uniqueCards} unique`,
    "",
    "Dreamsign summary",
    `${state.quest.activeDreamsigns.length} active, ${state.quest.dreamsignPoolSummary.tidalPoolCount} tidal in pool, ${state.quest.dreamsignPoolSummary.neutralCatalogCount} neutral in catalog`,
    "",
    "Draft pool summary",
    `${state.quest.draftPoolSummary.totalCopies} copies, ${state.quest.draftPoolSummary.uniqueCards} unique, ${state.quest.draftPoolSummary.oneCopyCards} one-copy, ${state.quest.draftPoolSummary.twoCopyCards} two-copy`,
    "",
    "Pending Journey",
    pending ? `${pending.journeyId} (${pending.shapeId})` : "none",
  ];

  if (pending) {
    lines.push(...pending.options.map((option) => optionLine(option, options)));
  }

  lines.push(
    "",
    "Pacing ledger",
    stableStringify(state.quest.route.pacingLedger).trim(),
    "",
    "Unresolved hooks",
    state.quest.route.unresolvedHooks.length === 0
      ? "none"
      : stableStringify(state.quest.route.unresolvedHooks).trim(),
    "",
    "Recent history",
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

export function renderNewHuman(
  state: JourneyState,
  options: RenderOptions,
): string {
  return [
    color("New Journey state created.", "heading", options),
    `Seed: ${state.quest.seed}`,
    `Dreamcaller: ${state.quest.dreamcaller.name}, ${state.quest.dreamcaller.title}`,
    resourceLine(state, options),
    "",
    "Run `journey run` to show the first Dream Journey.",
    "",
  ].join("\n");
}
