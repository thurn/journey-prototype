import type { JourneyOption } from "../../manifest.js";
import { routePayload } from "../../fillers/routeEditCatalog.js";
import {
  BATTLE_WINDOW_DURATION,
  cost,
  gainEssence,
  option,
} from "../../fillers/shared.js";

export function routeEditOptions(): JourneyOption[] {
  const replace = routePayload({
    operation: "replace_site",
    routeScope: "current_dreamscape",
    polarity: "positive",
    siteDeltaValue: 95,
    fromSite: "Shop",
    toSite: "Purge",
    timing: "current dreamscape",
    description: "replace a current Shop with a Purge site",
  });
  const add = routePayload({
    operation: "add_site",
    routeScope: "next_dreamscape",
    polarity: "positive",
    siteDeltaValue: 55,
    siteType: "Dreamsign Offering",
    timing: "next dreamscape",
    description: "add a Dreamsign Offering to the next dreamscape",
  });
  const remove = routePayload({
    operation: "remove_site",
    routeScope: "future_dreamscapes",
    polarity: "positive",
    siteDeltaValue: 120,
    siteType: "Draft",
    timing: "future dreamscapes",
    description: "remove one low-value Draft site from a future dreamscape",
  });
  const purge = routePayload({
    operation: "purge_site",
    routeScope: "full_atlas",
    polarity: "positive",
    siteDeltaValue: 145,
    siteType: "Dream Journey",
    timing: "full atlas",
    description: "purge extra Dream Journey sites from the full atlas",
  });
  const probability = routePayload({
    operation: "probability_adjustment",
    routeScope: "future_dreamscapes",
    polarity: "positive",
    siteDeltaValue: 135,
    siteType: "Transfiguration",
    probabilityDeltaPercent: 25,
    timing: "future dreamscapes",
    description: "increase future Transfiguration site odds",
  });

  return [
    option({
      number: 1,
      text: "Replace a Shop in the current dreamscape with a Purge site. Add a Dreamsign Offering to the next dreamscape.",
      routeEffects: [replace, add],
      effect: 150,
    }),
    option({
      number: 2,
      text: "Remove one low-value Draft site from a future dreamscape.",
      routeEffects: [remove],
      effect: 120,
    }),
    option({
      number: 3,
      text: "Purge extra Dream Journey sites from the full atlas.",
      routeEffects: [purge],
      effect: 145,
    }),
    option({
      number: 4,
      text: "Increase future Transfiguration site odds by 25%.",
      routeEffects: [probability],
      effect: 135,
    }),
  ];
}

export function shopPayload(args: {
  kind: string;
  scope:
    | "current_shop"
    | "next_shop"
    | "future_shops"
    | "next_purchases"
    | "site_specific";
  duration: string;
  amount?: number;
  count?: number;
  siteType?: string;
  hook?: string;
}): Record<string, unknown> {
  return {
    kind: "shop_economy_modifier",
    economyOperationKind: args.kind,
    shopScope: args.scope,
    duration: args.duration,
    timing: args.scope === "current_shop" ? "immediate" : args.duration,
    ...(args.amount !== undefined ? { amount: args.amount } : {}),
    ...(args.count !== undefined ? { count: args.count } : {}),
    ...(args.siteType ? { siteType: args.siteType } : {}),
    ...(args.hook ? { hook: args.hook } : {}),
    ...(args.hook ? { hookBudgetCost: 1 } : {}),
  };
}

