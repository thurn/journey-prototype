import type { JourneyContext } from "../../../quest/context.js";
import type { JourneyStage } from "../../manifest.js";
import type { JourneyShapeId } from "../../shapes.js";
import type { ResolvedShapeFillOption } from "../../fillers/shared.js";
import type { DrawContext } from "../../../util/rng.js";
import {
  genericBundleOption,
  type BundleCostSource,
  type BundleRewardSource,
} from "./genericBundleOption.js";
import { adaptGenericBundleToFillOption } from "./genericBundleAdapter.js";

/**
 * Stable identifier for one of the four compound bundle families. New families
 * may be added in subsequent tasks; the union keeps the registry,
 * `fillKind` strings, and family-aware tests in lockstep.
 */
export type CompoundBundleFamilyId =
  | "scissor_saint"
  | "molting_archive"
  | "withered_orchard"
  | "mixed_service"
  | "bane_purge_plus_essence";

/**
 * Registry entry describing a single compound bundle family. The four entries
 * in `COMPOUND_BUNDLE_FAMILIES` reproduce the cost/reward selection of the
 * legacy `scissorSaintCompoundFill`, `moltingArchiveCompoundFill`,
 * `witheredOrchardCompoundFill`, and `mixedServiceCompoundFill` functions
 * declaratively, so adding a new family is a matter of appending a record
 * rather than authoring a new fill function.
 */
export type CompoundBundleFamily = {
  readonly id: CompoundBundleFamilyId;
  readonly weight: number;
  readonly fillKind: `compound_payload:${CompoundBundleFamilyId}`;
  readonly costSource: BundleCostSource;
  readonly rewardSource: BundleRewardSource;
};

export const COMPOUND_BUNDLE_FAMILIES: readonly CompoundBundleFamily[] = [
  {
    id: "scissor_saint",
    weight: 3,
    fillKind: "compound_payload:scissor_saint",
    costSource: { kind: "card_purge_random", randomCharacter: true },
    rewardSource: { kind: "fixed_card_draft", profileId: "survivors" },
  },
  {
    id: "molting_archive",
    weight: 3,
    fillKind: "compound_payload:molting_archive",
    costSource: { kind: "card_purge_random" },
    rewardSource: {
      kind: "random_card_gain",
      profileId: "energyGenerationCards",
      count: 3,
    },
  },
  {
    id: "withered_orchard",
    weight: 3,
    fillKind: "compound_payload:withered_orchard",
    costSource: { kind: "reward_reduction_burden", trigger: "essence_site" },
    rewardSource: { kind: "starter_cleanup", count: 1 },
  },
  {
    id: "mixed_service",
    weight: 1,
    fillKind: "compound_payload:mixed_service",
    // The legacy fill's primary reward is a content-backed dreamsign, which
    // the bundle composer cannot guarantee in a content-less context; the
    // declarative source pair preserves the family's cost/reward shape and is
    // suitable for the registry's first iteration. Additional variants will
    // be reintroduced as Task 1.3 expands the registry to multi-option fills.
    costSource: { kind: "low_essence_cost_slot" },
    rewardSource: { kind: "essence_gain", amount: 65 },
  },
  {
    // First registry-only family: demonstrates that a new pairing now requires
    // only a registry entry (plus a new cost-source variant + payload-kind
    // adapter) rather than a bespoke fill function. The cost is a delayed-bane
    // obligation paid out over the next 2 battles; the reward is a flat
    // essence gain reusing the existing `essence_gain` reward source.
    id: "bane_purge_plus_essence",
    weight: 2,
    fillKind: "compound_payload:bane_purge_plus_essence",
    costSource: { kind: "delayed_bane", baneCount: 1, timing: "next_2_battles" },
    rewardSource: { kind: "essence_gain", amount: 150 },
  },
];

export type BuildBundleFamilyOptionArgs = {
  readonly context: JourneyContext;
  readonly drawContext: DrawContext;
  readonly family: CompoundBundleFamily;
  readonly label: string;
  readonly stage: JourneyStage;
  readonly shapeId: JourneyShapeId;
};

/**
 * Builds a `ResolvedShapeFillOption` for the supplied family by composing the
 * family's declarative cost/reward sources via `genericBundleOption` and
 * adapting the intermediate shape into the standard fill option shape.
 *
 * Returns `undefined` when the underlying composer cannot satisfy the
 * sources (e.g. the cost slot pool is empty in the current context).
 */
export function buildBundleFamilyOption(
  args: BuildBundleFamilyOptionArgs,
): ResolvedShapeFillOption | undefined {
  const intermediate = genericBundleOption({
    context: args.context,
    drawContext: args.drawContext,
    label: args.label,
    stage: args.stage,
    costSource: args.family.costSource,
    rewardSource: args.family.rewardSource,
  });

  if (intermediate === undefined) {
    return undefined;
  }

  return adaptGenericBundleToFillOption({
    identity: { fillKind: args.family.fillKind },
    intermediate,
    stage: args.stage,
  });
}
