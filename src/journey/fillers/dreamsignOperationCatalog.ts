import type { DreamsignContent } from "../../content/model.js";
import type { JourneyContext } from "../../quest/context.js";
import { shuffleDeterministic, type DrawContext } from "../../util/rng.js";
import type { DreamsignTargetPredicate } from "../effects.js";
import type { JourneyStage } from "../manifest.js";
import {
  DREAMSIGN_OPERATION_VALUE_CONSTANTS,
  valueDreamsignOperation,
} from "../value.js";
import { BATTLE_WINDOW_DURATION, cost } from "./shared.js";
import {
  contentBackedDreamsignCandidates,
  dreamsignExactTarget,
  namedDreamsignPayload,
  sourcePoolSizeForDreamsignSource,
  type DreamsignSelectionSource,
} from "./dreamsignPayloads.js";

export type DreamsignOperationTopology =
  | "one_target_many_operations"
  | "mirrored_operations"
  | "one_operation_many_targets"
  | "direct_menu";

export type DreamsignOperationTargetMode =
  | "chosen"
  | "exact_named"
  | "hidden_random"
  | "predicate";

export type DreamsignOperationFamily =
  | "gain"
  | "purchase"
  | "loss"
  | "purge"
  | "duplicate"
  | "copy_gain"
  | "temporary_grant"
  | "transform"
  | "pool_edit"
  | "random_reward"
  | "trade_hook"
  | "trigger_counter";

export type MaterializedDreamsignOperation = {
  key: string;
  family: DreamsignOperationFamily;
  targetSources: readonly DreamsignSelectionSource[];
  targetModes: readonly DreamsignOperationTargetMode[];
  renderText: (targetText: string) => string;
  effect: Record<string, unknown>;
  targets: unknown[];
  costs?: unknown[];
  cost?: number;
  value: number;
  uncertainty?: number;
};

type DreamsignOperationMaterializerArgs = {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage: JourneyStage;
  entry: DreamsignOperationCatalogEntry;
  requestedSources?: readonly DreamsignSelectionSource[];
};

type DreamsignOperationCatalogEntry = Omit<
  MaterializedDreamsignOperation,
  "targets"
> & {
  topologies: readonly DreamsignOperationTopology[];
  materialize?: (
    args: DreamsignOperationMaterializerArgs,
  ) => MaterializedDreamsignOperation | undefined;
};

type DreamsignOperationRequest = {
  topology: DreamsignOperationTopology;
  targetSources?: readonly DreamsignSelectionSource[];
  targetModes?: readonly DreamsignOperationTargetMode[];
  families?: readonly DreamsignOperationFamily[];
  context: JourneyContext;
  stage?: JourneyStage;
  label: string;
  count: number;
};

export type DreamsignPredicateProfile = {
  key: string;
  label: string;
  predicate: DreamsignTargetPredicate;
};

const ALL_TOPOLOGIES = [
  "one_target_many_operations",
  "mirrored_operations",
  "one_operation_many_targets",
  "direct_menu",
] as const satisfies readonly DreamsignOperationTopology[];

const ALL_SOURCES = [
  "catalog",
  "active",
  "pool",
] as const satisfies readonly DreamsignSelectionSource[];

const CHOSEN_OR_NAMED = [
  "chosen",
  "exact_named",
] as const satisfies readonly DreamsignOperationTargetMode[];

export const DREAMSIGN_PREDICATE_PROFILES = Object.freeze([
  {
    key: "neutral",
    label: "neutral Dreamsigns",
    predicate: { source: "catalog", kind: "neutral" },
  },
  {
    key: "tidal",
    label: "tidal Dreamsigns",
    predicate: { source: "catalog", kind: "tidal" },
  },
  {
    key: "quest-oriented",
    label: "quest-oriented Dreamsigns",
    predicate: { source: "catalog", orientation: "quest" },
  },
  {
    key: "battle-oriented",
    label: "battle-oriented Dreamsigns",
    predicate: { source: "catalog", orientation: "battle" },
  },
  {
    key: "selected-tide-overlap",
    label: "Dreamsigns matching selected tides",
    predicate: { source: "pool", tideOverlap: "selected" },
  },
  {
    key: "pool-only",
    label: "Dreamsign pool only",
    predicate: { source: "pool" },
  },
  {
    key: "active-only",
    label: "active Dreamsigns only",
    predicate: { source: "active" },
  },
  {
    key: "catalog-wide",
    label: "full Dreamsign catalog",
    predicate: { source: "catalog" },
  },
] as const satisfies readonly DreamsignPredicateProfile[]);