export function shopEconomyOptions(): JourneyOption[] {
  return [
    option({
      number: 1,
      text: "Pay 10 essence. Rerolls in this shop cost 1 fewer omen.",
      costs: [cost("essence", 10)],
      effects: [
        shopPayload({
          kind: "reroll_discount",
          scope: "current_shop",
          duration: "current shop",
          amount: 1,
        }),
      ],
      cost: 10,
      effect: 145,
    }),
    option({
      number: 2,
      text: "Pay 15 essence. Your next future shop purchase is free.",
      costs: [cost("essence", 15)],
      effects: [
        shopPayload({
          kind: "free_future_purchase",
          scope: "next_purchases",
          duration: "next 1 purchase",
          count: 1,
        }),
      ],
      cost: 15,
      effect: 150,
    }),
    option({
      number: 3,
      text: "Pay 20 essence. At the next shop, restore 120 essence before buying.",
      costs: [cost("essence", 20)],
      effects: [
        shopPayload({
          kind: "next_shop_essence_restore",
          scope: "next_shop",
          duration: "next shop",
          amount: 120,
        }),
      ],
      cost: 20,
      effect: 150,
    }),
    option({
      number: 4,
      text: "Pay 15 essence. For the next 2 future shops, trade one omen for a 40 essence discount at Shop sites.",
      costs: [cost("essence", 15)],
      effects: [
        shopPayload({
          kind: "future_shop_trade_hook",
          scope: "future_shops",
          duration: "next 2 future shops",
          amount: 40,
          count: 2,
          siteType: "Shop",
          hook: "trade 1 omen for a 40 essence discount",
        }),
      ],
      cost: 15,
      effect: 155,
    }),
  ];
}

export function dreamwellPayload(args: {
  kind: string;
  scope: "next_battle" | "battle_window" | "future_dreamwell";
  duration: string;
  amount?: number;
  cardRole?: "positive" | "penalty" | "upgrade";
  timing?: string;
}): Record<string, unknown> {
  return {
    kind: "dreamwell_modifier",
    dreamwellOperationKind: args.kind,
    dreamwellScope: args.scope,
    duration: args.duration,
    timing: args.timing ?? args.duration,
    ...(args.amount !== undefined ? { amount: args.amount } : {}),
    ...(args.cardRole ? { cardRole: args.cardRole } : {}),
  };
}

export function dreamwellWindowOptions(): JourneyOption[] {
  return [
    option({
      number: 1,
      text: "In the next battle, your first Dreamwell draw produces 1 additional energy.",
      effects: [
        dreamwellPayload({
          kind: "first_draw_energy",
          scope: "next_battle",
          duration: "next battle",
          amount: 1,
        }),
      ],
      effect: 135,
    }),
    option({
      number: 2,
      text: "For the next 3 battles, add one positive Dreamwell card and upgrade the next Dreamwell card you draw.",
      effects: [
        dreamwellPayload({
          kind: "positive_card_and_upgrade",
          scope: "battle_window",
          duration: BATTLE_WINDOW_DURATION,
          amount: 1,
          cardRole: "positive",
        }),
      ],
      effect: 145,
    }),
    option({
      number: 3,
      text: "After next battle, add one delayed positive Dreamwell card to the following battle.",
      effects: [
        dreamwellPayload({
          kind: "delayed_positive_card",
          scope: "future_dreamwell",
          duration: "following battle",
          cardRole: "positive",
          timing: "after next battle",
        }),
      ],
      effect: 125,
      uncertainty: -8,
    }),
    option({
      number: 4,
      text: "Gain 220 essence. For the next 3 battles, the Dreamwell includes one penalty card.",
      effects: [gainEssence(220)],
      burdens: [
        dreamwellPayload({
          kind: "penalty_card",
          scope: "battle_window",
          duration: BATTLE_WINDOW_DURATION,
          cardRole: "penalty",
        }),
      ],
      effect: 220,
      burden: -75,
    }),
  ];
}

