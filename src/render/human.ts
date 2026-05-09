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

function visibilityPolicyText(value: unknown): string {
  if (!isRecord(value)) {
    return "visibility policy is unspecified";
  }

  const visibility = typeof value.outcomeVisibility === "string"
    ? value.outcomeVisibility.replace(/_/gu, " ")
    : "unknown visibility";
  const disclosure = typeof value.disclosure === "string" ? value.disclosure : "no disclosure";

  return `${visibility}: ${disclosure}`;
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

function humanizeToken(value: unknown): string {
  return typeof value === "string" && value.length > 0
    ? value.replace(/_/gu, " ")
    : "unspecified";
}

function bracedName(name: unknown, fallback: string): string {
  return typeof name === "string" && name.length > 0 ? `{${name}}` : fallback;
}

function durationText(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return humanizeToken(value);
  }

  if (isRecord(value) && typeof value.label === "string") {
    return value.label;
  }

  return undefined;
}

function resourcePayloadText(value: Record<string, unknown>): string | undefined {
  const resource = humanizeToken(value.resource ?? "essence");
  const amount = value.amount ?? value.count ?? "?";

  switch (value.kind) {
    case "shop_economy_modifier": {
      const scope = humanizeToken(value.shopScope ?? value.siteType ?? "shop");
      const hook = typeof value.hook === "string" ? value.hook : undefined;
      const amountText = typeof value.amount === "number" ? `${value.amount} essence` : "a shop benefit";

      return hook ? `${scope}: ${hook}.` : `${scope}: apply ${amountText}.`;
    }
    case "resource_restore_to_maximum":
      return `Restore ${resource} to maximum.`;
    case "resource_percentage":
      return `${value.resourceSetMode === "set_current_to_percentage" ? "Set" : "Scale"} ${resource} to ${value.percentage ?? "?"}% of ${humanizeToken(value.basis ?? "maximum")}.`;
    case "resource_random_range":
      return `Gain ${value.minimum ?? "?"}-${value.maximum ?? "?"} random ${resource}; committed amount ${value.committedAmount ?? value.amount ?? "?"}.`;
    case "resource_cap_change":
      return `Change maximum ${resource} by ${value.capDelta ?? amount}.`;
    case "resource_reward_reduction":
      return `Reduce ${humanizeToken(value.basis ?? "reward")} ${resource} by ${value.percentage ?? amount}${typeof value.percentage === "number" ? "%" : ""}.`;
    case "gain_essence":
      return `Gain ${amount} essence.`;
    case "gain_omens":
      return `Gain ${countText(amount, "omen", "omens")}.`;
    case "essence":
      return `Pay ${amount} essence.`;
    case "omens":
      return `Pay ${countText(amount, "omen", "omens")}.`;
    case "essence_loss":
      return `Lose ${amount} essence.`;
    case "omen_loss":
      return `Lose ${countText(amount, "omen", "omens")}.`;
    default:
      return undefined;
  }
}

function namedObjectPayloadText(value: Record<string, unknown>): string | undefined {
  switch (value.kind) {
    case "card_transform":
    case "card_replace":
      return `Transform ${bracedName(value.targetCardName ?? value.oldCardName, "the selected card")} into ${bracedName(value.resultCardName ?? value.cardName, "the result card")}.`;
    case "card_temporary_copy": {
      const duration = durationText(value.duration);

      return `Gain a temporary copy of ${bracedName(value.targetCardName ?? value.cardName, "the selected card")}${duration ? ` for ${duration}` : ""}.`;
    }
    case "card_draft":
      return `Draft ${value.takeCount ?? 1} of ${value.choiceCount ?? "?"} cards${predicateSummary(value.predicate)}.`;
    case "card_gain":
      return `Gain ${bracedName(value.cardName, "a card")}.`;
    case "dreamsign_gain":
    case "dreamsign_purchase":
      return `Gain ${bracedName(value.dreamsignName, "a Dreamsign")}.`;
    case "dreamsign_transform":
      return `Transform ${bracedName(value.targetDreamsignName ?? value.dreamsignName, "the selected Dreamsign")} into ${bracedName(value.resultDreamsignName ?? value.newDreamsignName, "the result Dreamsign")}.`;
    case "dreamsign_duplicate":
      return `Duplicate ${bracedName(value.dreamsignName ?? value.targetDreamsignName, "a Dreamsign")}.`;
    case "dreamsign_temporary_grant": {
      const duration = durationText(value.duration);

      return `Gain ${bracedName(value.dreamsignName, "a Dreamsign")} temporarily${duration ? ` for ${duration}` : ""}.`;
    }
    case "dreamsign_pool_edit":
      return `${humanizeToken(value.poolOperationKind ?? "Edit")} the Dreamsign pool${typeof value.dreamsignName === "string" ? ` with ${bracedName(value.dreamsignName, "a Dreamsign")}` : ""}.`;
    default:
      return undefined;
  }
}

