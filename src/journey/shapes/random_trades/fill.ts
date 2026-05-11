import { resolveCardTargets } from "../../effects.js";
import { drawInt, weightedChoice, type DrawContext } from "../../../util/rng.js";
import {
  CARD_DRAFT_CHOICE_COUNT,
  CARD_DRAFT_PROFILES,
  GENERIC_CARD_DRAFT_PROFILE,
  cardDraftPredicate,
  optionFromResolvedShapeFill,
  stableSignature,
  symmetryContract,
} from "../../fillers/shared.js";
import { adaptGenericBundleToFillOption } from "../service_menu/genericBundleAdapter.js";
import {
  genericBundleOption,
  type BundleCostSource,
  type BundleOptionPayload,
  type BundleRewardSource,
} from "../service_menu/genericBundleOption.js";
import type { JourneyContext } from "../../../quest/context.js";
import type { JourneyOption } from "../../manifest.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";
import { ROW_POOL_CONFIGURATIONS, type RowPool } from "./rowPools.js";

// Stable RNG namespace — kept at the original shape ID to preserve seed
// determinism across the rename to `random_trades`.
const SHAPE_LABEL = "independent_rows_menu";

const MAX_ROW_RESAMPLES = 8;

function childContext(parent: DrawContext, step: number): DrawContext {
  return {
    ...parent,
    sequenceStep: (parent.sequenceStep ?? 0) * 100 + step + 1,
  };
}

function rowSignature(
  pool: RowPool,
  cost: BundleCostSource,
  reward: BundleRewardSource,
): string {
  return JSON.stringify([pool.id, cost, reward]);
}

function costAxisSignature(cost: BundleCostSource): string {
  return JSON.stringify(["cost", cost]);
}

function rewardAxisSignature(reward: BundleRewardSource): string {
  return JSON.stringify(["reward", reward]);
}

function pickPool(
  drawContext: DrawContext,
  label: string,
  pools: readonly RowPool[],
): RowPool {
  return weightedChoice(
    drawContext,
    label,
    pools.map((entry) => ({
      item: entry,
      weight: entry.weight,
    })),
  );
}

function costIsViable(
  cost: BundleCostSource,
  context: JourneyContext,
): boolean {
  switch (cost.kind) {
    case "fixed_essence":
      return context.state.quest.resources.essence >= cost.amount;
    case "delayed_bane":
    case "burden_pool":
      return true;
    default:
      return true;
  }
}

function rewardIsViable(
  reward: BundleRewardSource,
  context: JourneyContext,
): boolean {
  switch (reward.kind) {
    case "fixed_card_draft":
    case "random_card_gain":
    case "named_card_grant": {
      const profile =
        reward.profileId === "any_basic"
          ? GENERIC_CARD_DRAFT_PROFILE
          : CARD_DRAFT_PROFILES[reward.profileId];
      const matches = resolveCardTargets(
        context.content,
        context.state.quest,
        cardDraftPredicate(profile),
      );
      return matches.length >= CARD_DRAFT_CHOICE_COUNT;
    }
    case "starter_cleanup":
      return context.state.quest.deck.summary.starterCards >= reward.count;
    case "essence_gain":
      return true;
    default:
      return true;
  }
}

type ViablePool = {
  readonly pool: RowPool;
  readonly costSources: readonly BundleCostSource[];
  readonly rewardSources: readonly BundleRewardSource[];
};

function viablePoolsFor(context: JourneyContext): readonly ViablePool[] {
  const viable: ViablePool[] = [];
  for (const pool of ROW_POOL_CONFIGURATIONS) {
    const costSources = pool.costSources.filter((c) => costIsViable(c, context));
    const rewardSources = pool.rewardSources.filter((r) => rewardIsViable(r, context));
    if (costSources.length > 0 && rewardSources.length > 0) {
      viable.push({ pool, costSources, rewardSources });
    }
  }
  return viable;
}

/**
 * Picks a `(pool, cost, reward)` triple for the row at `index` such that
 * neither the row tuple nor its individual cost/reward axis values have
 * already been seen. The function widens the search by stepping through
 * pools and source indices in a deterministic order so that distinct rows
 * are achievable as long as the registry holds enough combinations.
 *
 * Per-axis distinctness aligns with the `distinct_everything_trio` symmetry
 * contract emitted by the fill: every row varies on every declared axis.
 */
