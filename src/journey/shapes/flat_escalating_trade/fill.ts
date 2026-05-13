import { shuffleDeterministic } from "../../../util/rng.js";
import {
  cost,
  gainOmen,
  option,
  symmetryContract,
} from "../../fillers/shared.js";
import type { JourneyStage } from "../../manifest.js";
import { valueOmenGain } from "../../value.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

type FlatEscalatingTradeRow = {
  price: number;
  omens: number;
};

const FLAT_ESCALATING_TRADE_PROFILES = {
  early: [
    [
      { price: 5, omens: 1 },
      { price: 60, omens: 2 },
      { price: 120, omens: 3 },
    ],
    [
      { price: 10, omens: 1 },
      { price: 65, omens: 2 },
      { price: 120, omens: 3 },
    ],
    [
      { price: 20, omens: 1 },
      { price: 80, omens: 2 },
      { price: 120, omens: 3 },
    ],
  ],
  mid: [
    [
      { price: 30, omens: 1 },
      { price: 95, omens: 2 },
      { price: 170, omens: 3 },
    ],
    [
      { price: 35, omens: 1 },
      { price: 170, omens: 3 },
      { price: 310, omens: 5 },
    ],
    [
      { price: 90, omens: 2 },
      { price: 220, omens: 4 },
      { price: 300, omens: 5 },
    ],
  ],
  late: [
    [
      { price: 90, omens: 2 },
      { price: 210, omens: 4 },
      { price: 350, omens: 6 },
    ],
    [
      { price: 120, omens: 2 },
      { price: 235, omens: 4 },
      { price: 370, omens: 6 },
    ],
    [
      { price: 160, omens: 3 },
      { price: 295, omens: 5 },
      { price: 370, omens: 6 },
    ],
  ],
} as const satisfies Record<
  JourneyStage,
  readonly (readonly FlatEscalatingTradeRow[])[]
>;

export function flatEscalatingTradeFill(args: ShapeFillArgs): FilledJourney {
  const { drawContext, stage } = args;
  const tradeProfiles: readonly (readonly FlatEscalatingTradeRow[])[] =
    FLAT_ESCALATING_TRADE_PROFILES[stage];
  const tradeRows = shuffleDeterministic(
    drawContext,
    `flat_escalating_trade:trade-profile:${stage}`,
    tradeProfiles,
  )[0]!;

  return {
    options: tradeRows.map((row, index) => {
      const { price, omens } = row;
      const escalationTier = `tier_${index + 1}`;

      return option({
        number: index + 1,
        text: `Pay ${price} essence. Gain ${omens} ${omens === 1 ? "omen" : "omens"}.`,
        costs: [{ ...cost("essence", price), escalationTier }],
        effects: [{ ...gainOmen(omens), escalationTier }],
        cost: price,
        effect: valueOmenGain(omens),
      });
    }),
    precommitted: {},
    symmetryContracts: [
      symmetryContract({
        contractKind: "flat_escalating_trade",
        sharedProperty: "essence-for-omens trade family",
        variedProperty: "strictly increasing price and omen reward",
        sharedFirst: true,
        optionNumbers: [1, 2, 3],
        sharedPayloadKeys: ["resource-cost:essence", "resource-reward:omens"],
        variedPayloadKeys: tradeRows.map((row) =>
          `essence:${row.price}->omens:${row.omens}`
        ),
        weight: 3,
      }),
    ],
  };
}
