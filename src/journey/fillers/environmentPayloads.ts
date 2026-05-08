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

export function dreamwellPayload(args: {
  kind: string;
  scope: "next_battle" | "battle_window" | "future_dreamwell";
  duration: string;
  amount?: number;
  count?: number;
  cardRole?: "positive" | "bonus" | "penalty" | "upgrade" | "delayed" | "replacement";
  phaseSelector?: "first_draw" | "lowest_phase" | "any_phase" | "future_dreamwell" | "penalty_card";
  polarity?: "positive" | "negative" | "neutral" | "mixed";
  playerVisibility?: "visible_to_you" | "visible_to_both_players" | "hidden_until_draw";
  replacement?: string;
  timing?: string;
}): Record<string, unknown> {
  return {
    kind: "dreamwell_modifier",
    dreamwellOperationKind: args.kind,
    dreamwellScope: args.scope,
    duration: args.duration,
    timing: args.timing ?? args.duration,
    count: args.count ?? 1,
    polarity: args.polarity ?? "positive",
    playerVisibility: args.playerVisibility ?? "visible_to_you",
    ...(args.amount !== undefined ? { amount: args.amount } : {}),
    ...(args.cardRole ? { cardRole: args.cardRole } : {}),
    ...(args.phaseSelector ? { phaseSelector: args.phaseSelector } : {}),
    ...(args.replacement ? { replacement: args.replacement } : {}),
  };
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