function statusPayloadText(value: Record<string, unknown>): string | undefined {
  if (typeof value.kind !== "string" || !value.kind.startsWith("status_")) {
    return undefined;
  }

  const name = typeof value.statusName === "string" ? value.statusName : "Status";
  const duration = durationText(value.duration ?? value.timing);
  const durationPrefix = duration ? ` for ${duration}` : "";

  switch (value.kind) {
    case "status_reward_replacement":
      return `${name}: replace a reward with ${String(value.replacement ?? "the committed replacement")}${durationPrefix}.`;
    case "status_battle_rule":
      return `${name}: ${humanizeToken(value.ruleMutationKind)} affects ${humanizeToken(value.affectedPlayer ?? "you")}${durationPrefix}.`;
    case "status_dreamwell_rule":
      return `${name}: ${humanizeToken(value.dreamwellRuleKind ?? value.ruleMutationKind)}${durationPrefix}.`;
    case "status_shop_rule":
      return `${name}: ${humanizeToken(value.ruleMutationKind)} for ${humanizeToken(value.statusScope ?? "shops")}${durationPrefix}.`;
    case "status_structural_constraint":
      return `${name}: ${humanizeToken(value.ruleMutationKind)}${durationPrefix}.`;
    default:
      return `${name}: ${humanizeToken(value.ruleMutationKind ?? value.kind)}${durationPrefix}.`;
  }
}

function generatedObjectPayloadText(value: Record<string, unknown>): string | undefined {
  if (typeof value.kind !== "string" || !value.kind.startsWith("generated_object_")) {
    return undefined;
  }

  const name = bracedName(value.generatedObjectName, "the generated object");
  const rules = typeof value.rulesText === "string" ? ` ${value.rulesText}` : "";
  const duration = durationText(value.duration);

  switch (value.kind) {
    case "generated_object_create":
      return `Create ${name}.${rules}`;
    case "generated_object_grant":
      return `Gain ${name}.${rules}`;
    case "generated_object_transform":
      return `Transform the selected object into ${name}.${rules}`;
    case "generated_object_temporary_grant":
      return `Gain ${name} temporarily${duration ? ` for ${duration}` : ""}.${rules}`;
    case "generated_object_return":
      return `Return ${name}${duration ? ` ${duration.startsWith("at ") ? duration : `at ${duration}`}` : ""}.${rules}`;
    case "generated_object_trade":
      return `Trade for ${name}${duration ? ` at ${duration}` : ""}.${rules}`;
    default:
      return `${humanizeToken(value.kind)} ${name}.${rules}`;
  }
}

