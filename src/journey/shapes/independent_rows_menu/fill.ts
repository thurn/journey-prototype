import { drawInt, weightedChoice, type DrawContext } from "../../../util/rng.js";
import {
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
import type { JourneyOption } from "../../manifest.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";
import { ROW_POOL_CONFIGURATIONS, type RowPool } from "./rowPools.js";

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

function pickPool(drawContext: DrawContext, label: string): RowPool {
  return weightedChoice(
    drawContext,
    label,
    ROW_POOL_CONFIGURATIONS.map((entry) => ({
      item: entry,
      weight: entry.weight,
    })),
  );
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
  seenTuples: ReadonlySet<string>,
  seenCosts: ReadonlySet<string>,
  seenRewards: ReadonlySet<string>,
): { pool: RowPool; cost: BundleCostSource; reward: BundleRewardSource } | undefined {
  for (let attempt = 0; attempt < MAX_ROW_RESAMPLES; attempt += 1) {
    const attemptContext: DrawContext = {
      ...drawContext,
      selectionAttempt: (drawContext.selectionAttempt ?? 0) * 100 + attempt + 1,
    };
    const pool = pickPool(
      attemptContext,
      `${SHAPE_LABEL}:pool:${index}`,
    );
    const costIndex = drawInt(
      attemptContext,
      `${SHAPE_LABEL}:cost:${index}`,
      0,
      pool.costSources.length - 1,
    );
    const rewardIndex = drawInt(
      attemptContext,
      `${SHAPE_LABEL}:reward:${index}`,
      0,
      pool.rewardSources.length - 1,
    );
    const cost = pool.costSources[costIndex]!;
    const reward = pool.rewardSources[rewardIndex]!;

    if (
      !seenTuples.has(rowSignature(pool, cost, reward)) &&
      !seenCosts.has(costAxisSignature(cost)) &&
      !seenRewards.has(rewardAxisSignature(reward))
    ) {
      return { pool, cost, reward };
    }
  }

  // Deterministic exhaustive fallback: walk the registry in declaration
  // order and return the first triple whose signature, cost axis, and
  // reward axis are all unseen.
  for (const pool of ROW_POOL_CONFIGURATIONS) {
    for (const cost of pool.costSources) {
      for (const reward of pool.rewardSources) {
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
 * Fill function for the `independent_rows_menu` shape. Each row independently
 * chooses a pool from `ROW_POOL_CONFIGURATIONS`, then picks one cost source
 * and one reward source from that pool. Rows are guaranteed pairwise
 * distinct on the (pool, cost, reward) tuple via deterministic resampling.
 *
 * Returns `undefined` only in pathological cases: the underlying composer
 * cannot produce a payload (e.g. a needed cost slot is unavailable) or the
 * registry is too narrow to satisfy the requested row count distinctly.
 */
export function independentRowsMenuFill(
  args: ShapeFillArgs,
): FilledJourney | undefined {
  const { context, drawContext, stage } = args;
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
