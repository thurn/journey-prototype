import { drawInt, weightedChoice, type DrawContext } from "../../../util/rng.js";
import { optionFromResolvedShapeFill } from "../../fillers/shared.js";
import { adaptGenericBundleToFillOption } from "../service_menu/genericBundleAdapter.js";
import {
  genericBundleOption,
  type BundleCostSource,
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
 * Picks a `(pool, cost, reward)` triple for the row at `index` whose
 * signature has not yet been seen. The function widens the search by
 * stepping through pools and source indices in a deterministic order so
 * that distinct rows are achievable as long as the registry holds enough
 * combinations.
 */
function pickDistinctRow(
  drawContext: DrawContext,
  index: number,
  seen: ReadonlySet<string>,
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

    if (!seen.has(rowSignature(pool, cost, reward))) {
      return { pool, cost, reward };
    }
  }

  // Deterministic exhaustive fallback: walk the registry in declaration
  // order and return the first triple whose signature is not in `seen`.
  for (const pool of ROW_POOL_CONFIGURATIONS) {
    for (const cost of pool.costSources) {
      for (const reward of pool.rewardSources) {
        if (!seen.has(rowSignature(pool, cost, reward))) {
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
  const seenSignatures = new Set<string>();

  for (let i = 0; i < rowCount; i += 1) {
    const pick = pickDistinctRow(drawContext, i, seenSignatures);

    if (pick === undefined) {
      return undefined;
    }

    const { pool, cost, reward } = pick;
    seenSignatures.add(rowSignature(pool, cost, reward));

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
  }

  return { options, precommitted: {} };
}
