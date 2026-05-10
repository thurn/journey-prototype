import type { JourneyManifest, JourneyOption } from "../../manifest.js";
import { isRecord } from "../../validate/guards.js";
import { fail, type ValidationResult } from "../../validate/result.js";
import type {
  BundleCostSource,
  BundleRewardSource,
} from "../service_menu/genericBundleOption.js";
import type { ShapeValidator } from "../types.js";
import { ROW_POOL_CONFIGURATIONS, type RowPool } from "./rowPools.js";

/**
 * Static mapping from a burden-pool id to the Bane name that pool advertises.
 * Mirrors the table in `genericBundleOption.ts` so validators can recognize a
 * `burden_pool` cost without importing private constants.
 */
const BURDEN_POOL_BANE_NAMES: Record<string, string> = {
  scissor_saint_burdens: "Doubt",
  withered_orchard_burdens: "Despair",
  molting_archive_burdens: "Oblivion",
};

const DELAYED_BANE_TIMING_LABELS: Record<string, string> = {
  next_2_battles: "next 2 battles",
  next_3_battles: "next 3 battles",
  next_4_battles: "next 4 battles",
};

/**
 * Profile predicate signature for a card-draft profile id. Matches the shape
 * stored on `card_draft` and `card_gain` payload predicates so the option's
 * recovered signature compares equal to the registry's expected signature.
 */
function cardDraftPredicateSignature(profileId: string): string {
  // The fill maps profile ids to predicates whose `cardType`/`subtype` shape is
  // mirrored here. `any_basic` produces the generic empty-predicate profile.
  switch (profileId) {
    case "any_basic":
      return "{}";
    case "warriors":
      return JSON.stringify({ cardType: "Character", subtype: "Warrior" });
    case "survivors":
      return JSON.stringify({ cardType: "Character", subtype: "Survivor" });
    case "spiritAnimals":
      return JSON.stringify({ cardType: "Character", subtype: "Spirit Animal" });
    case "events":
      return JSON.stringify({ cardType: "Event" });
    case "characters":
      return JSON.stringify({ cardType: "Character" });
    case "lowCostCharacters":
      return JSON.stringify({ cardType: "Character", maxCost: 2 });
    case "legendaryCards":
      return JSON.stringify({ rarity: "legendary" });
    default:
      return JSON.stringify({ profileId });
  }
}

function predicateProfileSignature(predicate: unknown): string {
  if (!isRecord(predicate)) {
    return "{}";
  }

  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(predicate)) {
    if (key === "source") {
      continue;
    }
    filtered[key] = value;
  }

  return JSON.stringify(filtered);
}

function costSignatureFromSource(source: BundleCostSource): string | undefined {
  switch (source.kind) {
    case "fixed_essence":
      return `essence:${source.amount}`;
    case "delayed_bane": {
      const baneName = source.baneName ?? "Nightmare";
      const label = DELAYED_BANE_TIMING_LABELS[source.timing] ?? source.timing;
      return `bane_delayed:${baneName}:${source.baneCount}:${label}`;
    }
    case "burden_pool": {
      const baneName = BURDEN_POOL_BANE_NAMES[source.pool] ?? source.pool;
      return `bane_pool:${baneName}`;
    }
    default:
      return undefined;
  }
}

function costSignatureFromOption(option: JourneyOption): string | undefined {
  for (const entry of option.costs) {
    if (
      isRecord(entry) &&
      entry.kind === "essence" &&
      typeof entry.amount === "number"
    ) {
      return `essence:${entry.amount}`;
    }
  }

  for (const entry of option.burdens) {
    if (!isRecord(entry) || entry.kind !== "bane_gain") {
      continue;
    }

    const baneName = typeof entry.baneName === "string" ? entry.baneName : "Nightmare";
    const count = typeof entry.count === "number" ? entry.count : 1;

    if (entry.delayed === true && typeof entry.duration === "string") {
      return `bane_delayed:${baneName}:${count}:${entry.duration}`;
    }

    return `bane_pool:${baneName}`;
  }

  return undefined;
}

function rewardSignatureFromSource(source: BundleRewardSource): string | undefined {
  switch (source.kind) {
    case "fixed_card_draft":
      return `card_draft:${cardDraftPredicateSignature(source.profileId)}`;
    case "random_card_gain":
      return `card_gain:${cardDraftPredicateSignature(source.profileId)}`;
    case "named_card_grant":
      return `card_gain:${cardDraftPredicateSignature(source.profileId)}`;
    case "essence_gain":
      return `essence_gain:${source.amount}`;
    case "starter_cleanup":
      return `starter_cleanup:${source.count}`;
    default:
      return undefined;
  }
}

