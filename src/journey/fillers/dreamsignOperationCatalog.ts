import type { DreamsignContent } from "../../content/model.js";
import type { JourneyContext } from "../../quest/context.js";
import { shuffleDeterministic, type DrawContext } from "../../util/rng.js";
import type { DreamsignTargetPredicate } from "../effects.js";
import type { JourneyStage } from "../manifest.js";
import {
  DREAMSIGN_OPERATION_VALUE_CONSTANTS,
  valueDreamsignOperation,
} from "../value.js";
import {
  slotAcceptsOperation,
  type OperationCompatibilityTrait,
  type SlotCapability,
} from "./operationCompatibility.js";
import { pickAxisPoint, type PredicateAxis } from "./predicateAxes.js";
import { BATTLE_WINDOW_DURATION, cost } from "./shared.js";
import {
  contentBackedDreamsignCandidates,
  dreamsignExactTarget,
  namedDreamsignPayload,
  sourcePoolSizeForDreamsignSource,
  type DreamsignSelectionSource,
} from "./dreamsignPayloads.js";

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
  compatibilityTraits: readonly OperationCompatibilityTrait[];
  predicateAxes?: readonly PredicateAxis[];
  materialize?: (
    args: DreamsignOperationMaterializerArgs,
  ) => MaterializedDreamsignOperation | undefined;
};