function withCompatibility(
  effect: Record<string, unknown>,
  targetModes: readonly DreamsignOperationTargetMode[],
  family: DreamsignOperationFamily,
): Record<string, unknown> {
  return {
    ...effect,
    dreamsignOperationFamily: family,
    dreamsignOperationTargetModes: [...targetModes],
  };
}

function baseEntry(
  entry: Omit<DreamsignOperationCatalogEntry, "targetModes" | "effect"> & {
    targetModes?: readonly DreamsignOperationTargetMode[];
    effect: Record<string, unknown>;
  },
): DreamsignOperationCatalogEntry {
  const targetModes = entry.targetModes ?? CHOSEN_OR_NAMED;

  return {
    ...entry,
    targetModes,
    effect: withCompatibility(entry.effect, targetModes, entry.family),
  };
}

function targetPredicateForSources(
  sources: readonly DreamsignSelectionSource[],
): Omit<DreamsignTargetPredicate, "source"> {
  if (sources.includes("pool")) {
    return { tideOverlap: "selected" };
  }

  return {};
}

function selectSourceDreamsign(
  args: DreamsignOperationMaterializerArgs,
  sources: readonly DreamsignSelectionSource[],
  predicate: Omit<DreamsignTargetPredicate, "source"> = targetPredicateForSources(sources),
) {
  const eligibleSources = args.requestedSources
    ? sources.filter((source) => args.requestedSources?.includes(source))
    : sources;

  return contentBackedDreamsignCandidates({
    context: args.context,
    stage: args.stage,
    sources: eligibleSources.length > 0 ? eligibleSources : sources,
    predicate,
  })[0];
}

function selectResultDreamsign(
  args: DreamsignOperationMaterializerArgs,
  sourceDreamsign?: DreamsignContent,
  predicate: Omit<DreamsignTargetPredicate, "source"> = {},
) {
  return contentBackedDreamsignCandidates({
    context: args.context,
    stage: args.stage,
    sources: ["catalog"],
    predicate,
  }).find((candidate) => candidate.dreamsign.id !== sourceDreamsign?.id);
}

function namedOperation(
  args: DreamsignOperationMaterializerArgs,
  overrides: {
    kind: string;
    family: DreamsignOperationFamily;
    source: DreamsignSelectionSource;
    dreamsign: DreamsignContent;
    result?: DreamsignContent;
    resultSource?: DreamsignSelectionSource;
    extra?: Record<string, unknown>;
  },
): Record<string, unknown> {
  return withCompatibility(
    namedDreamsignPayload(
      {
        kind: overrides.kind,
        dreamsign: overrides.dreamsign,
        source: overrides.source,
        result: overrides.result,
        resultSource: overrides.resultSource,
        extra: {
          ...(overrides.extra ?? {}),
          dreamsignOperationTargetMode: "exact_named",
        },
      },
      args.context,
    ),
    args.entry.targetModes,
    overrides.family,
  );
}

function materializeSourceOperation(
  args: DreamsignOperationMaterializerArgs,
  options?: {
    result?: boolean | "random";
    resultPredicate?: Omit<DreamsignTargetPredicate, "source">;
    extra?: Record<string, unknown>;
    value?: number;
  },
): MaterializedDreamsignOperation | undefined {
  const source = selectSourceDreamsign(args, args.entry.targetSources);

  if (!source) {
    return undefined;
  }

  const result = options?.result === true
    ? selectResultDreamsign(args, source.dreamsign, options.resultPredicate)
    : undefined;

  if (options?.result === true && !result) {
    return undefined;
  }

  const effect = namedOperation(args, {
    kind: args.entry.effect.kind as string,
    family: args.entry.family,
    source: source.source,
    dreamsign: source.dreamsign,
    result: result?.dreamsign,
    resultSource: result?.source,
    extra: {
      targetOrigin: source.targetOrigin,
      selectionWeight: source.weight,
      weightHooks: source.weightHooks,
      ...(options?.result === "random"
        ? {
            resultSelection: "hidden_random",
            resultPredicate: {
              source: "catalog",
              ...(options.resultPredicate ?? {}),
            },
          }
        : {}),
      ...(options?.extra ?? {}),
    },
  });

  return {
    ...args.entry,
    key: result
      ? `${args.entry.key}:${source.dreamsign.id}:${result.dreamsign.id}`
      : `${args.entry.key}:${source.dreamsign.id}`,
    effect,
    targets: [
      dreamsignExactTarget(source.dreamsign, source.source),
      ...(result ? [dreamsignExactTarget(result.dreamsign, "catalog")] : []),
    ],
    value: options?.value ?? args.entry.value,
  };
}

