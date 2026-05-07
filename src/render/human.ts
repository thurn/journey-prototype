import type { JourneyManifest, JourneyOption } from "../journey/manifest.js";
import type { JourneyState, PickHistoryEntry } from "../state/schema.js";
import { ansiTruecolor } from "../util/ansi.js";
import { stableStringify } from "../util/stableJson.js";
import { THEME } from "./theme.js";

export type RenderOptions = {
  json: boolean;
  debug: boolean;
  debugContext?: boolean;
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

function journeyResourceLine(state: JourneyState, manifest: JourneyManifest, options: RenderOptions): string {
  const resources = state.quest.resources;
  const label = (text: string) => color(text, "resourceLabel", options);
  const value = (text: string | number) =>
    color(String(text), "resourceValue", options);

  return [
    `${label("Stage")}: ${value(manifest.stage)}`,
    `${label("Essence")}: ${value(resources.essence)}/${value(resources.maxEssence)}`,
    `${label("Omens")}: ${value(resources.omens)}`,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function countText(value: unknown, singular: string, plural: string): string {
  const count = typeof value === "number" ? value : 1;

  return `${count} ${count === 1 ? singular : plural}`;
}

function predicateSummary(predicate: unknown): string {
  if (!isRecord(predicate)) {
    return "";
  }

  const parts: string[] = [];
  const pushString = (key: string, label: string) => {
    if (typeof predicate[key] === "string") {
      parts.push(`${label} ${predicate[key]}`);
    }
  };

  pushString("cardType", "card type");
  pushString("subtype", "subtype");
  pushString("rarity", "rarity");

  if (predicate.isFast === true) {
    parts.push("Fast");
  }

  if (typeof predicate.minEnergyCost === "number") {
    parts.push(`cost >= ${predicate.minEnergyCost}`);
  }

  if (typeof predicate.maxEnergyCost === "number") {
    parts.push(`cost <= ${predicate.maxEnergyCost}`);
  }

  if (Array.isArray(predicate.renderedTextIncludes)) {
    parts.push(`text includes ${predicate.renderedTextIncludes.join(", ")}`);
  } else if (typeof predicate.renderedTextIncludes === "string") {
    parts.push(`text includes ${predicate.renderedTextIncludes}`);
  }

  if (Array.isArray(predicate.names)) {
    parts.push(`names ${predicate.names.join(", ")}`);
  }

  if (Array.isArray(predicate.ids)) {
    parts.push(`ids ${predicate.ids.join(", ")}`);
  }

  if (typeof predicate.source === "string") {
    parts.push(`source ${predicate.source}`);
  }

  return parts.length === 0 ? "" : ` (${parts.join("; ")})`;
}

function committedOutcomeText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(committedOutcomeText).join(" ");
  }

  if (!isRecord(value)) {
    return stableStringify(value).trim();
  }

  switch (value.kind) {
    case "wager_roll": {
      const odds = isRecord(value.odds) && typeof value.odds.percent === "number"
        ? `${value.odds.percent}%`
        : "precommitted";
      const result = typeof value.committedResult === "string"
        ? value.committedResult
        : "unknown";
      const roll = typeof value.roll === "number" ? ` (roll ${value.roll})` : "";

      return `${odds} wager: success: ${committedOutcomeText(value.success)} failure: ${committedOutcomeText(value.failure)} committed roll: ${result}${roll}.`;
    }
    case "no_reward":
      return "Gain nothing.";
    case "gain_essence":
      return `Gain ${value.amount} essence.`;
    case "gain_omens":
      return `Gain ${countText(value.amount, "omen", "omens")}.`;
    case "card_draft":
      return `Draft ${value.takeCount ?? 1} of ${value.choiceCount ?? "?"} cards${predicateSummary(value.predicate)}.`;
    case "dreamsign_draft":
      return `Choose 1 of ${value.choiceCount ?? "?"} Dreamsigns${predicateSummary(value.predicate)}.`;
    case "starter_cleanup":
      return `Purge up to ${value.count ?? 1} chosen Starter cards.`;
    case "bane_gain":
      return `Gain ${countText(value.count, String(value.baneName ?? "Bane"), `${String(value.baneName ?? "Bane")}s`)}.`;
    case "visible_downside":
      return `Visible downside: gain ${countText(value.count, String(value.baneName ?? "Bane"), `${String(value.baneName ?? "Bane")}s`)}.`;
    case "risk_downside_roll": {
      const downside = isRecord(value.downside) ? value.downside : {};
      const baneName = String(downside.baneName ?? "Bane");
      const count = downside.count;
      const percent = isRecord(value.odds) && typeof value.odds.percent === "number"
        ? `${value.odds.percent}%`
        : "bounded";
      const committedResult = typeof value.committedResult === "string"
        ? value.committedResult
        : "precommitted";

      return `Risk downside roll: ${percent} chance to gain ${countText(count, baneName, `${baneName}s`)}; committed result: ${committedResult}.`;
    }
    case "probability_ladder":
      return `Probability ladder outcome is ${value.bounded === true ? "bounded" : "precommitted"}.`;
    case "push_failure":
      return `Push-your-luck failure is ${value.bounded === true ? "bounded" : "precommitted"}.`;
    default:
      return stableStringify(value).trim();
  }
}

function committedOutcomeLines(manifest: JourneyManifest): string[] {
  const lines: string[] = [];
  const random = manifest.precommitted.random ?? [];
  const delayed = manifest.precommitted.delayed ?? [];
  const pairedReturn = manifest.precommitted.pairedReturn ?? [];
  const routeEdits = manifest.precommitted.routeEdits ?? [];
  const sequenceMenus = manifest.precommitted.sequenceMenus ?? {};

  if (random.length > 0) {
    lines.push("Random:");
    random.forEach((outcome, index) => {
      lines.push(`  ${index + 1}. ${committedOutcomeText(outcome)}`);
    });
  }

  if (delayed.length > 0) {
    lines.push("Delayed:");
    delayed.forEach((entry, index) => {
      if (isRecord(entry) && "reward" in entry) {
        const trigger = typeof entry.trigger === "string" ? entry.trigger : "committed trigger";
        lines.push(`  ${index + 1}. ${trigger}: ${committedOutcomeText(entry.reward)}`);
      } else {
        lines.push(`  ${index + 1}. ${committedOutcomeText(entry)}`);
      }
    });
  }

  if (pairedReturn.length > 0) {
    lines.push("Paired return:");
    pairedReturn.forEach((entry, index) => {
      if (isRecord(entry) && "reward" in entry) {
        const anchor = typeof entry.anchor === "string" ? entry.anchor : "committed anchor";
        lines.push(`  ${index + 1}. ${anchor}: ${committedOutcomeText(entry.reward)}`);
      } else {
        lines.push(`  ${index + 1}. ${committedOutcomeText(entry)}`);
      }
    });
  }

  if (routeEdits.length > 0) {
    lines.push("Route edits:");
    routeEdits.forEach((entry, index) => {
      lines.push(`  ${index + 1}. ${committedOutcomeText(entry)}`);
    });
  }

  const menuEntries = Object.entries(sequenceMenus);
  if (menuEntries.length > 0) {
    lines.push("Sequence menus:");
    for (const [key, menu] of menuEntries) {
      lines.push(`  ${key}: ${menu.map((option) => `${option.number}. ${option.text}`).join(" | ")}`);
    }
  }

  return lines;
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

function validationDebugLines(manifest: JourneyManifest): string[] {
  const validation = manifest.debug.validation;
  if (!validation) {
    return [];
  }

  const lines = [
    "",
    "Validation:",
    `Summary: ${validation.ok ? "pass" : "fail"} (${validation.passed} passed, ${validation.failed} failed).`,
  ];

  for (const rule of validation.rules) {
    const checked = rule.checked[0];
    const payload = checked?.payloadFamily ? ` payload ${checked.payloadFamily}` : "";
    const target = checked?.targetResolution
      ? ` target ${checked.targetResolution.selectorKind}/${checked.targetResolution.sourcePool} candidates=${checked.targetResolution.candidateCount}`
      : "";

    lines.push(`${rule.ruleId}: ${rule.status} (${rule.severity}); ${rule.message}${payload}${target}.`);
  }

  return lines;
}

function timingDebugText(operation: JourneyOption["operations"][number]): string {
  if (!operation.timing) {
    return "timing=unspecified";
  }

  if (operation.timing.timingKind === "delayed") {
    return `timing=delayed:${operation.timing.trigger}`;
  }

  if (operation.timing.timingKind === "route") {
    return `timing=route:${operation.timing.scope}`;
  }

  return operation.timing.label
    ? `timing=${operation.timing.timingKind}:${operation.timing.label}`
    : `timing=${operation.timing.timingKind}`;
}

function operationValueDebugText(operation: JourneyOption["operations"][number]): string | undefined {
  if (!operation.value) {
    return undefined;
  }

  const parts = [
    typeof operation.value.convertedEssence === "number"
      ? `converted=${operation.value.convertedEssence}`
      : undefined,
    typeof operation.value.expectedConvertedEssence === "number"
      ? `expected=${operation.value.expectedConvertedEssence}`
      : undefined,
    typeof operation.value.uncertaintyConvertedEssence === "number"
      ? `uncertainty=${operation.value.uncertaintyConvertedEssence}`
      : undefined,
    operation.value.bands && operation.value.bands.length > 0
      ? `bands=${operation.value.bands.map((band) => band.id).join(",")}`
      : undefined,
  ].filter((part): part is string => part !== undefined);

  return parts.length > 0 ? `Value: ${parts.join("; ")}.` : undefined;
}

function operationTargetDebugText(operation: JourneyOption["operations"][number]): string | undefined {
  const resolution = operation.targetResolution;

  if (!resolution) {
    return undefined;
  }

  const selected = resolution.selected.length === 0
    ? "none"
    : [
        ...resolution.selected.slice(0, 5).map((entry) => entry.name),
        ...(resolution.selected.length > 5 ? [`+${resolution.selected.length - 5} more`] : []),
      ].join(", ");

  return `Target: ${resolution.selectorKind}/${resolution.sourcePool} candidates=${resolution.candidateCount} selected=${selected}.`;
}

function operationPoolDebugText(operation: JourneyOption["operations"][number]): string | undefined {
  const sourcePoolSize = operation.payload.sourcePoolSize;

  return typeof sourcePoolSize === "number"
    ? `Source pool size: ${sourcePoolSize}.`
    : undefined;
}

function operationDebugLines(manifest: JourneyManifest): string[] {
  const lines: string[] = [];
  const optionOperations = manifest.options.flatMap((option) =>
    option.operations.map((operation) => ({ location: `Option ${option.number}`, operation }))
  );
  const treeOperations = manifest.tree?.nodes.flatMap((node) =>
    node.branches.flatMap((branch) => [
      ...branch.operations.map((operation) => ({ location: `Tree ${branch.id}`, operation })),
      ...(branch.terminal?.operations.map((operation) => ({
        location: `Tree ${branch.id} terminal`,
        operation,
      })) ?? []),
    ])
  ) ?? [];
  const rewardPoolOperations = manifest.rewardPool?.operations.map((operation) => ({
    location: "Reward pool",
    operation,
  })) ?? [];
  const precommittedOperations = manifest.precommitted.operations?.map((operation) => ({
    location: "Precommitted",
    operation,
  })) ?? [];
  const operations = [
    ...optionOperations,
    ...treeOperations,
    ...rewardPoolOperations,
    ...precommittedOperations,
  ];

  if (operations.length === 0) {
    return [];
  }

  lines.push("", "Operations:");

  for (const { location, operation } of operations) {
    lines.push(
      `${location} ${operation.operationId}: ${operation.operationKind} role=${operation.role} visibility=${operation.visibility}; ${timingDebugText(operation)}.`,
    );

    const target = operationTargetDebugText(operation);
    if (target) {
      lines.push(`  ${target}`);
    }

    const pool = operationPoolDebugText(operation);
    if (pool) {
      lines.push(`  ${pool}`);
    }

    const value = operationValueDebugText(operation);
    if (value) {
      lines.push(`  ${value}`);
    }
  }

  return lines;
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
    `Selected payload family: ${manifest.debug.debugPayload?.familyId ?? "adapter"}`,
  );

  if (manifest.debug.debugPayload) {
    lines.push(
      `Debug payload: ${manifest.debug.debugPayload.qaId}`,
      `Payload source: ${manifest.debug.debugPayload.source}`,
      `Forced QA controls: family=${manifest.debug.debugPayload.familyId}; variant=${manifest.debug.debugPayload.variantId}; shapes=${manifest.debug.debugPayload.supportedShapes === "all" ? "all" : manifest.debug.debugPayload.supportedShapes.join(",")}; stages=${manifest.debug.debugPayload.supportedStages === "all" ? "all" : manifest.debug.debugPayload.supportedStages.join(",")}`,
    );
  }

  if (manifest.sequence) {
    const max = manifest.sequence.maxSteps ? ` of ${manifest.sequence.maxSteps}` : "";
    lines.push(`Sequence: step ${manifest.sequence.step}${max}, ${manifest.sequence.status}`);
  }

  const topScore = manifest.debug.shapeScores[0];
  if (topScore) {
    lines.push(`Shape scoring: ${topScore.shapeId} ${topScore.score}`);
  }

  const outcomes = committedOutcomeLines(manifest);
  if (outcomes.length > 0) {
    lines.push("", "Precommitted outcomes:", ...outcomes);
  }

  lines.push(
    `Semantic fingerprint: ${manifest.debug.semanticFingerprint.value} (${manifest.debug.semanticFingerprint.algorithm}).`,
  );

  lines.push(...operationDebugLines(manifest));
  lines.push(...validationDebugLines(manifest));

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
        `Attempt ${repair.attempt}: ${repair.failedRule}; ${repair.actionCategory}; ${repair.action}; ${repair.result}.`,
      );

      if (repair.validation) {
        const checked = repair.validation.checked[0];
        const payload = checked?.payloadFamily ? ` payload ${checked.payloadFamily}` : "";
        const target = checked?.targetResolution
          ? ` target ${checked.targetResolution.selectorKind}/${checked.targetResolution.sourcePool} candidates=${checked.targetResolution.candidateCount}`
          : "";

        lines.push(`  Validation ${repair.validation.ruleId}: ${repair.validation.message}${payload}${target}.`);
      }
    }
  }

  if (manifest.debug.repair) {
    lines.push(
      "",
      `Repair status: ${manifest.debug.repair.status}; forced shape: ${manifest.debug.repair.forcedShape ? "yes" : "no"}.`,
    );
  }

  return lines.map((line) => {
    if (line === "Debug") {
      return color(line, "heading", options);
    }

    return line.length === 0 ? line : color(line, "debug", options);
  });
}