type DreamsignOperationRequest = {
  slot: SlotCapability;
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

type BattleWindowProfile = {
  label: string;
  count: number;
};

const ALL_SOURCES = [
  "catalog",
  "active",
  "pool",
] as const satisfies readonly DreamsignSelectionSource[];

const CHOSEN_OR_NAMED = [
  "chosen",
  "exact_named",
] as const satisfies readonly DreamsignOperationTargetMode[];

const DREAMSIGN_TEMPORARY_GRANT_WINDOW_PROFILES: Record<
  JourneyStage,
  readonly BattleWindowProfile[]
> = {
  early: [
    { label: "next battle", count: 1 },
    { label: "next 2 battles", count: 2 },
  ],
  mid: [
    { label: "next 2 battles", count: 2 },
    { label: BATTLE_WINDOW_DURATION, count: 3 },
  ],
  late: [
    { label: "next 2 battles", count: 2 },
    { label: BATTLE_WINDOW_DURATION, count: 3 },
    { label: "next 4 battles", count: 4 },
  ],
};

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

function temporaryGrantWindowProfile(
  args: DreamsignOperationMaterializerArgs,
): BattleWindowProfile {
  return shuffleDeterministic(
    args.drawContext,
    `${args.label}:${args.entry.key}:battle-window`,
    DREAMSIGN_TEMPORARY_GRANT_WINDOW_PROFILES[args.stage],
  )[0]!;
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

export const DREAMSIGN_OPERATION_CATALOG: readonly DreamsignOperationCatalogEntry[] = [
  {
    ...baseEntry({
      key: "exact-named-gain",
      family: "gain",
      compatibilityTraits: ["needs_named_target"],
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
      compatibilityTraits: ["needs_named_target"],
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
      compatibilityTraits: ["needs_named_target"],
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
      compatibilityTraits: ["needs_named_target"],
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
      compatibilityTraits: ["needs_named_target"],
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
      compatibilityTraits: ["needs_named_target"],
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
      compatibilityTraits: ["needs_named_target"],
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
      compatibilityTraits: ["needs_named_target"],
      targetSources: ["catalog", "pool"],
      renderText: (targetText) =>
        `Gain ${targetText} as a temporary Dreamsign for the next 3 battles.`,
      effect: { kind: "dreamsign_temporary_grant" },
      value: valueDreamsignOperation("temporary_grant"),
      uncertainty: DREAMSIGN_OPERATION_VALUE_CONSTANTS.temporaryUncertainty,
    }),
    materialize: (args) => {
      const profile = temporaryGrantWindowProfile(args);
      const operation = materializeSourceOperation(args, {
        extra: {
          temporary: true,
          duration: profile.label,
          durationCount: profile.count,
        },
      });

      return operation
        ? {
            ...operation,
            key: `${operation.key}:${profile.count}-battles`,
            renderText: (targetText) =>
              `Gain ${targetText} as a temporary Dreamsign for the ${profile.label}.`,
          }
        : undefined;
    },
  },
  {
    ...baseEntry({
      key: "transform-to-named",
      family: "transform",
      compatibilityTraits: ["needs_named_target"],
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
      compatibilityTraits: ["needs_named_target"],
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
      key: "transform_to_revealed_choice",
      family: "transform",
      compatibilityTraits: ["needs_named_target", "produces_deck_mutation"],
      targetSources: ["active", "pool"],
      renderText: (targetText) =>
        `Reveal 3 Dreamsigns; transform ${targetText} into 1 of them.`,
      effect: { kind: "dreamsign_transform", revealCount: 3, chooseCount: 1 },
      value: 130,
      uncertainty: DREAMSIGN_OPERATION_VALUE_CONSTANTS.randomUncertainty,
    }),
    materialize: (args) =>
      materializeSourceOperation(args, {
        result: "random",
        extra: { revealCount: 3, chooseCount: 1 },
      }),
  },
  {
    ...baseEntry({
      key: "pool-add",
      family: "pool_edit",
      compatibilityTraits: ["needs_named_target"],
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
      compatibilityTraits: ["needs_named_target"],
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
      compatibilityTraits: ["needs_named_target"],
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
      key: "dreamsign_random_select",
      family: "random_reward",
      compatibilityTraits: ["needs_random_predicate_target"],
      targetSources: ["pool"],
      targetModes: ["hidden_random", "predicate"],
      renderText: () => "Gain 1 random quest-oriented Dreamsign from your pool.",
      effect: { kind: "dreamsign_random_reward" },
      value: valueDreamsignOperation("random_reward", { random: true }),
      uncertainty: DREAMSIGN_OPERATION_VALUE_CONSTANTS.randomUncertainty,
    }),
    predicateAxes: [
      {
        name: "orientation",
        values: ["quest", "battle"] as const,
      },
    ],
    materialize: (args) => {
      const point = pickAxisPoint(args.drawContext, args.entry.predicateAxes!);
      const orientation = point.orientation as "quest" | "battle";
      const operation = materializeRandomReward(args, {
        source: "pool",
        orientation,
        tideOverlap: "selected",
      });
      if (!operation) return undefined;
      return {
        ...operation,
        key: `${args.entry.key}:${orientation}`,
        renderText: () =>
          `Gain 1 random ${orientation}-oriented Dreamsign from your pool.`,
      };
    },
  },
  {
    ...baseEntry({
      key: "dreamsign_draft_select",
      family: "random_reward",
      compatibilityTraits: ["needs_random_predicate_target"],
      targetSources: ["catalog"],
      targetModes: ["hidden_random", "predicate"],
      renderText: () =>
        "Draft 1 quest-oriented Dreamsign from a choice of three.",
      effect: { kind: "dreamsign_random_reward", draftMode: "draft" },
      value: valueDreamsignOperation("random_reward", { random: true }),
      uncertainty: DREAMSIGN_OPERATION_VALUE_CONSTANTS.randomUncertainty,
    }),
    predicateAxes: [
      {
        name: "orientation",
        values: ["quest", "battle"] as const,
      },
    ],
    materialize: (args) => {
      const point = pickAxisPoint(args.drawContext, args.entry.predicateAxes!);
      const orientation = point.orientation as "quest" | "battle";
      const operation = materializeRandomReward(args, {
        source: "catalog",
        orientation,
      });
      if (!operation) return undefined;
      return {
        ...operation,
        key: `${args.entry.key}:${orientation}`,
        effect: {
          ...operation.effect,
          draftMode: "draft",
          choiceCount: 3,
          takeCount: 1,
        },
        renderText: () =>
          `Draft 1 ${orientation}-oriented Dreamsign from a choice of three.`,
      };
    },
  },
  {
    ...baseEntry({
      key: "trade-hook",
      family: "trade_hook",
      compatibilityTraits: ["needs_named_target"],
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
      compatibilityTraits: ["needs_named_target"],
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
    slotAcceptsOperation(request.slot, entry) &&
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
      `Dreamsign operation catalog has ${candidates.length} compatible entries for slot ${JSON.stringify(request.slot.provides)}; ${request.count} required`,
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