function materializePoolEdit(
  args: DreamsignOperationMaterializerArgs,
  operation: "add" | "remove" | "replace",
): MaterializedDreamsignOperation | undefined {
  const source = operation === "add"
    ? selectSourceDreamsign(args, ["catalog"])
    : selectSourceDreamsign(args, ["pool"]);
  const result = operation === "replace"
    ? selectResultDreamsign(args, source?.dreamsign)
    : operation === "add"
      ? source
      : undefined;

  if (!source || (operation === "replace" && !result)) {
    return undefined;
  }

  const resultDreamsign = operation === "remove"
    ? source.dreamsign
    : result?.dreamsign ?? source.dreamsign;
  const resultSource = operation === "remove"
    ? "pool"
    : result?.source ?? source.source;
  const effect = namedOperation(args, {
    kind: "dreamsign_pool_edit",
    family: "pool_edit",
    source: source.source,
    dreamsign: source.dreamsign,
    result: resultDreamsign,
    resultSource,
    extra: { poolOperation: operation },
  });

  return {
    ...args.entry,
    key: `${args.entry.key}:${operation}:${source.dreamsign.id}:${resultDreamsign.id}`,
    effect,
    targets: [
      dreamsignExactTarget(source.dreamsign, source.source),
      ...(operation === "replace" || operation === "add"
        ? [dreamsignExactTarget(resultDreamsign, resultSource)]
        : []),
    ],
    value: valueDreamsignOperation("pool_edit", { poolOperation: operation }),
  };
}

function materializeRandomReward(
  args: DreamsignOperationMaterializerArgs,
  predicate: DreamsignTargetPredicate,
): MaterializedDreamsignOperation | undefined {
  const source = predicate.source ?? "pool";
  const candidates = contentBackedDreamsignCandidates({
    context: args.context,
    stage: args.stage,
    sources: [source],
    predicate,
  });

  if (candidates.length === 0) {
    return undefined;
  }

  const rewardPoolDreamsignIds = candidates
    .slice(0, Math.min(4, candidates.length))
    .map((candidate) => candidate.dreamsign.id);
  const percent = Math.round(100 / rewardPoolDreamsignIds.length);
  const representative = candidates[0]!;
  const effect = withCompatibility(
    {
      kind: "dreamsign_random_reward",
      dreamsignOperationKind: "random_reward",
      source,
      sourcePoolSize: sourcePoolSizeForDreamsignSource(args.context, source),
      selection: "hidden_random",
      predicate,
      rewardPoolSource: source,
      rewardPoolDreamsignIds,
      timing: "immediate",
      odds: {
        numerator: 1,
        denominator: rewardPoolDreamsignIds.length,
        percent,
      },
    },
    args.entry.targetModes,
    args.entry.family,
  );

  return {
    ...args.entry,
    key: `${args.entry.key}:${source}:${representative.dreamsign.id}`,
    effect,
    targets: [
      {
        kind: "dreamsign",
        description: `random ${source} Dreamsign`,
        predicate,
        source,
        selection: "hidden_random",
        required: true,
      },
    ],
    value: valueDreamsignOperation("random_reward", {
      random: true,
      predicate,
      tideOverlap: predicate.tideOverlap === "selected",
    }),
    uncertainty: DREAMSIGN_OPERATION_VALUE_CONSTANTS.randomUncertainty,
  };
}

