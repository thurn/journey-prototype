import type { JourneyStage } from "../../manifest.js";
import type {
  FillPlanPayloadRole,
  FillPlanTextPart,
  FillPlanPayloadSpec,
  ResolvedShapeFillOption,
} from "../../fillers/shared.js";
import {
  valueBaneBurden,
  valueCardDraft,
  valueRandomCardGain,
  valueStarterCleanup,
  valueStatusRuleMutation,
  valueUsefulNonStarterCardSacrifice,
} from "../../value.js";
import type {
  BundleOptionPayload,
  GenericBundleOption,
} from "./genericBundleOption.js";

/**
 * Identifier used to scope adapted payload keys for telemetry/distinctness.
 * Originally tied to compound bundle families; the shape is now general.
 */
export type GenericBundleAdapterIdentity = {
  readonly fillKind: string;
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
    case "burden_pool_cost":
      return {
        role: "burden",
        textSource: "burden",
        costs: EMPTY,
        effects: EMPTY,
        burdens: [payload.burden],
        targets: EMPTY,
      };
    case "named_card_grant":
      return {
        role: "reward",
        textSource: "reward",
        costs: EMPTY,
        effects: [payload.gain],
        burdens: EMPTY,
        targets: EMPTY,
      };
  }
}

function payloadKey(
  identity: GenericBundleAdapterIdentity,
  payload: BundleOptionPayload,
): string {
  return `${identity.fillKind}:${payload.kind}`;
}

function payloadFamily(payload: BundleOptionPayload): string {
  return `bundle_${payload.kind}`;
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
    case "burden_pool_cost":
      return valueBaneBurden({
        baneName: payload.baneName,
        count: 1,
      });
    case "essence_cost":
    case "card_draft":
    case "resource_cost_slot":
    case "random_card_gain":
    case "starter_cleanup":
    case "essence_gain":
    case "named_card_grant":
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
    case "burden_pool_cost":
    case "named_card_grant":
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
    case "named_card_grant":
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
    case "burden_pool_cost":
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
    case "burden_pool_cost":
    case "named_card_grant":
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
    case "burden_pool_cost":
      return payload.burdenText;
    case "named_card_grant":
      return payload.count === 1
        ? "Gain 1 named card."
        : `Gain ${payload.count} named cards.`;
    case "essence_cost":
    case "resource_cost_slot":
      return "";
  }
}

/**
 * Adapts the intermediate `GenericBundleOption` produced by
 * `genericBundleOption` into a `ResolvedShapeFillOption`. The adapter
 * classifies each payload into cost/effect/burden/target arrays so the
 * shape's downstream renderer can use the standard fill plan pipeline.
 *
 * The `identity.fillKind` is used to scope payload keys (helpful for
 * telemetry and contract-distinctness checks). Both the compound bundle
 * families and the independent-rows menu use this adapter.
 */
export function adaptGenericBundleToFillOption(args: {
  readonly identity: GenericBundleAdapterIdentity;
  readonly intermediate: GenericBundleOption;
  readonly stage: JourneyStage;
  readonly number?: number;
}): ResolvedShapeFillOption {
  const { identity, intermediate, stage } = args;
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
    key: payloadKey(identity, payload),
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
    number: args.number ?? 1,
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
