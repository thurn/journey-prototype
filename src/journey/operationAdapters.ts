import type {
  JourneyOperation,
  JourneyOption,
  JourneyRewardPool,
  JourneyTreeBranch,
  JourneyTreeTerminal,
  OperationValueMetadata,
  PrecommittedOutcomes,
  RandomEnvelopeOperation,
  RewardOperation,
  TargetSelector,
} from "./manifest.js";

type PayloadRecord = Record<string, unknown>;

function isRecord(value: unknown): value is PayloadRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clonePayload(value: unknown): PayloadRecord {
  return isRecord(value) ? { ...value } : { value };
}

function legacyKind(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return typeof value.kind === "string"
    ? value.kind
    : typeof value.type === "string"
      ? value.type
      : undefined;
}

function sourceFromPredicate(predicate: unknown): string | undefined {
  return isRecord(predicate) && typeof predicate.source === "string"
    ? predicate.source
    : undefined;
}

function targetSelectorFromTarget(value: unknown): TargetSelector {
  if (!isRecord(value)) {
    return { selectorKind: "none" };
  }

  const predicate = value.predicate;
  const description = typeof value.description === "string" ? value.description : undefined;
  const required = value.required === true;
  const source = sourceFromPredicate(predicate);

  if (value.kind === "card") {
    return {
      selectorKind: "card",
      ...(source === "catalog" || source === "deck" || source === "draftPool" ? { source } : {}),
      ...(description ? { description } : {}),
      ...(predicate !== undefined ? { predicate } : {}),
      required,
    };
  }

  if (value.kind === "dreamsign") {
    return {
      selectorKind: "dreamsign",
      ...(source === "catalog" || source === "active" || source === "pool" ? { source } : {}),
      ...(description ? { description } : {}),
      ...(predicate !== undefined ? { predicate } : {}),
      required,
    };
  }

  if (value.kind === "bane") {
    const names = Array.isArray(value.names)
      ? value.names.filter((entry): entry is string => typeof entry === "string")
      : undefined;

    return {
      selectorKind: "bane",
      ...(source === "vocabulary" || source === "state" ? { source } : {}),
      ...(names && names.length > 0 ? { names } : {}),
      required,
    };
  }

  return { selectorKind: "none" };
}

function targetSelectorFromPayload(value: unknown): TargetSelector | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (isRecord(value.predicate)) {
    const source = sourceFromPredicate(value.predicate);

    if (value.kind === "card_draft" || source === "draftPool" || source === "deck") {
      return {
        selectorKind: "card",
        ...(source === "catalog" || source === "deck" || source === "draftPool" ? { source } : {}),
        predicate: value.predicate,
      };
    }

    if (value.kind === "dreamsign_draft" || source === "pool" || source === "active") {
      return {
        selectorKind: "dreamsign",
        ...(source === "catalog" || source === "active" || source === "pool" ? { source } : {}),
        predicate: value.predicate,
      };
    }
  }

  if (typeof value.scope === "string" && value.scope.includes("card")) {
    return { selectorKind: "card", source: "deck", description: value.scope };
  }

  return undefined;
}

function oddsFromPayload(value: unknown): RandomEnvelopeOperation["odds"] | undefined {
  if (
    isRecord(value) &&
    isRecord(value.odds) &&
    typeof value.odds.numerator === "number" &&
    typeof value.odds.denominator === "number" &&
    typeof value.odds.percent === "number"
  ) {
    return {
      numerator: value.odds.numerator,
      denominator: value.odds.denominator,
      percent: value.odds.percent,
    };
  }

  return undefined;
}

function resourceAmount(value: unknown): number {
  return isRecord(value) && typeof value.amount === "number" ? value.amount : 0;
}

function valueMetadata(convertedEssence?: number): OperationValueMetadata | undefined {
  return convertedEssence === undefined ? undefined : { convertedEssence };
}

function adaptCost(value: unknown, operationId: string, convertedEssence?: number): JourneyOperation {
  const kind = legacyKind(value);
  const resource = kind === "omens" ? "omens" : "essence";

  return {
    operationId,
    operationKind: "cost",
    role: "cost",
    costKind: "resource",
    resource,
    amount: resourceAmount(value),
    timing: { timingKind: "immediate" },
    visibility: "visible",
    ...(valueMetadata(convertedEssence) ? { value: valueMetadata(convertedEssence) } : {}),
    ...(kind ? { legacyKind: kind } : {}),
    payload: clonePayload(value),
  };
}

function rewardKind(kind: string | undefined): Extract<JourneyOperation, { operationKind: "reward" }>["rewardKind"] {
  switch (kind) {
    case "gain_essence":
    case "gain_omens":
      return "resource";
    case "card_draft":
    case "dreamsign_draft":
    case "starter_cleanup":
    case "transfiguration":
    case "card_rewrite":
    case "card_duplicate":
    case "battle_window_modifier":
    case "random_reward":
    case "random_series":
      return kind;
    default:
      return "unknown";
  }
}

