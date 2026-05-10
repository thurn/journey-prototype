import type { JourneyContext } from "../../../quest/context.js";
import type { JourneyStage } from "../../manifest.js";
import type { JourneyShapeId } from "../../shapes.js";
import type {
  FillPlanPayloadRole,
  FillPlanTextPart,
  FillPlanPayloadSpec,
  ResolvedShapeFillOption,
} from "../../fillers/shared.js";
import type { DrawContext } from "../../../util/rng.js";
import {
  genericBundleOption,
  type BundleCostSource,
  type BundleOptionPayload,
  type BundleRewardSource,
  type GenericBundleOption,
} from "./genericBundleOption.js";
import {
  valueBaneBurden,
  valueCardDraft,
  valueRandomCardGain,
  valueStarterCleanup,
  valueStatusRuleMutation,
  valueUsefulNonStarterCardSacrifice,
} from "../../value.js";

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

type PayloadAdaptation = {
  readonly role: FillPlanPayloadRole;
  readonly textSource: FillPlanTextPart["source"];
  readonly costs: readonly unknown[];
  readonly effects: readonly unknown[];
  readonly burdens: readonly unknown[];
  readonly targets: readonly unknown[];
};

const EMPTY = [] as const;

function adaptPayload(payload: BundleOptionPayload): PayloadAdaptation {
  switch (payload.kind) {
    case "essence_cost":
      return {
        role: "cost",
        textSource: "cost",
        costs: [payload.cost],
        effects: EMPTY,
        burdens: EMPTY,
        targets: EMPTY,
      };
    case "card_draft":
      return {
        role: "reward",
        textSource: "reward",
        costs: EMPTY,
        effects: [payload.draft],
        burdens: EMPTY,
        targets: EMPTY,
      };
    case "card_purge":
      return {
        role: "burden",
        textSource: "burden",
        costs: EMPTY,
        effects: EMPTY,
        burdens: [payload.burden],
        targets: [payload.target],
      };
    case "reward_reduction":
      return {
        role: "burden",
        textSource: "burden",
        costs: EMPTY,
        effects: EMPTY,
        burdens: [payload.burden],
        targets: EMPTY,
      };
    case "resource_cost_slot":
      return {
        role: "cost",
        textSource: "cost",
        costs: payload.costs,
        effects: EMPTY,
        burdens: EMPTY,
        targets: EMPTY,
      };
    case "random_card_gain":
      return {
        role: "reward",
        textSource: "reward",
        costs: EMPTY,
        effects: [payload.gain],
        burdens: EMPTY,
        targets: EMPTY,
      };
    case "starter_cleanup":
      return {
        role: "reward",
        textSource: "reward",
        costs: EMPTY,
        effects: [payload.effect],
        burdens: EMPTY,
        targets: EMPTY,
      };
    case "essence_gain":
      return {
        role: "reward",
        textSource: "reward",
        costs: EMPTY,
        effects: [payload.effect],
        burdens: EMPTY,
        targets: EMPTY,
      };
    case "delayed_bane_cost":
      return {
        role: "burden",
        textSource: "burden",
        costs: EMPTY,
        effects: EMPTY,
        burdens: [payload.burden],
        targets: EMPTY,
      };
  }
}

function payloadKey(family: CompoundBundleFamily, payload: BundleOptionPayload): string {
  return `${family.fillKind}:${payload.kind}`;
}

function payloadFamily(payload: BundleOptionPayload): string {
  return `bundle_${payload.kind}`;
}

/**
 * Adapts the intermediate `GenericBundleOption` produced by
 * `genericBundleOption` into a `ResolvedShapeFillOption`. The adapter
 * classifies each payload into cost/effect/burden/target arrays so the
 * shape's downstream renderer can use the standard fill plan pipeline.
 */
function adaptToFillOption(
  family: CompoundBundleFamily,
  intermediate: GenericBundleOption,
  stage: JourneyStage,
): ResolvedShapeFillOption {
  const adaptations = intermediate.payloads.map((payload) => ({
    payload,
    adaptation: adaptPayload(payload),
  }));
  const textParts: FillPlanTextPart[] = adaptations.map(({ payload, adaptation }) => ({
    source: adaptation.textSource,
    text: adaptation.textSource === "cost"
      ? adaptCostText(payload)
      : adaptRewardOrBurdenText(payload),
  }));
  const payloadSpecs: FillPlanPayloadSpec[] = adaptations.map(({ payload, adaptation }) => ({
    role: adaptation.role,
    key: payloadKey(family, payload),
    family: payloadFamily(payload),
    payloads: [
      ...adaptation.costs,
      ...adaptation.effects,
      ...adaptation.burdens,
    ],
  }));

  const costs = adaptations.flatMap((entry) => entry.adaptation.costs);
  const effects = adaptations.flatMap((entry) => entry.adaptation.effects);
  const burdens = adaptations.flatMap((entry) => entry.adaptation.burdens);
  const targetSelectors = adaptations.flatMap((entry) => entry.adaptation.targets);

  const costValue = adaptations.reduce(
    (total, entry) => total + bundleCostResourceValue(entry.payload),
    0,
  );
  const burdenValue = adaptations.reduce(
    (total, entry) => total + bundleCostBurdenValue(entry.payload),
    0,
  );
  const effectValue = adaptations.reduce(
    (total, entry) => total + bundleRewardEffectValue(entry.payload, stage),
    0,
  );

  return {
    number: 1,
    textParts,
    payloadSpecs,
    costs,
    effects,
    burdens,
    targetSelectors,
    valueEstimate: {
      cost: costValue,
      effect: effectValue,
      burden: burdenValue,
      uncertainty: 0,
    },
  };
}