function treeLines(manifest: JourneyManifest, options: RenderOptions): string[] {
  if (!manifest.tree) {
    return [];
  }

  const lines: string[] = [];

  if (manifest.rewardPool) {
    lines.push(color("Pool", "heading", options), manifest.rewardPool.summary, "");
  }

  lines.push(color("Decision Tree", "heading", options));

  for (const node of manifest.tree.nodes) {
    lines.push("", color(node.levelLabel, "resourceLabel", options));
    if (node.description) {
      lines.push(node.description);
    }

    for (const branch of node.branches) {
      lines.push(`${branch.label}: ${branch.text}`);
    }
  }

  return lines;
}

function debugContextLines(state: JourneyState, options: RenderOptions): string[] {
  const deckEntries = state.quest.deck.entries.map((entry) => `${entry.cardId} x${entry.copies}`);

  return [
    "",
    color("Debug Context", "heading", options),
    `Dreamcaller: ${state.quest.dreamcaller.name}, ${state.quest.dreamcaller.title}`,
    `Awakening: ${state.quest.dreamcaller.awakening}`,
    `Resources: ${state.quest.resources.essence}/${state.quest.resources.maxEssence} essence, ${state.quest.resources.omens} omens, dreamscape ${state.quest.resources.dreamscape}`,
    `Active Dreamsigns: ${state.quest.activeDreamsigns.length}`,
    `Package selection: ${state.quest.selectedTides.join(", ")}`,
    `Deck summary: ${state.quest.deck.summary.totalCards} cards, ${state.quest.deck.summary.starterCards} starters, ${state.quest.deck.summary.uniqueCards} unique`,
    "Deck list:",
    ...(deckEntries.length === 0 ? ["none"] : deckEntries),
    `Banes: ${state.quest.deck.entries.filter((entry) => entry.cardId.toLowerCase().includes("bane")).length}`,
    `Starter count: ${state.quest.deck.summary.starterCards}`,
    `Draft pool: ${state.quest.draftPoolSummary.totalCopies} copies, ${state.quest.draftPoolSummary.uniqueCards} unique`,
    `Dreamsign pool: ${state.quest.dreamsignPoolSummary.tidalPoolCount} in pool, ${state.quest.dreamsignPoolSummary.neutralCatalogCount} neutral in catalog`,
  ];
}

