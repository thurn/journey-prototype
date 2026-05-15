import { shuffleDeterministic } from "../../../util/rng.js";
import type { JourneyContext } from "../../../quest/context.js";
import type {
  JourneyOption,
  JourneyStage,
  JourneySymmetryContractDebug,
} from "../../manifest.js";
import { getReward } from "../../shared/rewards.js";
import type { TemplateParams } from "../../shared/types.js";
import { valueOmenGain } from "../../value.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

type FlatEscalatingTradeRow = {
  price: number;
  params: TemplateParams;
};

type FlatEscalatingTradeProfile = {
  rewardId:
    | "gain_omens"
    | "increase_max_essence"
    | "duplicate_chosen_cards"
    | "make_random_cards_reclaim";
  sharedProperty: string;
  variedProperty: string;
  rows: readonly [FlatEscalatingTradeRow, FlatEscalatingTradeRow, FlatEscalatingTradeRow];
};

const FLAT_ESCALATING_TRADE_PROFILES = {
  early: [
    omenProfile(
      "strictly increasing price and omen reward",
      [
        { price: 5, x: 1 },
        { price: 60, x: 2 },
        { price: 120, x: 3 },
      ],
    ),
    omenProfile(
      "strictly increasing price and omen reward",
      [
        { price: 10, x: 1 },
        { price: 65, x: 2 },
        { price: 120, x: 3 },
      ],
    ),
    omenProfile(
      "strictly increasing price and omen reward",
      [
        { price: 20, x: 1 },
        { price: 80, x: 2 },
        { price: 120, x: 3 },
      ],
    ),
    maxEssenceProfile("strictly increasing price and maximum essence gain", [
      { price: 10, amount: 100 },
      { price: 65, amount: 210 },
      { price: 120, amount: 330 },
    ]),
    duplicateCardsProfile("strictly increasing price and chosen-card duplicates", [
      { price: 10, count: 1 },
      { price: 55, count: 2 },
      { price: 100, count: 3 },
    ]),
    reclaimCardsProfile("strictly increasing price and random-card Reclaim amount", [
      { price: 5, count: 1, reclaim: 2 },
      { price: 45, count: 2, reclaim: 2 },
      { price: 85, count: 3, reclaim: 2 },
    ]),
  ],
  mid: [
    omenProfile(
      "strictly increasing price and omen reward",
      [
        { price: 30, x: 1 },
        { price: 95, x: 2 },
        { price: 170, x: 3 },
      ],
    ),
    omenProfile(
      "strictly increasing price and omen reward",
      [
        { price: 35, x: 1 },
        { price: 170, x: 3 },
        { price: 310, x: 5 },
      ],
    ),
    omenProfile(
      "strictly increasing price and omen reward",
      [
        { price: 90, x: 2 },
        { price: 220, x: 4 },
        { price: 300, x: 5 },
      ],
    ),
    maxEssenceProfile("strictly increasing price and maximum essence gain", [
      { price: 50, amount: 170 },
      { price: 150, amount: 370 },
      { price: 280, amount: 620 },
    ]),
    duplicateCardsProfile("strictly increasing price and chosen-card duplicates", [
      { price: 55, count: 2 },
      { price: 145, count: 4 },
      { price: 235, count: 6 },
    ]),
    reclaimCardsProfile("strictly increasing price and random-card Reclaim amount", [
      { price: 45, count: 2, reclaim: 2 },
      { price: 130, count: 4, reclaim: 2 },
      { price: 210, count: 6, reclaim: 2 },
    ]),
  ],
  late: [
    omenProfile(
      "strictly increasing price and omen reward",
      [
        { price: 90, x: 2 },
        { price: 210, x: 4 },
        { price: 350, x: 6 },
      ],
    ),
    omenProfile(
      "strictly increasing price and omen reward",
      [
        { price: 120, x: 2 },
        { price: 235, x: 4 },
        { price: 370, x: 6 },
      ],
    ),
    omenProfile(
      "strictly increasing price and omen reward",
      [
        { price: 160, x: 3 },
        { price: 295, x: 5 },
        { price: 370, x: 6 },
      ],
    ),
    maxEssenceProfile("strictly increasing price and maximum essence gain", [
      { price: 100, amount: 260 },
      { price: 260, amount: 580 },
      { price: 395, amount: 850 },
    ]),
    duplicateCardsProfile("strictly increasing price and chosen-card duplicates", [
      { price: 145, count: 4 },
      { price: 280, count: 7 },
      { price: 395, count: 10 },
    ]),
    reclaimCardsProfile("strictly increasing price and random-card Reclaim amount", [
      { price: 130, count: 4, reclaim: 2 },
      { price: 250, count: 7, reclaim: 2 },
      { price: 370, count: 10, reclaim: 2 },
    ]),
  ],
} as const satisfies Record<
  JourneyStage,
  readonly FlatEscalatingTradeProfile[]