const DREAMSIGN_OPERATION_CATALOG: readonly DreamsignOperationCatalogEntry[] = [
  {
    ...baseEntry({
      key: "exact-named-gain",
      family: "gain",
      topologies: ALL_TOPOLOGIES,
      targetSources: ["catalog", "pool"],
      renderText: (targetText) => `Gain ${targetText}.`,
      effect: { kind: "dreamsign_gain" },
      value: valueDreamsignOperation("gain"),
    }),
    materialize: (args) => materializeSourceOperation(args),
  },
  {
    ...baseEntry({
      key: "purchase-with-essence",
      family: "purchase",
      topologies: ["direct_menu", "mirrored_operations"],
      targetSources: ["catalog", "pool"],
      renderText: (targetText) => `Buy ${targetText} for 30 essence.`,
      effect: { kind: "dreamsign_purchase" },
      costs: [cost("essence", 30)],
      cost: 30,
      value: valueDreamsignOperation("purchase"),
    }),
    materialize: (args) => materializeSourceOperation(args),
  },
  {
    ...baseEntry({
      key: "purchase-with-omen",
      family: "purchase",
      topologies: ["direct_menu", "mirrored_operations"],
      targetSources: ["catalog", "pool"],
      renderText: (targetText) => `Buy ${targetText} for 1 omen.`,
      effect: { kind: "dreamsign_purchase", purchaseCurrency: "omens", purchaseAmount: 1 },
      costs: [cost("omens", 1)],
      cost: 140,
      value: valueDreamsignOperation("purchase"),
    }),
    materialize: (args) =>
      args.context.state.quest.resources.omens > 0
        ? materializeSourceOperation(args, {
            extra: { purchaseCurrency: "omens", purchaseAmount: 1 },
          })
        : undefined,
  },
  {
    ...baseEntry({
      key: "lose-active",
      family: "loss",
      topologies: ["one_target_many_operations", "mirrored_operations"],
      targetSources: ["active"],
      renderText: (targetText) => `Lose ${targetText}.`,
      effect: { kind: "dreamsign_loss" },
      value: valueDreamsignOperation("loss"),
    }),
    materialize: (args) => materializeSourceOperation(args),
  },
  {
    ...baseEntry({
      key: "purge",
      family: "purge",
      topologies: ALL_TOPOLOGIES,
      targetSources: ["active", "pool"],
      renderText: (targetText) => `Purge ${targetText}.`,
      effect: { kind: "dreamsign_purge" },
      value: valueDreamsignOperation("purge"),
    }),
    materialize: (args) => materializeSourceOperation(args),
  },
  {
    ...baseEntry({
      key: "duplicate",
      family: "duplicate",
      topologies: ALL_TOPOLOGIES,
      targetSources: ALL_SOURCES,
      renderText: (targetText) => `Add another copy of ${targetText}.`,
      effect: { kind: "dreamsign_duplicate" },
      value: valueDreamsignOperation("duplicate"),
    }),
    materialize: (args) =>
      materializeSourceOperation(args, { extra: { copyCount: 1 } }),
  },
  {
    ...baseEntry({
      key: "copy-gain",
      family: "copy_gain",
      topologies: ALL_TOPOLOGIES,
      targetSources: ["catalog", "pool"],
      renderText: (targetText) => `Gain a copied version of ${targetText}.`,
      effect: { kind: "dreamsign_copy_gain" },
      value: valueDreamsignOperation("copy_gain"),
    }),
    materialize: (args) =>
      materializeSourceOperation(args, { extra: { copyCount: 1 } }),
  },
  {
    ...baseEntry({
      key: "temporary-grant",
      family: "temporary_grant",
      topologies: ALL_TOPOLOGIES,
      targetSources: ["catalog", "pool"],
      renderText: (targetText) =>
        `Gain ${targetText} as a temporary Dreamsign for the next 3 battles.`,
      effect: { kind: "dreamsign_temporary_grant" },
      value: valueDreamsignOperation("temporary_grant"),
      uncertainty: DREAMSIGN_OPERATION_VALUE_CONSTANTS.temporaryUncertainty,
    }),
    materialize: (args) =>
      materializeSourceOperation(args, {
        extra: { temporary: true, duration: BATTLE_WINDOW_DURATION },
      }),
  },
  {
    ...baseEntry({
      key: "transform-to-named",
      family: "transform",
      topologies: ALL_TOPOLOGIES,
      targetSources: ["active", "pool"],
      renderText: (targetText) => `Transform ${targetText} into a named Dreamsign.`,
      effect: { kind: "dreamsign_transform" },
      value: valueDreamsignOperation("transform"),
    }),
    materialize: (args) => materializeSourceOperation(args, { result: true }),
  },
  {
    ...baseEntry({
      key: "transform-to-random",
      family: "transform",
      topologies: ALL_TOPOLOGIES,
      targetSources: ["active", "pool"],
      renderText: (targetText) => `Transform ${targetText} into a random Dreamsign.`,
      effect: { kind: "dreamsign_transform" },
      value: valueDreamsignOperation("transform", { random: true }),
      uncertainty: DREAMSIGN_OPERATION_VALUE_CONSTANTS.randomUncertainty,
    }),
    materialize: (args) =>
      materializeSourceOperation(args, {
        result: "random",
        resultPredicate: { tideOverlap: "selected" },
      }),
  },
  {
    ...baseEntry({
      key: "pool-add",
      family: "pool_edit",
      topologies: ["direct_menu", "mirrored_operations"],
      targetSources: ["catalog"],
      renderText: (targetText) => `Add ${targetText} to your Dreamsign pool.`,
      effect: { kind: "dreamsign_pool_edit" },
      value: valueDreamsignOperation("pool_edit", { poolOperation: "add" }),
    }),
    materialize: (args) => materializePoolEdit(args, "add"),
  },
  {
    ...baseEntry({
      key: "pool-remove",
      family: "pool_edit",
      topologies: ["direct_menu", "mirrored_operations", "one_target_many_operations"],
      targetSources: ["pool"],
      renderText: (targetText) => `Remove ${targetText} from your Dreamsign pool.`,
      effect: { kind: "dreamsign_pool_edit" },
      value: valueDreamsignOperation("pool_edit", { poolOperation: "remove" }),
    }),
    materialize: (args) => materializePoolEdit(args, "remove"),
  },
  {
    ...baseEntry({
      key: "pool-replace",
      family: "pool_edit",
      topologies: ALL_TOPOLOGIES,
      targetSources: ["pool"],
      renderText: (targetText) =>
        `Replace ${targetText} in your Dreamsign pool with a named catalog Dreamsign.`,
      effect: { kind: "dreamsign_pool_edit" },
      value: valueDreamsignOperation("pool_edit", { poolOperation: "replace" }),
    }),
    materialize: (args) => materializePoolEdit(args, "replace"),
  },
  {
    ...baseEntry({
      key: "random-pool-reward",
      family: "random_reward",
      topologies: ["direct_menu", "mirrored_operations"],
      targetSources: ["pool"],
      targetModes: ["hidden_random", "predicate"],
      renderText: () => "Gain 1 random Dreamsign from your pool.",
      effect: { kind: "dreamsign_random_reward" },
      value: valueDreamsignOperation("random_reward", { random: true }),
      uncertainty: DREAMSIGN_OPERATION_VALUE_CONSTANTS.randomUncertainty,
    }),
    materialize: (args) =>
      materializeRandomReward(args, { source: "pool", tideOverlap: "selected" }),
  },
  {
    ...baseEntry({
      key: "random-neutral-reward",
      family: "random_reward",
      topologies: ["direct_menu", "mirrored_operations"],
      targetSources: ["catalog"],
      targetModes: ["hidden_random", "predicate"],
      renderText: () => "Gain 1 random neutral Dreamsign.",
      effect: { kind: "dreamsign_random_reward" },
      value: valueDreamsignOperation("random_reward", { random: true }),
      uncertainty: DREAMSIGN_OPERATION_VALUE_CONSTANTS.randomUncertainty,
    }),
    materialize: (args) =>
      materializeRandomReward(args, { source: "catalog", kind: "neutral" }),
  },
  {
    ...baseEntry({
      key: "trade-hook",
      family: "trade_hook",
      topologies: ["direct_menu", "mirrored_operations"],
      targetSources: ["pool"],
      renderText: (targetText) =>
        `After next battle, trade ${targetText} for a named catalog Dreamsign.`,
      effect: { kind: "dreamsign_trade_hook" },
      value: valueDreamsignOperation("trade_hook"),
      uncertainty: DREAMSIGN_OPERATION_VALUE_CONSTANTS.delayedUncertainty,
    }),
    materialize: (args) => {
      const source = selectSourceDreamsign(args, ["pool"]);
      const result = selectResultDreamsign(args, source?.dreamsign);

      if (!source || !result) {
        return undefined;
      }

      const effect = namedOperation(args, {
        kind: "dreamsign_trade_hook",
        family: "trade_hook",
        source: "pool",
        dreamsign: source.dreamsign,
        result: result.dreamsign,
        resultSource: "catalog",
        extra: {
          timing: "after next battle",
          obligation: `Trade ${source.dreamsign.name} for ${result.dreamsign.name}`,
          giveDreamsignId: source.dreamsign.id,
          giveDreamsignName: source.dreamsign.name,
          receiveDreamsignId: result.dreamsign.id,
          receiveDreamsignName: result.dreamsign.name,
        },
      });

      return {
        ...args.entry,
        key: `${args.entry.key}:${source.dreamsign.id}:${result.dreamsign.id}`,
        effect,
        targets: [
          dreamsignExactTarget(source.dreamsign, "pool"),
          dreamsignExactTarget(result.dreamsign, "catalog"),
        ],
      };
    },
  },
  {
    ...baseEntry({
      key: "trigger-counter",
      family: "trigger_counter",
      topologies: ALL_TOPOLOGIES,
      targetSources: ALL_SOURCES,
      renderText: (targetText) =>
        `Count the next 2 triggers from ${targetText}; the second trigger repeats.`,
      effect: { kind: "dreamsign_trigger_counter" },
      value: valueDreamsignOperation("trigger_counter"),
    }),
    materialize: (args) =>
      materializeSourceOperation(args, {
        extra: { trigger: "after next victory", count: 2 },
      }),
  },
];