/**
 * Computes a coarse value estimate for the burden component of a cost
 * payload. Used to populate `ResolvedShapeFillOption.valueEstimate.burden`.
 * Only the kinds that map to the burden role contribute non-zero values.
 */
function bundleCostBurdenValue(payload: BundleOptionPayload): number {
  switch (payload.kind) {
    case "card_purge":
      return valueUsefulNonStarterCardSacrifice(1);
    case "reward_reduction":
      return valueStatusRuleMutation(
        payload.trigger === "battle"
          ? "battle_reward_reduction"
          : "essence_site_reward_reduction",
      );
    case "delayed_bane_cost":
      return valueBaneBurden({
        baneName: payload.baneName,
        count: payload.baneCount,
        delayed: true,
      });
    case "essence_cost":
    case "card_draft":
    case "resource_cost_slot":
    case "random_card_gain":
    case "starter_cleanup":
    case "essence_gain":
      return 0;
  }
}

/**
 * Computes a coarse value estimate for the cost component of a payload (i.e.
 * resource expenditure rather than burden).
 */
function bundleCostResourceValue(payload: BundleOptionPayload): number {
  switch (payload.kind) {
    case "essence_cost":
      return payload.cost.amount;
    case "resource_cost_slot": {
      let total = 0;
      for (const entry of payload.costs) {
        if (
          entry !== null &&
          typeof entry === "object" &&
          "amount" in entry &&
          typeof (entry as { amount: unknown }).amount === "number"
        ) {
          total += (entry as { amount: number }).amount;
        }
      }
      return total;
    }
    case "card_purge":
    case "card_draft":
    case "reward_reduction":
    case "random_card_gain":
    case "starter_cleanup":
    case "essence_gain":
    case "delayed_bane_cost":
      return 0;
  }
}

/**
 * Computes a coarse value estimate for the reward effect of a payload.
 */
function bundleRewardEffectValue(
  payload: BundleOptionPayload,
  stage: JourneyStage,
): number {
  switch (payload.kind) {
    case "card_draft":
      return Math.max(400, valueCardDraft(payload.draft));
    case "random_card_gain":
      return Math.max(
        420,
        valueRandomCardGain({
          count: payload.count,
          predicate: payload.gain.predicate,
        }),
      );
    case "starter_cleanup":
      return Math.max(320, valueStarterCleanup({ count: payload.count, stage }));
    case "essence_gain":
      return payload.amount;
    case "essence_cost":
    case "card_purge":
    case "reward_reduction":
    case "resource_cost_slot":
    case "delayed_bane_cost":
      return 0;
  }
}

function adaptCostText(payload: BundleOptionPayload): string {
  switch (payload.kind) {
    case "essence_cost":
      return `Pay ${payload.cost.amount} essence.`;
    // `resource_cost_slot` produces a `slot.prefix` in the intermediate, but
    // that text is part of the combined `renderText` and is not preserved
    // per-payload; the slot's costs render via the payload pipeline instead.
    case "resource_cost_slot":
      return "";
    case "card_purge":
    case "reward_reduction":
    case "card_draft":
    case "random_card_gain":
    case "starter_cleanup":
    case "essence_gain":
    case "delayed_bane_cost":
      return "";
  }
}

function adaptRewardOrBurdenText(payload: BundleOptionPayload): string {
  switch (payload.kind) {
    case "card_draft":
      return "";
    case "card_purge":
      return payload.randomCharacter
        ? "Purge a random character."
        : "Purge a random card.";
    case "reward_reduction":
      return payload.trigger === "battle"
        ? `Battle rewards offer ${payload.amount} fewer card choice${payload.amount === 1 ? "" : "s"}.`
        : `Essence sites yield ${payload.amount} less essence.`;
    case "random_card_gain":
      return "";
    case "starter_cleanup":
      return payload.count === 1
        ? "Purge up to 1 chosen Starter card."
        : `Purge up to ${payload.count} chosen Starter cards.`;
    case "essence_gain":
      return `Gain ${payload.amount} essence.`;
    case "delayed_bane_cost":
      return payload.burdenText;
    case "essence_cost":
    case "resource_cost_slot":
      return "";
  }
}

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

  return adaptToFillOption(args.family, intermediate, args.stage);
}