>;

function rows<P extends TemplateParams>(
  rowsInput: readonly [
    ({ price: number } & P),
    ({ price: number } & P),
    ({ price: number } & P),
  ],
): readonly [FlatEscalatingTradeRow, FlatEscalatingTradeRow, FlatEscalatingTradeRow] {
  const toRow = ({ price, ...params }: { price: number } & P) => ({
    price,
    params: params as TemplateParams,
  });

  return [
    toRow(rowsInput[0]),
    toRow(rowsInput[1]),
    toRow(rowsInput[2]),
  ];
}

function omenProfile(
  variedProperty: string,
  rowsInput: readonly [
    { price: number; x: number },
    { price: number; x: number },
    { price: number; x: number },
  ],
): FlatEscalatingTradeProfile {
  return {
    rewardId: "gain_omens",
    sharedProperty: "essence-for-omens trade family",
    variedProperty,
    rows: rows(rowsInput),
  };
}

function maxEssenceProfile(
  variedProperty: string,
  rowsInput: readonly [
    { price: number; amount: number },
    { price: number; amount: number },
    { price: number; amount: number },
  ],
): FlatEscalatingTradeProfile {
  return {
    rewardId: "increase_max_essence",
    sharedProperty: "essence-for-maximum-essence trade family",
    variedProperty,
    rows: rows(rowsInput),
  };
}

function duplicateCardsProfile(
  variedProperty: string,
  rowsInput: readonly [
    { price: number; count: number },
    { price: number; count: number },
    { price: number; count: number },
  ],
): FlatEscalatingTradeProfile {
  return {
    rewardId: "duplicate_chosen_cards",
    sharedProperty: "essence-for-card-duplication trade family",
    variedProperty,
    rows: rows(rowsInput),
  };
}

function reclaimCardsProfile(
  variedProperty: string,
  rowsInput: readonly [
    { price: number; count: number; reclaim: number },
    { price: number; count: number; reclaim: number },
    { price: number; count: number; reclaim: number },
  ],
): FlatEscalatingTradeProfile {
  return {
    rewardId: "make_random_cards_reclaim",
    sharedProperty: "essence-for-random-card-Reclaim trade family",
    variedProperty,
    rows: rows(rowsInput),
  };
}

function essenceCostPayload(price: number, escalationTier: string) {
  return {
    kind: "essence",
    amount: price,
    timing: "immediate",
    escalationTier,
  };
}

function rewardValue(
  profile: FlatEscalatingTradeProfile,
  params: TemplateParams,
  context: JourneyContext,
): number {
  if (profile.rewardId === "gain_omens") {
    return valueOmenGain((params as { x: number }).x);
  }

  return getReward(profile.rewardId).cec(params, context);
}