function committedOutcomeText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(committedOutcomeText).join(" ");
  }

  if (!isRecord(value)) {
    return stableStringify(value).trim();
  }

  const concisePayload =
    resourcePayloadText(value) ??
    namedObjectPayloadText(value) ??
    statusPayloadText(value) ??
    generatedObjectPayloadText(value);

  if (concisePayload) {
    return concisePayload;
  }

  switch (value.kind) {
    case "delayed_hook_contract": {
      const trigger = isRecord(value.triggerSelector) && typeof value.triggerSelector.label === "string"
        ? value.triggerSelector.label
        : typeof value.trigger === "string"
          ? value.trigger
          : "committed trigger";
      const tracked = typeof value.trackedCondition === "string" ? value.trackedCondition : "Track a condition.";
      const resolution = typeof value.resolution === "string" ? value.resolution : "Resolve the hook.";
      const expiration = isRecord(value.expiration) && typeof value.expiration.label === "string"
        ? value.expiration.label
        : "Expires after its bounded window.";

      return `${trigger}: ${tracked} ${resolution} Expiration: ${expiration}`;
    }
    case "paired_return_contract": {
      const anchor = typeof value.anchor === "string" ? value.anchor : "paired return";
      const created = isRecord(value.created) && typeof value.created.label === "string"
        ? value.created.label
        : "Remember the created object.";
      const returnScene = isRecord(value.returnScene) && typeof value.returnScene.resolution === "string"
        ? value.returnScene.resolution
        : "Resolve the return scene.";
      const expiration = isRecord(value.returnScene) &&
        isRecord(value.returnScene.expiration) &&
        typeof value.returnScene.expiration.label === "string"
        ? value.returnScene.expiration.label
        : "Expires after its bounded window.";

      return `${anchor}: ${created} Return: ${returnScene} Expiration: ${expiration}`;
    }
    case "visible_pool": {
      const summary = typeof value.summary === "string" ? value.summary : "Visible random pool.";
      const replacement = typeof value.replacement === "string" ? ` ${value.replacement.replace(/_/gu, " ")}.` : "";

      return `${summary}${replacement}`;
    }
    case "reveal_rewards":
    case "choose_one_revealed_reward":
    case "choose_one_random_revealed_reward": {
      const revealCount = typeof value.revealCount === "number" ? value.revealCount : "?";
      const mode = value.kind === "choose_one_revealed_reward"
        ? "choose one revealed reward"
        : value.kind === "choose_one_random_revealed_reward"
          ? "choose one random revealed reward"
          : "reveal rewards";

      return `${mode}: reveal ${revealCount}; ${visibilityPolicyText(value.visibilityPolicy)}.`;
    }
    case "gain_one_random_reward":
      return `Gain one random reward from ${String(value.poolId ?? "a committed pool")}; ${visibilityPolicyText(value.visibilityPolicy)}.`;
    case "roll_twice_keep_one": {
      const rolls = Array.isArray(value.rolls) ? value.rolls.join(", ") : "precommitted";
      const kept = typeof value.keptRoll === "number" ? value.keptRoll : "best";

      return `Roll twice keep one: rolls ${rolls}; kept ${kept}.`;
    }
    case "repeated_pool_draws":
      return `Repeated pool draws: ${value.drawCount ?? "?"} draws from ${String(value.poolId ?? "a committed pool")}; ${visibilityPolicyText(value.visibilityPolicy)}.`;
    case "random_range":
    case "resource_random_range":
      return `Random ${String(value.resource ?? "resource")} range ${value.minimum ?? "?"}-${value.maximum ?? "?"}; committed amount ${value.committedAmount ?? "?"}.`;
    case "random_cost":
    case "chance_to_pay_cost": {
      const odds = isRecord(value.odds) && typeof value.odds.percent === "number"
        ? `${value.odds.percent}%`
        : "precommitted";

      return `${odds} chance to pay cost; committed result: ${String(value.committedResult ?? "committed")}.`;
    }
    case "chance_to_gain_bane": {
      const odds = isRecord(value.odds) && typeof value.odds.percent === "number"
        ? `${value.odds.percent}%`
        : "precommitted";

      return `${odds} chance to gain ${countText(value.count, String(value.baneName ?? "Bane"), `${String(value.baneName ?? "Bane")}s`)}; committed result: ${String(value.committedResult ?? "committed")}.`;
    }
    case "wager": {
      const odds = isRecord(value.odds) && typeof value.odds.percent === "number"
        ? `${value.odds.percent}%`
        : "precommitted";
      const result = typeof value.committedResult === "string" ? value.committedResult : "unknown";
      const roll = typeof value.roll === "number" ? ` (roll ${value.roll})` : "";

      return `${odds} wager: success: ${committedOutcomeText(value.success)} failure: ${committedOutcomeText(value.failure)} committed roll: ${result}${roll}.`;
    }
    case "push_choice":
      return `Push choice hazard is ${value.bounded === true ? "bounded" : "precommitted"}; ${visibilityPolicyText(value.visibilityPolicy)}.`;
    case "complete_decision_tree":
      return `Complete decision tree: ${Array.isArray(value.nodes) ? value.nodes.length : "?"} levels; stop branches ${Array.isArray(value.stopBranchIds) ? value.stopBranchIds.length : "?"}; failure branches ${Array.isArray(value.failureBranchIds) ? value.failureBranchIds.length : "?"}; reward branches ${Array.isArray(value.rewardBranchIds) ? value.rewardBranchIds.length : "?"}.`;
    case "resolved_random_series":
      return `Resolved random series: ${Array.isArray(value.series) ? value.series.length : "?"} committed payloads.`;
    case "no_reward":
      return "Gain nothing.";
    case "essence":
      return `Pay ${value.amount ?? "?"} essence.`;
    case "omens":
      return `Pay ${countText(value.amount, "omen", "omens")}.`;
    case "essence_loss":
      return `Lose ${value.amount ?? "?"} essence.`;
    case "omen_loss":
      return `Lose ${countText(value.amount, "omen", "omens")}.`;
    case "gain_essence":
      return `Gain ${value.amount} essence.`;
    case "gain_omens":
      return `Gain ${countText(value.amount, "omen", "omens")}.`;
    case "resource_restore_to_maximum":
      return `Restore ${String(value.resource ?? "resource")} to maximum.`;
    case "resource_percentage":
      return `${value.resourceSetMode === "set_current_to_percentage" ? "Set" : "Gain"} ${String(value.resource ?? "resource")} to ${value.percentage ?? "?"}% of ${String(value.basis ?? "maximum")}.`;
    case "resource_random_range":
      return `${value.minimum ?? "?"}-${value.maximum ?? "?"} random ${String(value.resource ?? "resource")}; committed amount ${value.amount ?? "?"}.`;
    case "resource_cap_change": {
      const amount = typeof value.capDelta === "number" ? value.capDelta : value.amount;

      return `Change maximum ${String(value.resource ?? "resource")} by ${amount ?? "?"}.`;
    }
    case "resource_reward_reduction":
      return `Reduce ${String(value.basis ?? "reward")} ${String(value.resource ?? "resource")} by ${value.percentage ?? value.amount ?? "?"}${typeof value.percentage === "number" ? "%" : ""}.`;
    case "route_add_site":
      return `Add a ${value.siteType ?? "site"} site to ${value.routeScope ?? "the route"}.`;
    case "route_remove_site":
      return `Remove a ${value.siteType ?? "site"} site from ${value.routeScope ?? "the route"}.`;
    case "route_purge_site":
      return `Purge ${value.siteType ?? "site"} sites from ${value.routeScope ?? "the atlas"}.`;
    case "route_replace_site":
      return `Replace a ${value.fromSite ?? "site"} site with a ${value.toSite ?? "site"} site in ${value.routeScope ?? "the route"}.`;
    case "route_probability_adjustment":
      return `Adjust ${value.siteType ?? "site"} odds by ${value.probabilityDeltaPercent ?? "?"}% for ${value.routeScope ?? "future routes"}.`;
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
    typeof operation.value.worstCaseBurdenConvertedEssence === "number"
      ? `worstCaseBurden=${operation.value.worstCaseBurdenConvertedEssence}`
      : undefined,
    typeof operation.value.riskPremiumConvertedEssence === "number"
      ? `riskPremium=${operation.value.riskPremiumConvertedEssence}`
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
  const starterTargetCount = operation.payload.starterTargetCount;
  const parts = [
    typeof sourcePoolSize === "number"
      ? `Source pool size: ${sourcePoolSize}`
      : undefined,
    typeof starterTargetCount === "number"
      ? `starter cards available: ${starterTargetCount}`
      : undefined,
  ].filter((part): part is string => part !== undefined);

  return parts.length > 0 ? `${parts.join("; ")}.` : undefined;
}

