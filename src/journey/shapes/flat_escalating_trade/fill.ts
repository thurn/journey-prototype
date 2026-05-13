import { shuffleDeterministic } from "../../../util/rng.js";
import type { JourneyContext } from "../../../quest/context.js";
import type {
  JourneyOption,
  JourneyStage,
  JourneySymmetryContractDebug,
} from "../../manifest.js";
import { getReward } from "../../shared/rewards.js";
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

const OMEN_REWARD = getReward("gain_omens");

function essenceCostPayload(price: number, escalationTier: string) {
  return {
    kind: "essence",
    amount: price,
    timing: "immediate",
    escalationTier,
  };
}

function omenRewardPayload(omens: number, escalationTier: string) {
  return {
    kind: "gain_omens",
    amount: omens,
    escalationTier,
  };
}

function tradeOption(args: {
  number: number;
  price: number;
  omens: number;
  escalationTier: string;
  context: JourneyContext;
}): JourneyOption {
  const rewardText = OMEN_REWARD.render({ x: args.omens }, args.context);

  return {
    number: args.number,
    symbols: ["cost", "reward", "resource", "trade"],
    text: `Pay ${args.price} essence. ${rewardText}.`,
    operations: [],
    costs: [essenceCostPayload(args.price, args.escalationTier)],
    effects: [omenRewardPayload(args.omens, args.escalationTier)],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: args.price,
    effectConvertedEssence: valueOmenGain(args.omens),
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: valueOmenGain(args.omens) - args.price,
    pickBehavior: "record_and_generate_next",
  };
}

function flatEscalatingTradeContract(
  tradeRows: readonly FlatEscalatingTradeRow[],
): JourneySymmetryContractDebug {
  return {
    contractKind: "flat_escalating_trade",
    sharedProperty: "essence-for-omens trade family",
    variedProperty: "strictly increasing price and omen reward",
    sharedFirst: true,
    optionNumbers: [1, 2, 3],
    sharedPayloadKeys: ["resource-cost:essence", "shared-reward:gain_omens"],
    variedPayloadKeys: tradeRows.map((row) =>
      `essence:${row.price}->omens:${row.omens}`
    ),
    weight: 3,
  };
}

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

      return tradeOption({
        number: index + 1,
        price,
        omens,
        escalationTier,
        context: args.context,
      });
    }),
    precommitted: {},
    symmetryContracts: [
      flatEscalatingTradeContract(tradeRows),
    ],
  };
}
