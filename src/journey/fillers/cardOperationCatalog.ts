import { shuffleDeterministic, type DrawContext } from "../../util/rng.js";
import { BATTLE_WINDOW_DURATION, chosenCardText } from "./shared.js";

export type CardOperationTopology =
  | "one_target_many_operations"
  | "mirrored_operations"
  | "one_operation_many_targets";

export type CardOperationTargetClass =
  | "draft_card"
  | "deck_card"
  | "starter_card";

export type CardOperationValueBand = "standard" | "premium" | "temporary";

export type CardOperationTiming = "immediate" | "battle_window";

export type CardOperationFamily =
  | "transfiguration"
  | "keyword"
  | "cost"
  | "copy"
  | "text"
  | "timing";

export type MaterializedCardOperation = {
  key: string;
  family: CardOperationFamily;
  valueBand: CardOperationValueBand;
  timing: CardOperationTiming;
  renderText: (targetText: string) => string;
  effect: Record<string, unknown>;
  value: number;
  uncertainty?: number;
};

type CardOperationCatalogEntry = MaterializedCardOperation & {
  topologies: readonly CardOperationTopology[];
  targetClasses: readonly CardOperationTargetClass[];
};

type CardOperationRequest = {
  topology: CardOperationTopology;
  targetClasses: readonly CardOperationTargetClass[];
  valueBands?: readonly CardOperationValueBand[];
  timings?: readonly CardOperationTiming[];
  families?: readonly CardOperationFamily[];
  label: string;
  count: number;
};

const ALL_TARGET_CLASSES = [
  "draft_card",
  "deck_card",
  "starter_card",
] as const satisfies readonly CardOperationTargetClass[];

const ALL_NORMAL_TOPOLOGIES = [
  "one_target_many_operations",
  "mirrored_operations",
  "one_operation_many_targets",
] as const satisfies readonly CardOperationTopology[];

function transfigurationEntry(
  transfigurationName: string,
): CardOperationCatalogEntry {
  return {
    key: `transfigure-${transfigurationName.toLowerCase()}`,
    family: "transfiguration",
    valueBand: "standard",
    timing: "immediate",
    topologies: ALL_NORMAL_TOPOLOGIES,
    targetClasses: ALL_TARGET_CLASSES,
    renderText: (targetText) =>
      `Apply {${transfigurationName} Transfiguration} to ${targetText}.`,
    effect: { kind: "transfiguration", transfigurationName },
    value: 100,
  };
}

const CARD_OPERATION_CATALOG: readonly CardOperationCatalogEntry[] = [
  ...["Bronze", "Scarlet", "Viridian", "Golden", "Prismatic"].map(
    transfigurationEntry,
  ),
  {
    key: "add-fast",
    family: "keyword",
    valueBand: "standard",
    timing: "immediate",
    topologies: ALL_NORMAL_TOPOLOGIES,
    targetClasses: ALL_TARGET_CLASSES,
    renderText: (targetText) => `Add Fast to ${targetText}.`,
    effect: { kind: "card_rewrite", keyword: "Fast" },
    value: 95,
  },
  {
    key: "add-reclaim",
    family: "keyword",
    valueBand: "standard",
    timing: "immediate",
    topologies: ALL_NORMAL_TOPOLOGIES,
    targetClasses: ALL_TARGET_CLASSES,
    renderText: (targetText) => `Add Reclaim 1 to ${targetText}.`,
    effect: { kind: "card_rewrite", keyword: "Reclaim", amount: 1 },
    value: 95,
  },
  {
    key: "reduce-cost",
    family: "cost",
    valueBand: "standard",
    timing: "immediate",
    topologies: ALL_NORMAL_TOPOLOGIES,
    targetClasses: ALL_TARGET_CLASSES,
    renderText: (targetText) => `Reduce the cost of ${targetText} by 1.`,
    effect: { kind: "card_rewrite", field: "energy_cost", amount: -1 },
    value: 95,
  },
  {
    key: "duplicate",
    family: "copy",
    valueBand: "premium",
    timing: "immediate",
    topologies: ["one_operation_many_targets"],
    targetClasses: ALL_TARGET_CLASSES,
    renderText: (targetText) => `Duplicate ${targetText}.`,
    effect: { kind: "card_duplicate" },
    value: 105,
  },
  {
    key: "add-foresee",
    family: "text",
    valueBand: "standard",
    timing: "immediate",
    topologies: ALL_NORMAL_TOPOLOGIES,
    targetClasses: ALL_TARGET_CLASSES,
    renderText: (targetText) => `Add "Foresee 1" to ${targetText}.`,
    effect: {
      kind: "card_text_modification",
      textModification: "Add Foresee 1",
    },
    value: 95,
  },
  {
    key: "opening-hand-window",
    family: "timing",
    valueBand: "temporary",
    timing: "battle_window",
    topologies: ["one_operation_many_targets"],
    targetClasses: ["deck_card", "starter_card"],
    renderText: (targetText) =>
      `${targetText} appears in your opening hand for the next 3 battles.`,
    effect: { kind: "card_opening_hand", duration: BATTLE_WINDOW_DURATION },
    value: 105,
    uncertainty: -10,
  },
  {
    key: "temporary-copy-window",
    family: "copy",
    valueBand: "temporary",
    timing: "battle_window",
    topologies: ["one_operation_many_targets"],
    targetClasses: ["deck_card", "starter_card"],
    renderText: (targetText) =>
      `Create a temporary copy of ${targetText} for the next 3 battles.`,
    effect: {
      kind: "card_temporary_copy",
      duration: BATTLE_WINDOW_DURATION,
      copyCount: 1,
      temporary: true,
    },
    value: 110,
    uncertainty: -10,
  },
  {
    key: "reduce-cost-window",
    family: "cost",
    valueBand: "temporary",
    timing: "battle_window",
    topologies: ["one_target_many_operations"],
    targetClasses: ALL_TARGET_CLASSES,
    renderText: (targetText) =>
      `Reduce the cost of ${targetText} by 1 for the next 3 battles.`,
    effect: {
      kind: "card_rewrite",
      field: "energy_cost",
      amount: -1,
      duration: BATTLE_WINDOW_DURATION,
    },
    value: 105,
    uncertainty: -10,
  },
];

function includesAll<T>(
  available: readonly T[],
  requested: readonly T[],
): boolean {
  return requested.every((entry) => available.includes(entry));
}

function matchesRequest(
  entry: CardOperationCatalogEntry,
  request: CardOperationRequest,
): boolean {
  return (
    entry.topologies.includes(request.topology) &&
    includesAll(entry.targetClasses, request.targetClasses) &&
    (!request.valueBands || request.valueBands.includes(entry.valueBand)) &&
    (!request.timings || request.timings.includes(entry.timing)) &&
    (!request.families || request.families.includes(entry.family))
  );
}

export function compatibleCardOperations(
  drawContext: DrawContext,
  request: CardOperationRequest,
): MaterializedCardOperation[] {
  const candidates = CARD_OPERATION_CATALOG.filter((entry) =>
    matchesRequest(entry, request),
  );

  if (candidates.length < request.count) {
    throw new Error(
      `Card operation catalog has ${candidates.length} compatible entries for ${request.topology}; ${request.count} required`,
    );
  }

  return shuffleDeterministic(drawContext, request.label, candidates)
    .slice(0, request.count)
    .map(
      ({
        topologies: _topologies,
        targetClasses: _targetClasses,
        ...operation
      }) => operation,
    );
}

export function renderChosenCardOperationText(
  operation: MaterializedCardOperation,
): string {
  return operation.renderText(chosenCardText());
}