function operationContractDebugText(operation: JourneyOption["operations"][number]): string[] {
  const lines: string[] = [];
  const payload = operation.payload;

  if (typeof payload.timedWindowScope === "string") {
    const timedWindowDuration = payload.timedWindowDuration;
    const duration = isRecord(timedWindowDuration) &&
      typeof timedWindowDuration.durationKind === "string" &&
      typeof timedWindowDuration.count === "number"
      ? `${timedWindowDuration.durationKind}:${timedWindowDuration.count}`
      : "unknown";
    const player = typeof payload.affectedPlayer === "string"
      ? payload.affectedPlayer
      : "unknown";
    const objectClass = typeof payload.affectedObjectClass === "string"
      ? payload.affectedObjectClass
      : "unknown";
    const modifier = typeof payload.windowModifier === "string"
      ? payload.windowModifier
      : "unknown";
    const polarity = typeof payload.polarity === "string"
      ? payload.polarity
      : "unknown";

    lines.push(
      `  Window: scope=${payload.timedWindowScope} duration=${duration} player=${player} object=${objectClass} modifier=${modifier} polarity=${polarity}.`,
    );
  }

  if (operation.operationKind === "delayed_hook") {
    if (operation.triggerSelector) {
      lines.push(`  Trigger: ${operation.triggerSelector.triggerKind} (${operation.triggerSelector.label}).`);
    }

    if (operation.trackedCondition) {
      lines.push(`  Tracks: ${operation.trackedCondition}`);
    }

    if (operation.resolution) {
      lines.push(`  Resolves: ${operation.resolution}`);
    }

    if (operation.expiration) {
      lines.push(`  Expires: ${operation.expiration.label}`);
    }

    if (operation.duration) {
      lines.push(`  Duration: ${operation.duration.label}.`);
    }

    if (operation.controlledScene) {
      lines.push(`  Scene: ${operation.controlledScene.sceneKind} ${operation.controlledScene.label}.`);
    }

    if (operation.visibilityPolicy) {
      lines.push(`  Visibility: ${operation.visibilityPolicy.outcomeVisibility}; ${operation.visibilityPolicy.disclosure}`);
    }

    if (operation.hookBudgetCost !== undefined) {
      lines.push(`  Hook budget cost: ${operation.hookBudgetCost}.`);
    }
  }

  if (operation.operationKind === "paired_return" && operation.contract) {
    lines.push(
      `  Paired return: ${operation.contract.pairedReturnId}; created=${operation.contract.created.referenceId}; scene=${operation.contract.returnScene.returnSceneKind}.`,
      `  Return trigger: ${operation.contract.returnScene.triggerSelector.triggerKind} (${operation.contract.returnScene.triggerSelector.label}).`,
      `  Return resolution: ${operation.contract.returnScene.resolution}`,
      `  Return expiration: ${operation.contract.returnScene.expiration.label}`,
    );
  }

  return lines;
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

    lines.push(...operationContractDebugText(operation));
  }

  return lines;
}

