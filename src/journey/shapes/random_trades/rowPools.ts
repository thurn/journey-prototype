import type {
  BundleCostSource,
  BundleRewardSource,
} from "../service_menu/genericBundleOption.js";

/**
 * Declarative configuration for a single "row pool" used by the
 * `random_trades` shape. Each row in the assembled menu picks one
 * pool, then independently selects one cost source and one reward source
 * from that pool. Pools are weighted so the registry can bias the menu's
 * archetype mix without forcing per-row coupling.
 *
 * Pools are intentionally narrow: the cost-source list within a pool should
 * be flavor-coherent (e.g. all essence prices, or all delayed-bane gains)
 * so a row's cost/reward pairing reads as a single archetype.
 */
export type RowPool = {
  readonly id: string;
  readonly weight: number;
  readonly costSources: readonly BundleCostSource[];
  readonly rewardSources: readonly BundleRewardSource[];
};

/**
 * The seed registry of row pools. Future tasks may expand this list; the
 * fill function relies only on the union shape and selects pools/sources
 * deterministically via the journey draw context.
 */
export const ROW_POOL_CONFIGURATIONS: readonly RowPool[] = [
  {
    id: "essence_for_card_draft",
    weight: 3,
    costSources: [
      { kind: "fixed_essence", amount: 80 },
      { kind: "fixed_essence", amount: 110 },
      { kind: "fixed_essence", amount: 140 },
    ],
    rewardSources: [
      { kind: "fixed_card_draft", profileId: "any_basic" },
      { kind: "fixed_card_draft", profileId: "legendaryCards" },
    ],
  },
  {
    id: "delayed_bane_for_essence_gain",
    weight: 2,
    costSources: [
      { kind: "delayed_bane", baneCount: 1, timing: "next_2_battles" },
      { kind: "delayed_bane", baneCount: 1, timing: "next_3_battles" },
    ],
    rewardSources: [
      { kind: "essence_gain", amount: 120 },
      { kind: "essence_gain", amount: 160 },
    ],
  },
  {
    id: "burden_for_named_card",
    weight: 2,
    costSources: [
      { kind: "burden_pool", pool: "scissor_saint_burdens" },
      { kind: "burden_pool", pool: "withered_orchard_burdens" },
    ],
    rewardSources: [
      { kind: "named_card_grant", profileId: "any_basic" },
      { kind: "named_card_grant", profileId: "legendaryCards" },
    ],
  },
];