function adaptReward(
  value: unknown,
  operationId: string,
  convertedEssence?: number,
  visibility: "visible" | "precommitted" = "visible",
): RewardOperation {
  const kind = legacyKind(value);
  const targetSelector = targetSelectorFromPayload(value);

  return {
    operationId,
    operationKind: "reward",
    role: "reward",
    rewardKind: rewardKind(kind),
    visibility,
    ...(targetSelector ? { targetSelector } : {}),
    ...(valueMetadata(convertedEssence) ? { value: valueMetadata(convertedEssence) } : {}),
    ...(kind ? { legacyKind: kind } : {}),
    payload: clonePayload(value),
  };
}

function adaptBurden(value: unknown, operationId: string, convertedEssence?: number): JourneyOperation {
  const kind = legacyKind(value);
  const burdenKind = kind === "bane_gain"
    ? "bane_gain"
    : kind === "omen_loss" || kind === "essence_loss"
      ? "resource_loss"
      : "unknown";

  return {
    operationId,
    operationKind: "burden",
    role: "burden",
    burdenKind,
    timing: { timingKind: "immediate" },
    visibility: "visible",
    ...(valueMetadata(convertedEssence) ? { value: valueMetadata(convertedEssence) } : {}),
    ...(kind ? { legacyKind: kind } : {}),
    payload: clonePayload(value),
  };
}

function adaptTarget(value: unknown, operationId: string): JourneyOperation {
  const selector = targetSelectorFromTarget(value);
  const kind = legacyKind(value);

  return {
    operationId,
    operationKind: "target",
    role: "target",
    targetSelector: selector,
    visibility: "visible",
    ...(kind ? { legacyKind: kind } : {}),
    payload: clonePayload(value),
  };
}

function adaptTrigger(value: unknown, operationId: string): JourneyOperation {
  const kind = legacyKind(value) ?? "delayed_trigger";

  return {
    operationId,
    operationKind: "delayed_hook",
    role: "trigger",
    hookKind: kind,
    timing: { timingKind: "delayed", trigger: kind },
    visibility: "visible",
    legacyKind: kind,
    payload: clonePayload(value),
  };
}

function adaptRouteEdit(value: unknown, operationId: string, convertedEssence?: number): JourneyOperation {
  const kind = legacyKind(value);
  const timing = isRecord(value) && typeof value.timing === "string"
    ? value.timing
    : "";

  return {
    operationId,
    operationKind: "route_edit",
    role: "route_edit",
    editKind: kind?.includes("replacement") ? "replace_site" : "unknown",
    visibility: "visible",
    timing: {
      timingKind: "route",
      scope: timing.includes("next") ? "next_dreamscape" : "current_dreamscape",
      ...(timing ? { label: timing } : {}),
    },
    ...(isRecord(value) && typeof value.fromSite === "string" ? { fromSite: value.fromSite } : {}),
    ...(isRecord(value) && typeof value.toSite === "string" ? { toSite: value.toSite } : {}),
    ...(valueMetadata(convertedEssence) ? { value: valueMetadata(convertedEssence) } : {}),
    ...(kind ? { legacyKind: kind } : {}),
    payload: clonePayload(value),
  };
}

function adaptRandomEnvelope(value: unknown, operationId: string): JourneyOperation {
  const kind = legacyKind(value) ?? (Array.isArray(value) ? "random_series" : "random_outcome");

  return {
    operationId,
    operationKind: "random_envelope",
    role: "random",
    envelopeKind: kind,
    timing: { timingKind: "random" },
    visibility: "precommitted",
    ...(oddsFromPayload(value) ? { odds: oddsFromPayload(value) } : {}),
    legacyKind: kind,
    payload: clonePayload(value),
  };
}

function rewardPayloadsFromDelayedPrecommit(value: unknown): unknown[] {
  if (!isRecord(value) || value.reward === undefined) {
    return [];
  }

  return Array.isArray(value.reward) ? value.reward : [value.reward];
}

function adaptDelayedPrecommit(value: unknown, operationId: string): JourneyOperation {
  const trigger = isRecord(value) && typeof value.trigger === "string"
    ? value.trigger
    : "committed trigger";
  const rewardOperations = rewardPayloadsFromDelayedPrecommit(value)
    .map((reward, index) =>
      adaptReward(reward, `${operationId}:reward:${index + 1}`, undefined, "precommitted")
    );
  const payload = clonePayload(value);
  delete payload.reward;
  if (rewardOperations.length > 0) {
    payload.rewardOperations = rewardOperations;
  }

  return {
    operationId,
    operationKind: "delayed_hook",
    role: "delayed_hook",
    hookKind: trigger,
    timing: { timingKind: "delayed", trigger },
    visibility: "precommitted",
    ...(rewardOperations.length > 0 ? { rewardOperations } : {}),
    payload,
  };
}