function fingerprintDebugLines(manifest: JourneyManifest): string[] {
  const fingerprint = manifest.distinctness ?? manifest.debug.semanticFingerprint;
  const components = fingerprint.components ?? [];
  const equivalenceBands = fingerprint.equivalenceBands ?? [];
  const lines = [
    `Semantic fingerprint: ${fingerprint.value} (${fingerprint.algorithm}).`,
    "Fingerprint components:",
  ];

  if (components.length === 0) {
    lines.push("  none");
  } else {
    for (const component of components) {
      lines.push(`  ${component}`);
    }
  }

  lines.push("Equivalence bands:");
  if (equivalenceBands.length === 0) {
    lines.push("  none");
  } else {
    for (const band of equivalenceBands) {
      lines.push(`  ${band.field}:${band.band} - ${band.description}`);
    }
  }

  return lines;
}

function reachabilityDebugLines(manifest: JourneyManifest): string[] {
  const reachability = manifest.debug.reachability;

  if (!reachability) {
    return [];
  }

  return [
    "",
    "Reachability:",
    `Mode: ${reachability.generatorMode}; evidence=${reachability.evidenceSource}.`,
    `Shape topology: ${reachability.shapeTopology}.`,
    `Payload families: ${reachability.payloadFamilies.join(", ") || "none"}.`,
    `Selector families: ${reachability.selectorFamilies.join(", ") || "none"}.`,
    `Timing families: ${reachability.timingFamilies.join(", ") || "none"}.`,
    ...(reachability.debugFixture
      ? [
          `Debug fixture: ${reachability.debugFixture.qaId}; coverage=${reachability.debugFixture.coverageKind ?? "debug_fixture"}.`,
        ]
      : []),
    "Feature decisions:",
    ...reachability.featureDecisions.map((decision) => {
      const families = decision.evidenceFamilies.length > 0
        ? ` families=${decision.evidenceFamilies.join(",")}`
        : "";
      const paths = decision.evidencePaths.length > 0
        ? ` paths=${decision.evidencePaths.join(",")}`
        : "";

      return `  ${decision.family}: ${decision.status}; ${decision.reason}${families}${paths}`;
    }),
  ];
}