function pickDistinctRow(
  drawContext: DrawContext,
  index: number,
  viablePools: readonly ViablePool[],
  seenTuples: ReadonlySet<string>,
  seenCosts: ReadonlySet<string>,
  seenRewards: ReadonlySet<string>,
): { pool: RowPool; cost: BundleCostSource; reward: BundleRewardSource } | undefined {
  if (viablePools.length === 0) {
    return undefined;
  }

  const pools = viablePools.map((v) => v.pool);

  for (let attempt = 0; attempt < MAX_ROW_RESAMPLES; attempt += 1) {
    const attemptContext: DrawContext = {
      ...drawContext,
      selectionAttempt: (drawContext.selectionAttempt ?? 0) * 100 + attempt + 1,
    };
    const pool = pickPool(
      attemptContext,
      `${SHAPE_LABEL}:pool:${index}`,
      pools,
    );
    const viable = viablePools.find((v) => v.pool === pool)!;
    const costIndex = drawInt(
      attemptContext,
      `${SHAPE_LABEL}:cost:${index}`,
      0,
      viable.costSources.length - 1,
    );
    const rewardIndex = drawInt(
      attemptContext,
      `${SHAPE_LABEL}:reward:${index}`,
      0,
      viable.rewardSources.length - 1,
    );
    const cost = viable.costSources[costIndex]!;
    const reward = viable.rewardSources[rewardIndex]!;

    if (
      !seenTuples.has(rowSignature(pool, cost, reward)) &&
      !seenCosts.has(costAxisSignature(cost)) &&
      !seenRewards.has(rewardAxisSignature(reward))
    ) {
      return { pool, cost, reward };
    }
  }

  // Deterministic exhaustive fallback: walk viable triples in declaration
  // order and return the first whose signature, cost axis, and reward axis
  // are all unseen.
  for (const { pool, costSources, rewardSources } of viablePools) {
    for (const cost of costSources) {
      for (const reward of rewardSources) {
        if (
          !seenTuples.has(rowSignature(pool, cost, reward)) &&
          !seenCosts.has(costAxisSignature(cost)) &&
          !seenRewards.has(rewardAxisSignature(reward))
        ) {
          return { pool, cost, reward };
        }
      }
    }
  }

  return undefined;
}

/**
 * Fill function for the `random_trades` shape. Each row independently
 * chooses a pool from `ROW_POOL_CONFIGURATIONS`, then picks one cost source
 * and one reward source from that pool. Rows are guaranteed pairwise
 * distinct on the (pool, cost, reward) tuple via deterministic resampling.
 *
 * Returns `undefined` only in pathological cases: the underlying composer
 * cannot produce a payload (e.g. a needed cost slot is unavailable) or the
 * registry is too narrow to satisfy the requested row count distinctly.
 */
export function randomTradesFill(
  args: ShapeFillArgs,
): FilledJourney | undefined {
  const { context, drawContext, stage } = args;
  const viablePools = viablePoolsFor(context);
  if (viablePools.length === 0) {
    return undefined;
  }
  const rowCount = drawInt(drawContext, `${SHAPE_LABEL}:row-count`, 2, 3);
  const options: JourneyOption[] = [];
  const optionPayloads: (readonly BundleOptionPayload[])[] = [];
  const seenSignatures = new Set<string>();
  const seenCosts = new Set<string>();
  const seenRewards = new Set<string>();

  for (let i = 0; i < rowCount; i += 1) {
    const pick = pickDistinctRow(
      drawContext,
      i,
      viablePools,
      seenSignatures,
      seenCosts,
      seenRewards,
    );

    if (pick === undefined) {
      return undefined;
    }

    const { pool, cost, reward } = pick;
    seenSignatures.add(rowSignature(pool, cost, reward));
    seenCosts.add(costAxisSignature(cost));
    seenRewards.add(rewardAxisSignature(reward));

    const intermediate = genericBundleOption({
      context,
      drawContext: childContext(drawContext, i),
      label: `${SHAPE_LABEL}-${i}`,
      stage,
      costSource: cost,
      rewardSource: reward,
    });

    if (intermediate === undefined) {
      return undefined;
    }

    const fillOption = adaptGenericBundleToFillOption({
      identity: { fillKind: `independent_rows_menu:${pool.id}` },
      intermediate,
      stage,
      number: i + 1,
    });
    options.push(optionFromResolvedShapeFill(fillOption));
    optionPayloads.push(intermediate.payloads);
  }

  const contract = symmetryContract({
    contractKind: "distinct_everything_trio",
    sharedProperty: "none",
    variedProperty: "cost+reward",
    sharedFirst: false,
    optionNumbers: options.map((o) => o.number),
    variedPayloadKeys: optionPayloads.flatMap((payloads) =>
      payloads.map(
        (p) => `${p.kind}=${stableSignature(p)}`,
      ),
    ),
  });

  return { options, precommitted: {}, symmetryContracts: [contract] };
}