function rewardSignatureFromOption(option: JourneyOption): string | undefined {
  for (const entry of option.effects) {
    if (!isRecord(entry)) {
      continue;
    }

    if (entry.kind === "card_draft") {
      return `card_draft:${predicateProfileSignature(entry.predicate)}`;
    }

    if (entry.kind === "card_gain") {
      return `card_gain:${predicateProfileSignature(entry.predicate)}`;
    }

    if (entry.kind === "gain_essence" && typeof entry.amount === "number") {
      return `essence_gain:${entry.amount}`;
    }

    if (entry.kind === "starter_cleanup" && typeof entry.count === "number") {
      return `starter_cleanup:${entry.count}`;
    }
  }

  return undefined;
}

type RowSignaturePair = {
  readonly cost: string;
  readonly reward: string;
};

function poolAllowedPairs(pool: RowPool): RowSignaturePair[] {
  const pairs: RowSignaturePair[] = [];

  for (const costSource of pool.costSources) {
    const cost = costSignatureFromSource(costSource);
    if (cost === undefined) {
      continue;
    }
    for (const rewardSource of pool.rewardSources) {
      const reward = rewardSignatureFromSource(rewardSource);
      if (reward === undefined) {
        continue;
      }
      pairs.push({ cost, reward });
    }
  }

  return pairs;
}

function allowedPairKey(pair: RowSignaturePair): string {
  return `${pair.cost}|${pair.reward}`;
}

function buildAllowedPairKeys(): Set<string> {
  const keys = new Set<string>();

  for (const pool of ROW_POOL_CONFIGURATIONS) {
    for (const pair of poolAllowedPairs(pool)) {
      keys.add(allowedPairKey(pair));
    }
  }

  return keys;
}

function validateEachRowDrawsFromConfiguredPool(
  manifest: JourneyManifest,
): ValidationResult {
  const allowed = buildAllowedPairKeys();

  for (const option of manifest.options) {
    if (option.pickBehavior === "leave") {
      continue;
    }

    const cost = costSignatureFromOption(option);
    const reward = rewardSignatureFromOption(option);

    if (cost === undefined || reward === undefined) {
      return fail(
        "each_row_draws_from_configured_pool",
        "Independent row option must expose a cost source and reward source recognizable as a configured row pool entry",
      );
    }

    const key = allowedPairKey({ cost, reward });

    if (!allowed.has(key)) {
      return fail(
        "each_row_draws_from_configured_pool",
        "Independent row option uses a (cost, reward) pair that is not in any registered row pool's cartesian product",
      );
    }
  }

  return { ok: true };
}

function validateRowsArePairwiseDistinct(
  manifest: JourneyManifest,
): ValidationResult {
  const seen = new Set<string>();

  for (const option of manifest.options) {
    if (option.pickBehavior === "leave") {
      continue;
    }

    const cost = costSignatureFromOption(option);
    const reward = rewardSignatureFromOption(option);

    if (cost === undefined || reward === undefined) {
      // The companion `each_row_draws_from_configured_pool` validator reports
      // the missing-source case; skip distinctness for unrecognizable rows so
      // the failure surfaces against the more specific rule.
      continue;
    }

    const key = `${cost}|${reward}`;

    if (seen.has(key)) {
      return fail(
        "rows_are_pairwise_distinct_on_at_least_one_axis",
        "Independent row options must not share both their cost source signature and their reward source signature",
      );
    }

    seen.add(key);
  }

  return { ok: true };
}

const eachRowDrawsFromConfiguredPool: ShapeValidator = {
  ruleId: "each_row_draws_from_configured_pool",
  passMessage:
    "Each independent row uses a (cost, reward) pair from a registered row pool.",
  checkedPayloads: ({ optionChecked }) => optionChecked,
  validate: ({ manifest }) => validateEachRowDrawsFromConfiguredPool(manifest),
};

const rowsArePairwiseDistinctOnAtLeastOneAxis: ShapeValidator = {
  ruleId: "rows_are_pairwise_distinct_on_at_least_one_axis",
  passMessage:
    "Independent rows are pairwise distinct on at least one of cost or reward axes.",
  checkedPayloads: ({ optionChecked }) => optionChecked,
  validate: ({ manifest }) => validateRowsArePairwiseDistinct(manifest),
};

export const validators: readonly ShapeValidator[] = [
  eachRowDrawsFromConfiguredPool,
  rowsArePairwiseDistinctOnAtLeastOneAxis,
];