export function statusPayload(args: {
  kind: string;
  statusName: string;
  statusScope: "quest" | "battle" | "shop" | "dreamwell" | "reward";
  duration: "one_time" | "next_battle" | "next_3_battles" | "persistent";
  ruleMutationKind: string;
  polarity?: "positive" | "negative" | "neutral";
  amount?: number;
  replacement?: string;
  exactDeckSize?: number;
  rerollOmenCap?: number;
  cappedAction?: "reroll";
  dreamwellRuleKind?: "first_draw_energy";
  prohibitionKind?: "deck_cut_floor";
  prohibitedAction?: "voluntary_deck_cut";
  deckCutFloor?: number;
  affectedPlayer?: "you" | "opponent" | "both_players";
}): Record<string, unknown> {
  return {
    kind: args.kind,
    statusName: args.statusName,
    statusScope: args.statusScope,
    duration: args.duration,
    ruleMutationKind: args.ruleMutationKind,
    polarity: args.polarity ?? "positive",
    timing:
      args.duration === "one_time" || args.duration === "persistent"
        ? "immediate"
        : args.duration,
    ...(args.amount !== undefined ? { amount: args.amount } : {}),
    ...(args.replacement ? { replacement: args.replacement } : {}),
    ...(args.exactDeckSize !== undefined
      ? { exactDeckSize: args.exactDeckSize }
      : {}),
    ...(args.rerollOmenCap !== undefined
      ? { rerollOmenCap: args.rerollOmenCap }
      : {}),
    ...(args.cappedAction ? { cappedAction: args.cappedAction } : {}),
    ...(args.dreamwellRuleKind
      ? { dreamwellRuleKind: args.dreamwellRuleKind }
      : {}),
    ...(args.prohibitionKind ? { prohibitionKind: args.prohibitionKind } : {}),
    ...(args.prohibitedAction
      ? { prohibitedAction: args.prohibitedAction }
      : {}),
    ...(args.deckCutFloor !== undefined
      ? { deckCutFloor: args.deckCutFloor }
      : {}),
    ...(args.affectedPlayer ? { affectedPlayer: args.affectedPlayer } : {}),
  };
}

export function statusRewardReplacementOptions(): JourneyOption[] {
  return [
    option({
      number: 1,
      text: "Gain Second Chance once: replace the next no-reward result with 120 essence.",
      effects: [
        statusPayload({
          kind: "status_reward_replacement",
          statusName: "Second Chance",
          statusScope: "reward",
          duration: "one_time",
          ruleMutationKind: "reward_replacement",
          replacement: "120 essence",
        }),
      ],
      effect: 135,
    }),
    option({
      number: 2,
      text: "For the next 3 battles, both players draw 1 additional card in their opening hand and your first Dreamwell draw produces 1 additional energy.",
      effects: [
        statusPayload({
          kind: "status_battle_rule",
          statusName: "Shared Opening",
          statusScope: "battle",
          duration: "next_3_battles",
          ruleMutationKind: "both_player_battle_rule",
          affectedPlayer: "both_players",
        }),
        statusPayload({
          kind: "status_dreamwell_rule",
          statusName: "Brighter First Draw",
          statusScope: "dreamwell",
          duration: "next_3_battles",
          ruleMutationKind: "dreamwell_rule",
          dreamwellRuleKind: "first_draw_energy",
          amount: 1,
          affectedPlayer: "you",
        }),
      ],
      effect: 125,
    }),
    option({
      number: 3,
      text: "Gain a persistent shop treaty: future shops cannot charge more than 1 omen for rerolls.",
      effects: [
        statusPayload({
          kind: "status_shop_rule",
          statusName: "Shop Treaty",
          statusScope: "shop",
          duration: "persistent",
          ruleMutationKind: "shop_rule",
          cappedAction: "reroll",
          rerollOmenCap: 1,
        }),
      ],
      effect: 145,
    }),
    option({
      number: 4,
      text: "Set your quest deck size requirement to exactly 30 cards and prohibit voluntary deck cuts below it.",
      effects: [
        statusPayload({
          kind: "status_structural_constraint",
          statusName: "Exact Deck",
          statusScope: "quest",
          duration: "persistent",
          ruleMutationKind: "deck_size_constraint",
          exactDeckSize: 30,
          prohibitionKind: "deck_cut_floor",
          prohibitedAction: "voluntary_deck_cut",
          deckCutFloor: 30,
        }),
      ],
      effect: 130,
    }),
  ];
}
