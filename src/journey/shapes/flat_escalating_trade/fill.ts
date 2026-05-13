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
      { price: 15, omens: 1 },
      { price: 35, omens: 2 },
      { price: 60, omens: 3 },
    ],
    [
      { price: 20, omens: 1 },
      { price: 40, omens: 2 },
      { price: 70, omens: 3 },
    ],
  ],
  mid: [
    [
      { price: 20, omens: 1 },
      { price: 45, omens: 2 },
      { price: 80, omens: 3 },
    ],
    [
      { price: 25, omens: 1 },
      { price: 55, omens: 2 },
      { price: 90, omens: 3 },
    ],
  ],
  late: [
    [
      { price: 30, omens: 1 },
      { price: 60, omens: 2 },
      { price: 95, omens: 3 },
    ],
    [
      { price: 35, omens: 1 },
      { price: 70, omens: 2 },
      { price: 110, omens: 3 },
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