function includesAny<T>(available: readonly T[], requested?: readonly T[]): boolean {
  return !requested || requested.some((entry) => available.includes(entry));
}

function includesAll<T>(available: readonly T[], requested?: readonly T[]): boolean {
  return !requested || requested.every((entry) => available.includes(entry));
}

function matchesRequest(
  entry: DreamsignOperationCatalogEntry,
  request: DreamsignOperationRequest,
): boolean {
  return (
    entry.topologies.includes(request.topology) &&
    includesAny(entry.targetSources, request.targetSources) &&
    includesAll(entry.targetModes, request.targetModes) &&
    (!request.families || request.families.includes(entry.family))
  );
}

function materializeOperation(
  entry: DreamsignOperationCatalogEntry,
  drawContext: DrawContext,
  request: DreamsignOperationRequest,
): MaterializedDreamsignOperation | undefined {
  if (entry.materialize) {
    return entry.materialize({
      context: request.context,
      drawContext,
      label: request.label,
      stage: request.stage ?? "mid",
      entry,
      requestedSources: request.targetSources,
    });
  }

  return {
    ...entry,
    targets: [],
  };
}

export function compatibleDreamsignOperations(
  drawContext: DrawContext,
  request: DreamsignOperationRequest,
): MaterializedDreamsignOperation[] {
  const candidates = DREAMSIGN_OPERATION_CATALOG.filter((entry) =>
    matchesRequest(entry, request),
  ).flatMap((entry) => {
    const materialized = materializeOperation(entry, drawContext, request);

    return materialized ? [materialized] : [];
  });

  if (candidates.length < request.count) {
    throw new Error(
      `Dreamsign operation catalog has ${candidates.length} compatible entries for ${request.topology}; ${request.count} required`,
    );
  }

  return shuffleDeterministic(drawContext, request.label, candidates)
    .slice(0, request.count)
    .map(({ effect, targetModes, family, ...operation }) => ({
      ...operation,
      family,
      targetModes,
      effect: withCompatibility(effect, targetModes, family),
    }));
}

