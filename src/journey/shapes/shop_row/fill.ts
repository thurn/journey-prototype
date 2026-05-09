import { shuffleDeterministic } from "../../../util/rng.js";
import {
  cost,
  optionFromResolvedShapeFill,
  pickSequentialVariant,
  rewardSlots,
  type ResolvedShapeFill,
} from "../../fillers/shared.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";
import { selectNamedDreamsignShopRow } from "./dreamsignSelection.js";
import {
  GENERAL_SHOP_ROW_PRICE_PROFILES,
  namedDreamsignShopRowFill,
} from "./pricing.js";

const SHAPE_LABEL = "shop_row";

export function shopRowFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext, stage } = args;
  const namedDreamsignRow = selectNamedDreamsignShopRow({
    context,
    drawContext,
    label: `${SHAPE_LABEL}:goods`,
    stage,
    sources: ["catalog"],
  });
  const shopFamily = pickSequentialVariant(
    drawContext,
    `${SHAPE_LABEL}:shop-family`,
    ["named_dreamsign", "named_dreamsign", "general"] as const,
  );

  if (namedDreamsignRow && shopFamily === "named_dreamsign") {
    const namedFill = namedDreamsignShopRowFill({
      context,
      drawContext,
      label: `${SHAPE_LABEL}:goods`,
      row: namedDreamsignRow,
    });

    return {
      options: namedFill.options.map((entry) =>
        optionFromResolvedShapeFill(entry),
      ),
      precommitted: {},
    };
  }

  const priceProfiles: readonly (readonly number[])[] =
    GENERAL_SHOP_ROW_PRICE_PROFILES[stage];
  const prices = shuffleDeterministic(
    drawContext,
    `${SHAPE_LABEL}:general-price-profile:${stage}`,
    priceProfiles,
  )[0]!;
  const rewards = rewardSlots(
    context,
    drawContext,
    `${SHAPE_LABEL}:goods`,
  )
    .filter((reward) => reward.routeEffects === undefined)
    .slice(0, 3);
  const shopFill = {
    fillKind: "shop_row",
    options: rewards.map((reward, index) => {
      const price = prices[index]!;
      const priceCost = cost("essence", price);

      return {
        number: index + 1,
        textParts: [
          { source: "cost", text: `Pay ${price} essence.` },
          { source: "reward", text: reward.text },
        ],
        payloadSpecs: [
          {
            role: "cost",
            key: "shop-price",
            payloads: [priceCost],
          },
          {
            role: "reward",
            key: reward.key,
            payloads: reward.effects,
          },
        ],
        costs: [priceCost],
        effects: reward.effects,
        targetSelectors: reward.targets ?? [],
        triggers: reward.triggers ?? [],
        routeEffects: reward.routeEffects ?? [],
        valueEstimate: {
          cost: price,
          effect: reward.effect,
          uncertainty: reward.uncertainty,
        },
      };
    }),
  } satisfies ResolvedShapeFill;

  return {
    options: shopFill.options.map((entry) => optionFromResolvedShapeFill(entry)),
    precommitted: {},
  };
}