export function renderJourneyHuman(
  state: JourneyState,
  manifest: JourneyManifest,
  options: RenderOptions,
): string {
  const lines = [
    color("Dream Journey", "heading", options),
    `Quest: ${state.quest.dreamcaller.name}, ${state.quest.dreamcaller.title}`,
    journeyResourceLine(state, manifest, options),
    "",
    ...(manifest.tree
      ? treeLines(manifest, options)
      : manifest.options.map((option) => optionLine(option, options))),
  ];

  if (options.debugContext) {
    lines.push(...debugContextLines(state, options));
  }

  if (options.debug) {
    lines.push(...debugLines(state, manifest, options));
  }

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
    "Package selection",
    state.quest.selectedTides.join(", "),
    "",
    "Deck summary",
    `${state.quest.deck.summary.totalCards} cards, ${state.quest.deck.summary.starterCards} starters, ${state.quest.deck.summary.uniqueCards} unique`,
    "",
    "Dreamsign summary",
    `${state.quest.activeDreamsigns.length} active, ${state.quest.dreamsignPoolSummary.tidalPoolCount} in pool, ${state.quest.dreamsignPoolSummary.neutralCatalogCount} neutral in catalog`,
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
          `${entry.journeyId} option ${entry.selectedOptionNumber}: ${entry.selectedOptionText}\nEffect simulation: not applied`,
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