export function renderChosenDreamsignOperationText(
  operation: MaterializedDreamsignOperation,
): string {
  const payload = operation.effect;
  const targetText = typeof payload.dreamsignName === "string"
    ? `{${payload.dreamsignName}}`
    : "a chosen Dreamsign";

  if (
    payload.kind === "dreamsign_transform" &&
    typeof payload.newDreamsignName === "string"
  ) {
    return `Transform ${targetText} into {${payload.newDreamsignName}}.`;
  }

  if (
    payload.kind === "dreamsign_pool_edit" &&
    payload.poolOperation === "replace" &&
    typeof payload.resultDreamsignName === "string"
  ) {
    return `Replace ${targetText} in your Dreamsign pool with {${payload.resultDreamsignName}}.`;
  }

  if (
    payload.kind === "dreamsign_trade_hook" &&
    typeof payload.receiveDreamsignName === "string"
  ) {
    return `After next battle, trade ${targetText} for {${payload.receiveDreamsignName}}.`;
  }

  return operation.renderText(targetText);
}

export const DREAMSIGN_OPERATION_DEBUG_CATALOG = Object.freeze({
  operations: Object.freeze(
    DREAMSIGN_OPERATION_CATALOG.map((entry) => Object.freeze({
      key: entry.key,
      family: entry.family,
      targetSources: Object.freeze([...entry.targetSources]),
      targetModes: Object.freeze([...entry.targetModes]),
      effect: Object.freeze({ ...entry.effect }),
    })),
  ),
  families: Object.freeze([
    ...new Set(DREAMSIGN_OPERATION_CATALOG.map((entry) => entry.family)),
  ]),
  predicates: Object.freeze(
    DREAMSIGN_PREDICATE_PROFILES.map((profile) => Object.freeze({
      key: profile.key,
      predicate: Object.freeze({ ...profile.predicate }),
    })),
  ),
});