function adaptPairedReturn(value: unknown, operationId: string): JourneyOperation {
  return {
    operationId,
    operationKind: "paired_return",
    role: "paired_return",
    visibility: "precommitted",
    ...(isRecord(value) && typeof value.anchor === "string" ? { anchor: value.anchor } : {}),
    payload: clonePayload(value),
  };
}

function adaptRecordArray(
  values: readonly unknown[],
  prefix: string,
  adapter: (value: unknown, operationId: string, convertedEssence?: number) => JourneyOperation,
  convertedEssence?: number,
): JourneyOperation[] {
  return values.map((value, index) =>
    adapter(value, `${prefix}:${index + 1}`, convertedEssence)
  );
}

export function adaptJourneyOptionOperations(option: Omit<JourneyOption, "operations" | "symbols">): JourneyOperation[] {
  const costValue = option.costs.length === 1 ? option.costConvertedEssence : undefined;
  const effectValue = option.effects.length === 1 ? option.effectConvertedEssence : undefined;
  const burdenValue = option.burdens.length === 1 ? option.burdenConvertedEssence : undefined;
  const routeValue = option.routeEffects.length === 1 ? option.effectConvertedEssence : undefined;

  return [
    ...adaptRecordArray(option.costs, `option:${option.number}:cost`, adaptCost, costValue),
    ...adaptRecordArray(option.effects, `option:${option.number}:effect`, adaptReward, effectValue),
    ...adaptRecordArray(option.burdens, `option:${option.number}:burden`, adaptBurden, burdenValue),
    ...adaptRecordArray(option.targets, `option:${option.number}:target`, adaptTarget),
    ...adaptRecordArray(option.triggers, `option:${option.number}:trigger`, adaptTrigger),
    ...adaptRecordArray(option.routeEffects, `option:${option.number}:route`, adaptRouteEdit, routeValue),
  ];
}

export function adaptTreeTerminalOperations(
  terminal: Omit<JourneyTreeTerminal, "operations">,
  prefix: string,
): JourneyOperation[] {
  return [
    ...adaptRecordArray(terminal.costs, `${prefix}:cost`, adaptCost),
    ...adaptRecordArray(terminal.effects, `${prefix}:effect`, adaptReward),
    ...adaptRecordArray(terminal.burdens, `${prefix}:burden`, adaptBurden),
    ...adaptRecordArray(terminal.targets, `${prefix}:target`, adaptTarget),
    ...adaptRecordArray(terminal.routeEffects, `${prefix}:route`, adaptRouteEdit),
  ];
}

export function adaptTreeBranchOperations(branch: Omit<JourneyTreeBranch, "operations">): JourneyOperation[] {
  return [
    ...adaptRecordArray(branch.costs, `tree:${branch.id}:cost`, adaptCost, branch.costConvertedEssence),
    ...adaptRecordArray(branch.effects, `tree:${branch.id}:effect`, adaptReward, branch.effectConvertedEssence),
    ...adaptRecordArray(branch.burdens, `tree:${branch.id}:burden`, adaptBurden, branch.burdenConvertedEssence),
    ...adaptRecordArray(branch.targets, `tree:${branch.id}:target`, adaptTarget),
    ...adaptRecordArray(branch.triggers, `tree:${branch.id}:trigger`, adaptTrigger),
    ...adaptRecordArray(branch.routeEffects, `tree:${branch.id}:route`, adaptRouteEdit, branch.effectConvertedEssence),
  ];
}

export function adaptRewardPoolOperations(pool: Omit<JourneyRewardPool, "operations">): JourneyOperation[] {
  return adaptRecordArray(
    pool.rewards,
    "reward-pool:reward",
    (value, operationId) => adaptReward(value, operationId, undefined, "precommitted"),
  );
}

export function adaptPrecommittedOperations(precommitted: Omit<PrecommittedOutcomes, "operations">): JourneyOperation[] {
  return [
    ...adaptRecordArray(precommitted.random ?? [], "precommitted:random", adaptRandomEnvelope),
    ...adaptRecordArray(precommitted.delayed ?? [], "precommitted:delayed", adaptDelayedPrecommit),
    ...adaptRecordArray(precommitted.pairedReturn ?? [], "precommitted:paired-return", adaptPairedReturn),
    ...adaptRecordArray(precommitted.routeEdits ?? [], "precommitted:route", adaptRouteEdit),
  ];
}