function rewardPayload(
  profile: FlatEscalatingTradeProfile,
  params: TemplateParams,
  rendered: string,
  escalationTier: string,
) {
  switch (profile.rewardId) {
    case "gain_omens": {
      const { x } = params as { x: number };
      return {
        kind: "gain_omens",
        templateId: profile.rewardId,
        amount: x,
        rendered,
        escalationTier,
      };
    }

    case "increase_max_essence": {
      const { amount } = params as { amount: number };
      return {
        kind: "resource_cap_change",
        templateId: profile.rewardId,
        resource: "maxEssence",
        amount,
        rendered,
        escalationTier,
      };
    }

    case "duplicate_chosen_cards": {
      const { count } = params as { count: number };
      return {
        kind: "card_duplicate",
        templateId: profile.rewardId,
        count,
        rendered,
        escalationTier,
      };
    }

    case "make_random_cards_reclaim": {
      const { count, reclaim } = params as { count: number; reclaim: number };
      return {
        kind: "card_keyword_add",
        templateId: profile.rewardId,
        count,
        reclaim,
        keyword: "Reclaim",
        rendered,
        escalationTier,
      };
    }
  }
}

function tradeOption(args: {
  number: number;
  price: number;
  profile: FlatEscalatingTradeProfile;
  params: TemplateParams;
  escalationTier: string;
  context: JourneyContext;
}): JourneyOption {
  const reward = getReward(args.profile.rewardId);
  const rewardText = reward.render(args.params, args.context);
  const effectConvertedEssence = rewardValue(
    args.profile,
    args.params,
    args.context,
  );

  return {
    number: args.number,
    symbols: ["cost", "reward", "resource", "trade"],
    text: `Pay ${args.price} essence. ${rewardText}.`,
    operations: [],
    costs: [essenceCostPayload(args.price, args.escalationTier)],
    effects: [
      rewardPayload(
        args.profile,
        args.params,
        rewardText,
        args.escalationTier,
      ),
    ],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: args.price,
    effectConvertedEssence,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: effectConvertedEssence - args.price,
    pickBehavior: "record_and_generate_next",
    rewardTemplateIds: [args.profile.rewardId],
  };
}

function flatEscalatingTradeContract(
  profile: FlatEscalatingTradeProfile,
): JourneySymmetryContractDebug {
  return {
    contractKind: "flat_escalating_trade",
    sharedProperty: profile.sharedProperty,
    variedProperty: profile.variedProperty,
    sharedFirst: true,
    optionNumbers: [1, 2, 3],
    sharedPayloadKeys: [
      "resource-cost:essence",
      `shared-reward:${profile.rewardId}`,
    ],
    variedPayloadKeys: profile.rows.map((row) =>
      `essence:${row.price}->${profile.rewardId}:${JSON.stringify(row.params)}`
    ),
    weight: 3,
  };
}

function profileIsViable(
  profile: FlatEscalatingTradeProfile,
  context: JourneyContext,
): boolean {
  const reward = getReward(profile.rewardId);

  return profile.rows.every((row) => {
    if (!reward.viable(row.params, context)) {
      return false;
    }

    if (profile.rewardId === "duplicate_chosen_cards") {
      const { count } = row.params as { count: number };
      return context.state.quest.deck.summary.totalCards >= count;
    }

    return true;
  });
}

export function flatEscalatingTradeFill(args: ShapeFillArgs): FilledJourney {
  const { drawContext, stage } = args;
  const tradeProfiles = FLAT_ESCALATING_TRADE_PROFILES[stage];
  const viableProfiles = tradeProfiles.filter((profile) =>
    profileIsViable(profile, args.context)
  );
  const selectedProfile = shuffleDeterministic(
    drawContext,
    `flat_escalating_trade:trade-profile:${stage}`,
    viableProfiles.length > 0 ? viableProfiles : tradeProfiles,
  )[0]!;

  return {
    options: selectedProfile.rows.map((row, index) => {
      const escalationTier = `tier_${index + 1}`;

      return tradeOption({
        number: index + 1,
        price: row.price,
        profile: selectedProfile,
        params: row.params,
        escalationTier,
        context: args.context,
      });
    }),
    precommitted: {},
    symmetryContracts: [
      flatEscalatingTradeContract(selectedProfile),
    ],
  };
}