function generatedObjectDebugLines(manifest: JourneyManifest): string[] {
  const generatedObjects = Array.isArray(manifest.generatedObjects)
    ? manifest.generatedObjects
    : [];

  if (generatedObjects.length === 0) {
    return [];
  }

  const lines = ["", "Generated objects:"];

  for (const generatedObject of generatedObjects) {
    const references = Object.entries(generatedObject.references)
      .flatMap(([kind, values]) =>
        Array.isArray(values) && values.length > 0 ? [`${kind}=${values.join(",")}`] : []
      )
      .join("; ");
    const duration = generatedObject.duration?.label ?? generatedObject.lifetime ?? "unspecified lifetime";

    lines.push(
      `${generatedObject.generatedObjectId}: ${generatedObject.name} (${generatedObject.generatedObjectKind}; ${generatedObject.objectType}).`,
      `  Rules: ${generatedObject.rulesText}`,
      `  Source: ${generatedObject.validation.source}; validation=${generatedObject.validation.status}; duration=${duration}.`,
      `  Value estimate: ${generatedObject.valueEstimate.convertedEssence} essence (${generatedObject.valueEstimate.confidence}); ${generatedObject.valueEstimate.basis}`,
      `  References: ${references || "none"}.`,
    );
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

  lines.push(...fingerprintDebugLines(manifest));
  lines.push(...reachabilityDebugLines(manifest));

  if (manifest.debug.symmetryContracts?.length) {
    lines.push("", "Symmetry contracts:");
    for (const contract of manifest.debug.symmetryContracts) {
      const sharedKeys = contract.sharedPayloadKeys?.length
        ? ` shared=${contract.sharedPayloadKeys.join(",")}`
        : "";
      const variedKeys = contract.variedPayloadKeys?.length
        ? ` varied=${contract.variedPayloadKeys.join(",")}`
        : "";

      lines.push(
        `${contract.contractKind}: shared ${contract.sharedProperty}; varied ${contract.variedProperty}; options ${contract.optionNumbers.join(",")}.${sharedKeys}${variedKeys}`,
      );
    }
  }

  lines.push(...operationDebugLines(manifest));
  lines.push(...generatedObjectDebugLines(manifest));
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
