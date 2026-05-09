import type { JourneyContext } from "../../../quest/context.js";
import type { DrawContext } from "../../../util/rng.js";
import {
  dreamsignExactTarget,
  namedDreamsignPayload,
} from "../../fillers/dreamsignPayloads.js";
import type { NamedDreamsignShopRowSelection } from "./dreamsignSelection.js";
import {
  cost,
  pickSequentialVariant,
  type ResolvedShapeFill,
} from "../../fillers/shared.js";
import type { JourneyStage } from "../../manifest.js";
import {
  valueDreamsignOperation,
  valueOmenLoss,
} from "../../value.js";

export type ShopRowPrice = {
  key: string;
  currency: "essence" | "omens";
  amount: number;
  convertedEssence: number;
};

export const GENERAL_SHOP_ROW_PRICE_PROFILES = {
  early: [
    [10, 15, 20],
    [15, 20, 25],
  ],
  mid: [
    [15, 20, 25],
    [20, 25, 30],
  ],
  late: [
    [20, 30, 40],
    [25, 35, 45],
  ],
} as const satisfies Record<JourneyStage, readonly (readonly number[])[]>;

export function shopRowPriceText(price: ShopRowPrice): string {
  const unit =
    price.currency === "omens"
      ? price.amount === 1 ? "omen" : "omens"
      : "essence";

  return `${price.amount} ${unit}`;
}

export function namedDreamsignShopPrices(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
}): ShopRowPrice[] {
  const affordableOmenAmount = Math.min(
    args.context.state.quest.resources.omens,
    2,
  );
  const priceFrames = affordableOmenAmount > 0
    ? ["shared_essence", "varied_essence", "shared_omens"] as const
    : ["shared_essence", "varied_essence"] as const;
  const priceFrame = pickSequentialVariant(
    args.drawContext,
    `${args.label}:named-price-frame`,
    priceFrames,
  );

  if (priceFrame === "shared_omens") {
    const amount = affordableOmenAmount;

    return [1, 2, 3].map((index) => ({
      key: `${priceFrame}:${index}`,
      currency: "omens",
      amount,
      convertedEssence: Math.abs(valueOmenLoss(amount)),
    }));
  }

  if (priceFrame === "varied_essence") {
    return [25, 35, 45].map((amount, index) => ({
      key: `${priceFrame}:${index + 1}`,
      currency: "essence",
      amount: Math.min(amount, args.context.state.quest.resources.essence),
      convertedEssence: Math.min(
        amount,
        args.context.state.quest.resources.essence,
      ),
    }));
  }

  const amount = Math.min(
    pickSequentialVariant(
      args.drawContext,
      `${args.label}:shared-essence-price`,
      [30, 45, 85],
    ),
    args.context.state.quest.resources.essence,
  );

  return [1, 2, 3].map((index) => ({
    key: `${priceFrame}:${index}`,
    currency: "essence",
    amount,
    convertedEssence: amount,
  }));
}

export function namedDreamsignShopRowFill(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  row: NamedDreamsignShopRowSelection;
}): ResolvedShapeFill {
  const prices = namedDreamsignShopPrices(args);

  return {
    fillKind: "named_dreamsign_shop_row",
    options: args.row.candidates.map((candidate, index) => {
      const price = prices[index]!;
      const priceCost = cost(price.currency, price.amount);
      const effect = namedDreamsignPayload(
        {
          kind: "dreamsign_purchase",
          dreamsign: candidate.dreamsign,
          source: candidate.source,
          extra: {
            purchaseCurrency: price.currency,
            purchaseAmount: price.amount,
            shopRowPriceMode: prices.every((entry) =>
              entry.currency === prices[0]!.currency &&
              entry.amount === prices[0]!.amount
            )
              ? "shared_price"
              : "per_row_variation",
            shopRowCoherenceRule: args.row.coherenceRule,
            shopRowCoherenceKey: args.row.coherenceKey,
            targetOrigin: candidate.targetOrigin,
            selectionWeight: candidate.weight,
            weightHooks: candidate.weightHooks,
          },
        },
        args.context,
      );
      const effectValue = valueDreamsignOperation("purchase", {
        tideOverlap: candidate.weightHooks.tideOverlap > 0,
      });

      return {
        number: index + 1,
        textParts: [
          {
            source: "reward",
            text: `Buy {${candidate.dreamsign.name}} for ${shopRowPriceText(price)}.`,
          },
        ],
        payloadSpecs: [
          {
            role: "cost",
            key: price.key,
            payloads: [priceCost],
          },
          {
            role: "reward",
            key: `dreamsign-purchase:${candidate.dreamsign.id}`,
            payloads: [effect],
          },
        ],
        costs: [priceCost],
        effects: [effect],
        targetSelectors: [
          dreamsignExactTarget(candidate.dreamsign, candidate.source),
        ],
        valueEstimate: {
          cost: price.convertedEssence,
          effect: effectValue,
        },
      };
    }),
  } satisfies ResolvedShapeFill;
}
