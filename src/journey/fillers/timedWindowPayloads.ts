import type { JourneyContext } from "../../quest/context.js";
import {
  shuffleDeterministic,
  type DrawContext,
} from "../../util/rng.js";
import type { JourneyOption, JourneySymmetryContractDebug } from "../manifest.js";
import { dreamwellPayload, shopPayload } from "./environmentPayloads.js";
import { resourcePayload } from "./resourcePayloads.js";
import { routePayload } from "./routeEditCatalog.js";
import {
  BATTLE_WINDOW_DURATION,
  option,
  pickSequentialVariant,
  selectedDreamsignTargets,
  symmetryContract,
} from "./shared.js";
import {
  cardExactTarget,
  namedCardPayload,
  selectContentBackedCard,
} from "./namedCardPayloads.js";
import {
  dreamsignExactTarget,
  namedDreamsignPayload,
  selectContentBackedDreamsign,
} from "./dreamsignPayloads.js";
import { DREAMWELL_VALUE_CONSTANTS } from "../value.js";

type TimedWindowScope =
  | "battle"
  | "battle_object"
  | "dreamwell"
  | "shop"
  | "route"
  | "temporary_object";

type TimedWindow = {
  scope: TimedWindowScope;
  duration: string;
  count: number;
  phrase: string;
};

type TimedWindowEntry = {
  key: string;
  text: string;
  effects?: unknown[];
  burdens?: unknown[];
  targets?: unknown[];
  routeEffects?: unknown[];
  effect: number;
  burden?: number;
  uncertainty?: number;
};

type TimedWindowPayloadMetadata = {
  timedWindowScope: TimedWindowScope;
  timedWindowDuration: {
    durationKind: "battle_count" | "shop_count" | "dreamscape_count";
    count: number;
  };
  affectedPlayer: "you" | "opponent" | "both_players";
  affectedObjectClass: string;
  windowModifier: string;
  amount: number;
  polarity: "positive" | "negative" | "neutral" | "mixed";
  windowValue: number;
};

function durationKind(scope: TimedWindowScope): TimedWindowPayloadMetadata["timedWindowDuration"]["durationKind"] {
  return scope === "shop"
    ? "shop_count"
    : scope === "route"
      ? "dreamscape_count"
      : "battle_count";
}

function metadata(
  window: TimedWindow,
  args: Omit<TimedWindowPayloadMetadata, "timedWindowDuration" | "affectedPlayer"> & {
    affectedPlayer?: TimedWindowPayloadMetadata["affectedPlayer"];
  },
): TimedWindowPayloadMetadata {
  return {
    ...args,
    affectedPlayer: args.affectedPlayer ?? "you",
    timedWindowDuration: {
      durationKind: durationKind(args.timedWindowScope),
      count: window.count,
    },
  };
}

function valueForWindow(baseValue: number, window: TimedWindow, amount = 1): number {
  return baseValue + (window.count - 2) * 10 + (amount - 1) * 25;
}

function burdenValueForDreamwellWindow(baseValue: number, window: TimedWindow, amount = 1): number {
  const windowValue = valueForWindow(baseValue, window, amount);

  return Math.max(150, Math.min(170, windowValue));
}

function signedValue(baseValue: number, polarity: TimedWindowPayloadMetadata["polarity"]): number {
  return polarity === "negative" ? -baseValue : baseValue;
}

function battlePayload(
  window: TimedWindow,
  args: {
    operationKind: string;
    modifier: string;
    affectedPlayer?: TimedWindowPayloadMetadata["affectedPlayer"];
    affectedObjectClass: string;
    windowModifier: string;
    amount: number;
    polarity: TimedWindowPayloadMetadata["polarity"];
    value: number;
    scope?: Extract<TimedWindowScope, "battle" | "battle_object">;
    setValue?: number;
    dreamsignId?: string;
    dreamsignName?: string;
    source?: "pool" | "catalog";
  },
): Record<string, unknown> {
  return {
    kind: "battle_window_modifier",
    battleWindowOperationKind: args.operationKind,
    duration: window.duration,
    timing: window.duration,
    modifier: args.modifier,
    ...(args.setValue !== undefined ? { setValue: args.setValue } : {}),
    ...(args.dreamsignId ? { dreamsignId: args.dreamsignId } : {}),
    ...(args.dreamsignName ? { dreamsignName: args.dreamsignName } : {}),
    ...(args.source ? { source: args.source } : {}),
    ...metadata(window, {
      timedWindowScope: args.scope ?? "battle",
      affectedPlayer: args.affectedPlayer,
      affectedObjectClass: args.affectedObjectClass,
      windowModifier: args.windowModifier,
      amount: args.amount,
      polarity: args.polarity,
      windowValue: signedValue(args.value, args.polarity),
    }),
  };
}

function battleWindowOptions(
  context: JourneyContext,
  window: TimedWindow,
  drawContext: DrawContext,
): TimedWindowEntry[] {
  const openingHandAmount = pickSequentialVariant(
    drawContext,
    "timed-window:battle:opening-hand-amount",
    [1, 2] as const,
  );
  const nextBattleAmount = pickSequentialVariant(
    drawContext,
    "timed-window:battle:next-battle-draw-amount",
    [1, 2] as const,
  );
  const dreamsign = selectedDreamsignTargets(context, drawContext)[0];
  const temporaryDreamsignEntries: TimedWindowEntry[] = dreamsign
    ? [
        {
          key: "temporary-named-dreamsign",
          text: `${window.phrase}, gain {${dreamsign.name}} as a temporary Dreamsign.`,
          effects: [
            battlePayload(window, {
              operationKind: "temporary_dreamsign",
              modifier: "temporary_dreamsign",
              affectedObjectClass: "dreamsign",
              windowModifier: "temporary_grant",
              amount: 1,
              polarity: "positive",
              value: valueForWindow(135, window),
              dreamsignId: dreamsign.id,
              dreamsignName: dreamsign.name,
              source: "pool",
            }),
          ],
          effect: valueForWindow(135, window),
          uncertainty: -10,
        },
        {
          key: "opponent-temporary-dreamsign",
          text: `${window.phrase}, your opponent gains {${dreamsign.name}} as a temporary Dreamsign.`,
          effects: [
            battlePayload(window, {
              operationKind: "temporary_dreamsign",
              modifier: "temporary_dreamsign",
              affectedPlayer: "opponent",
              affectedObjectClass: "dreamsign",
              windowModifier: "temporary_grant",
              amount: 1,
              polarity: "negative",
              value: valueForWindow(125, window),
              dreamsignId: dreamsign.id,
              dreamsignName: dreamsign.name,
              source: "pool",
            }),
          ],
          effect: -valueForWindow(125, window),
          uncertainty: -10,
        },
      ]
    : [];
  const candidates: TimedWindowEntry[] = [
    {
      key: "event-fast",
      text: `${window.phrase}, all Event cards in your deck have Fast.`,
      effects: [
        {
          kind: "card_rewrite",
          keyword: "Fast",
          duration: window.duration,
          scope: "all_matching_cards_in_deck",
          predicate: { source: "deck", cardType: "Event" },
          ...metadata(window, {
            timedWindowScope: "battle",
            affectedObjectClass: "event_cards",
            windowModifier: "add_keyword_fast",
            amount: 1,
            polarity: "positive",
            windowValue: valueForWindow(155, window),
          }),
        },
      ],
      effect: valueForWindow(155, window),
    },
    {
      key: "opening-hand",
      text: `${window.phrase}, draw ${openingHandAmount} extra card${openingHandAmount === 1 ? "" : "s"} in your opening hand.`,
      effects: [
        battlePayload(window, {
          operationKind: "opening_hand_cards",
          modifier: "opening_hand_cards",
          affectedObjectClass: "opening_hand",
          windowModifier: "extra_cards",
          amount: openingHandAmount,
          polarity: "positive",
          value: valueForWindow(145, window, openingHandAmount),
        }),
      ],
      effect: valueForWindow(145, window, openingHandAmount),
    },
    {
      key: "opening-hand-minus",
      text: `${window.phrase}, draw 1 fewer card in your opening hand.`,
      effects: [
        battlePayload(window, {
          operationKind: "opening_hand_cards",
          modifier: "opening_hand_cards",
          affectedObjectClass: "opening_hand",
          windowModifier: "fewer_cards",
          amount: 1,
          polarity: "negative",
          value: valueForWindow(130, window),
        }),
      ],
      effect: -valueForWindow(130, window),
    },
    {
      key: "starting-energy",
      text: `${window.phrase}, start each battle with 2 additional energy.`,
      effects: [
        battlePayload(window, {
          operationKind: "starting_energy",
          modifier: "starting_energy",
          affectedObjectClass: "starting_energy",
          windowModifier: "extra_energy",
          amount: 2,
          polarity: "positive",
          value: valueForWindow(150, window, 2),
        }),
      ],
      effect: valueForWindow(150, window, 2),
    },
    {
      key: "event-reclaim",
      text: `${window.phrase}, the first Event you play each battle has Reclaim 1.`,
      effects: [
        {
          kind: "battle_window_modifier",
          duration: window.duration,
          modifier: "first_event_reclaim",
          ...metadata(window, {
            timedWindowScope: "battle",
            affectedObjectClass: "event_cards",
            windowModifier: "reclaim",
            amount: 1,
            polarity: "positive",
            windowValue: valueForWindow(155, window),
          }),
        },
      ],
      effect: valueForWindow(155, window),
    },
    {
      key: "next-battle-draw",
      text: `${window.phrase}, draw ${nextBattleAmount} additional card${nextBattleAmount === 1 ? "" : "s"} after your opening hand in each battle.`,
      effects: [
        battlePayload(window, {
          operationKind: "next_battle_draw",
          modifier: "next_battle_draw",
          affectedObjectClass: "battle_draw",
          windowModifier: "extra_cards",
          amount: nextBattleAmount,
          polarity: "positive",
          value: valueForWindow(140, window, nextBattleAmount),
        }),
      ],
      effect: valueForWindow(140, window, nextBattleAmount),
    },
    {
      key: "energy-carryover",
      text: `${window.phrase}, carry over up to 1 unspent energy between turns.`,
      effects: [
        battlePayload(window, {
          operationKind: "energy_carryover",
          modifier: "unspent_energy_carryover",
          affectedObjectClass: "energy",
          windowModifier: "carryover",
          amount: 1,
          polarity: "positive",
          value: valueForWindow(135, window),
        }),
      ],
      effect: valueForWindow(135, window),
    },
    {
      key: "opponent-point-threshold",
      text: `${window.phrase}, your opponent needs 3 additional points to win a battle.`,
      effects: [
        battlePayload(window, {
          operationKind: "opponent_point_threshold",
          modifier: "opponent_point_threshold",
          affectedPlayer: "opponent",
          affectedObjectClass: "battle_point_threshold",
          windowModifier: "increase_threshold",
          amount: 3,
          polarity: "positive",
          value: valueForWindow(95, window, 3),
        }),
      ],
      effect: valueForWindow(95, window, 3),
    },
    ...temporaryDreamsignEntries,
  ];

  return shuffleDeterministic(drawContext, "timed-window:battle-options", candidates);
}

function battleObjectWindowOptions(
  context: JourneyContext,
  window: TimedWindow,
  drawContext: DrawContext,
): TimedWindowEntry[] {
  const dreamsign = selectedDreamsignTargets(context, drawContext)[0];
  const baseScope = "battle_object" as const;
  const temporaryDreamsign: TimedWindowEntry | undefined = dreamsign
    ? {
        key: "temporary-named-dreamsign",
        text: `${window.phrase}, gain {${dreamsign.name}} as a temporary Dreamsign.`,
        effects: [
          battlePayload(window, {
            operationKind: "temporary_dreamsign",
            modifier: "temporary_dreamsign",
            affectedObjectClass: "dreamsign",
            windowModifier: "temporary_grant",
            amount: 1,
            polarity: "positive",
            value: valueForWindow(135, window),
            scope: baseScope,
            dreamsignId: dreamsign.id,
            dreamsignName: dreamsign.name,
            source: "pool",
          }),
        ],
        effect: valueForWindow(135, window),
        uncertainty: -10,
      }
    : undefined;
  const variants: TimedWindowEntry[][] = [
    [
      {
        key: "opening-hand",
        text: `${window.phrase}, draw 1 additional card in your opening hand.`,
        effects: [
          battlePayload(window, {
            operationKind: "opening_hand_cards",
            modifier: "opening_hand_cards",
            affectedObjectClass: "opening_hand",
            windowModifier: "extra_cards",
            amount: 1,
            polarity: "positive",
            value: valueForWindow(145, window),
            scope: baseScope,
          }),
        ],
        effect: valueForWindow(145, window),
      },
      {
        key: "next-battle-draw",
        text: `${window.phrase}, draw 2 additional cards after your opening hand in each battle.`,
        effects: [
          battlePayload(window, {
            operationKind: "next_battle_draw",
            modifier: "next_battle_draw",
            affectedObjectClass: "battle_draw",
            windowModifier: "extra_cards",
            amount: 2,
            polarity: "positive",
            value: valueForWindow(150, window, 2),
            scope: baseScope,
          }),
        ],
        effect: valueForWindow(150, window, 2),
      },
      ...(temporaryDreamsign ? [temporaryDreamsign] : []),
    ],
    [
      {
        key: "battle-point-cap",
        text: `${window.phrase}, battles end at 15 points.`,
        effects: [
          battlePayload(window, {
            operationKind: "battle_point_cap",
            modifier: "battle_point_cap",
            affectedPlayer: "both_players",
            affectedObjectClass: "battle_point_cap",
            windowModifier: "set_cap",
            amount: 15,
            setValue: 15,
            polarity: "mixed",
            value: valueForWindow(130, window),
            scope: baseScope,
          }),
        ],
        effect: valueForWindow(130, window),
      },
      {
        key: "both-player-starting-energy",
        text: `${window.phrase}, both players start each battle with 5 energy.`,
        effects: [
          battlePayload(window, {
            operationKind: "starting_energy",
            modifier: "starting_energy",
            affectedPlayer: "both_players",
            affectedObjectClass: "starting_energy",
            windowModifier: "set_starting_energy",
            amount: 5,
            setValue: 5,
            polarity: "mixed",
            value: valueForWindow(130, window),
            scope: baseScope,
          }),
        ],
        effect: valueForWindow(130, window),
      },
      {
        key: "both-player-starting-cards",
        text: `${window.phrase}, both players begin each battle with 7 cards.`,
        effects: [
          battlePayload(window, {
            operationKind: "starting_cards",
            modifier: "starting_cards",
            affectedPlayer: "both_players",
            affectedObjectClass: "opening_hand",
            windowModifier: "set_starting_cards",
            amount: 7,
            setValue: 7,
            polarity: "mixed",
            value: valueForWindow(130, window),
            scope: baseScope,
          }),
        ],
        effect: valueForWindow(130, window),
      },
    ],
    [
      {
        key: "both-player-character-spark",
        text: `${window.phrase}, both players' first character each turn enters with +1 spark.`,
        effects: [
          battlePayload(window, {
            operationKind: "character_spark",
            modifier: "character_spark",
            affectedPlayer: "both_players",
            affectedObjectClass: "character",
            windowModifier: "spark_bonus",
            amount: 1,
            polarity: "mixed",
            value: valueForWindow(135, window),
            scope: baseScope,
          }),
        ],
        effect: valueForWindow(135, window),
      },
      {
        key: "both-player-each-turn-draw",
        text: `${window.phrase}, both players draw 1 additional card each turn.`,
        effects: [
          battlePayload(window, {
            operationKind: "each_turn_draw",
            modifier: "each_turn_draw",
            affectedPlayer: "both_players",
            affectedObjectClass: "turn_draw",
            windowModifier: "extra_cards_each_turn",
            amount: 1,
            polarity: "mixed",
            value: valueForWindow(140, window),
            scope: baseScope,
          }),
        ],
        effect: valueForWindow(140, window),
      },
      {
        key: "both-player-energy-carryover",
        text: `${window.phrase}, both players carry over up to 1 unspent energy between turns.`,
        effects: [
          battlePayload(window, {
            operationKind: "energy_carryover",
            modifier: "unspent_energy_carryover",
            affectedPlayer: "both_players",
            affectedObjectClass: "energy",
            windowModifier: "carryover",
            amount: 1,
            polarity: "mixed",
            value: valueForWindow(130, window),
            scope: baseScope,
          }),
        ],
        effect: valueForWindow(130, window),
      },
    ],
    [
      {
        key: "opening-hand-minus",
        text: `${window.phrase}, draw 1 fewer card in your opening hand.`,
        effects: [
          battlePayload(window, {
            operationKind: "opening_hand_cards",
            modifier: "opening_hand_cards",
            affectedObjectClass: "opening_hand",
            windowModifier: "fewer_cards",
            amount: 1,
            polarity: "negative",
            value: valueForWindow(130, window),
            scope: baseScope,
          }),
        ],
        effect: -valueForWindow(130, window),
      },
      {
        key: "opponent-temporary-dreamsign",
        text: dreamsign
          ? `${window.phrase}, your opponent gains {${dreamsign.name}} as a temporary Dreamsign.`
          : `${window.phrase}, your opponent gains a temporary Dreamsign.`,
        effects: [
          battlePayload(window, {
            operationKind: "temporary_dreamsign",
            modifier: "temporary_dreamsign",
            affectedPlayer: "opponent",
            affectedObjectClass: "dreamsign",
            windowModifier: "temporary_grant",
            amount: 1,
            polarity: "negative",
            value: valueForWindow(125, window),
            scope: baseScope,
            ...(dreamsign
              ? {
                  dreamsignId: dreamsign.id,
                  dreamsignName: dreamsign.name,
                  source: "pool" as const,
                }
              : {}),
          }),
        ],
        effect: -valueForWindow(125, window),
        uncertainty: -10,
      },
      {
        key: "opponent-point-threshold",
        text: `${window.phrase}, your opponent needs 3 additional points to win a battle.`,
        effects: [
          battlePayload(window, {
            operationKind: "opponent_point_threshold",
            modifier: "opponent_point_threshold",
            affectedPlayer: "opponent",
            affectedObjectClass: "battle_point_threshold",
            windowModifier: "increase_threshold",
            amount: 3,
            polarity: "positive",
            value: valueForWindow(95, window, 3),
            scope: baseScope,
          }),
        ],
        effect: valueForWindow(95, window, 3),
      },
    ],
  ];
  const eligible = variants.filter((entries) => entries.length >= 3);

  return pickSequentialVariant(
    drawContext,
    "timed-window:battle-object-variant",
    eligible,
  );
}

function stageFromContext(context: JourneyContext): "early" | "mid" | "late" {
  const dreamscape = context.state.quest.resources.dreamscape;

  if (dreamscape <= 1) {
    return "early";
  }

  return dreamscape <= 3 ? "mid" : "late";
}

function dreamwellModifier(
  window: TimedWindow,
  args: {
    kind: string;
    scope?: "battle_window" | "future_dreamwell";
    amount?: number;
    count?: number;
    cardRole?: "positive" | "bonus" | "penalty" | "upgrade" | "delayed" | "replacement";
    phaseSelector: "first_draw" | "lowest_phase" | "any_phase" | "future_dreamwell" | "penalty_card";
    polarity: "positive" | "negative";
    affectedObjectClass: string;
    windowModifier: string;
    value: number;
    timing?: string;
    replacement?: string;
  },
): Record<string, unknown> {
  return {
    ...dreamwellPayload({
      kind: args.kind,
      scope: args.scope ?? "battle_window",
      duration: window.duration,
      amount: args.amount,
      count: args.count,
      cardRole: args.cardRole,
      phaseSelector: args.phaseSelector,
      polarity: args.polarity,
      playerVisibility: args.polarity === "negative"
        ? "visible_to_both_players"
        : "visible_to_you",
      timing: args.timing,
      replacement: args.replacement,
    }),
    ...metadata(window, {
      timedWindowScope: "dreamwell",
      affectedObjectClass: args.affectedObjectClass,
      windowModifier: args.windowModifier,
      amount: args.amount ?? args.count ?? 1,
      polarity: args.polarity,
      windowValue: signedValue(args.value, args.polarity),
    }),
  };
}

function dreamwellCompensationRewards(
  context: JourneyContext,
  drawContext: DrawContext,
): {
  dreamsign?: TimedWindowEntry;
  card?: TimedWindowEntry;
  legendaryCard?: TimedWindowEntry;
} {
  const stage = stageFromContext(context);
  const dreamsign = selectContentBackedDreamsign({
    context,
    drawContext,
    label: "timed-window:dreamwell-compensation",
    stage,
    sources: ["pool", "catalog"],
  });
  const card = selectContentBackedCard({
    context,
    drawContext,
    label: "timed-window:dreamwell-compensation",
    stage,
    sources: ["draftPool", "catalog"],
  });
  const legendaryCard = selectContentBackedCard({
    context,
    drawContext,
    label: "timed-window:dreamwell-legendary-compensation",
    stage,
    sources: ["draftPool", "catalog"],
    predicate: { rarity: "Legendary" },
  });

  return {
    dreamsign: dreamsign
      ? {
          key: `named-dreamsign:${dreamsign.dreamsign.id}`,
          text: `Gain {${dreamsign.dreamsign.name}}.`,
          effects: [
            namedDreamsignPayload(
              {
                kind: "dreamsign_gain",
                dreamsign: dreamsign.dreamsign,
                source: dreamsign.source,
                extra: {
                  targetOrigin: dreamsign.targetOrigin,
                  selectionWeight: dreamsign.weight,
                  weightHooks: dreamsign.weightHooks,
                },
              },
              context,
            ),
          ],
          targets: [dreamsignExactTarget(dreamsign.dreamsign, dreamsign.source)],
          effect: DREAMWELL_VALUE_CONSTANTS.compensatingNamedReward,
        }
      : undefined,
    card: card
      ? {
          key: `named-card:${card.card.id}`,
          text: `Gain {${card.card.name}}.`,
          effects: [
            namedCardPayload(
              {
                kind: "card_gain",
                result: card.card,
                source: card.source,
                extra: {
                  targetOrigin: card.targetOrigin,
                  selectionWeight: card.weight,
                  weightHooks: card.weightHooks,
                },
              },
              context,
            ),
          ],
          targets: [
            cardExactTarget(
              card.card,
              card.source,
              `${card.card.name} as a ${card.targetOrigin.replace(/_/gu, " ")}`,
            ),
          ],
          effect: DREAMWELL_VALUE_CONSTANTS.compensatingNamedReward,
        }
      : undefined,
    legendaryCard: legendaryCard
      ? {
          key: `legendary-card:${legendaryCard.card.id}`,
          text: `Gain {${legendaryCard.card.name}}.`,
          effects: [
            namedCardPayload(
              {
                kind: "card_gain",
                result: legendaryCard.card,
                source: legendaryCard.source,
                extra: {
                  targetOrigin: legendaryCard.targetOrigin,
                  selectionWeight: legendaryCard.weight,
                  weightHooks: legendaryCard.weightHooks,
                  rewardPredicate: { rarity: "Legendary" },
                },
              },
              context,
            ),
          ],
          targets: [
            cardExactTarget(
              legendaryCard.card,
              legendaryCard.source,
              `${legendaryCard.card.name} as a Legendary ${legendaryCard.targetOrigin.replace(/_/gu, " ")}`,
            ),
          ],
          effect: DREAMWELL_VALUE_CONSTANTS.compensatingNamedReward,
        }
      : undefined,
  };
}

function burdenedDreamwellEntry(args: {
  key: string;
  textPrefix: string;
  burden: Record<string, unknown>;
  burdenValue: number;
  reward?: TimedWindowEntry;
}): TimedWindowEntry | undefined {
  if (!args.reward) {
    return undefined;
  }

  return {
    key: args.key,
    text: `${args.textPrefix} ${args.reward.text}`,
    effects: args.reward.effects,
    burdens: [args.burden],
    targets: args.reward.targets,
    effect: args.reward.effect,
    burden: -args.burdenValue,
    uncertainty: -10,
  };
}

function dreamwellWindowOptions(
  context: JourneyContext,
  window: TimedWindow,
  drawContext: DrawContext,
): TimedWindowEntry[] {
  const bonusCardCount = pickSequentialVariant(
    drawContext,
    "timed-window:dreamwell:bonus-card-count",
    [1, 2] as const,
  );
  const penaltyCardCount = pickSequentialVariant(
    drawContext,
    "timed-window:dreamwell:penalty-card-count",
    [1, 2, 3] as const,
  );
  const delayedCardCount = pickSequentialVariant(
    drawContext,
    "timed-window:dreamwell:delayed-card-count",
    [1, 2] as const,
  );
  const compensation = dreamwellCompensationRewards(context, drawContext);
  const firstDrawEnergyValue = valueForWindow(
    DREAMWELL_VALUE_CONSTANTS.firstDrawEnergy,
    window,
  );
  const bonusCardsValue = valueForWindow(
    DREAMWELL_VALUE_CONSTANTS.bonusCards,
    window,
    bonusCardCount,
  );
  const lowestPhaseUpgradeValue = valueForWindow(
    DREAMWELL_VALUE_CONSTANTS.lowestPhaseUpgrade,
    window,
  );
  const ignorePenaltyValue = valueForWindow(
    DREAMWELL_VALUE_CONSTANTS.ignorePenalty,
    window,
  );
  const replacementValue = valueForWindow(
    DREAMWELL_VALUE_CONSTANTS.futureCardReplacement,
    window,
  );
  const firstDrawPenaltyValue = burdenValueForDreamwellWindow(
    DREAMWELL_VALUE_CONSTANTS.firstDrawEnergyPenalty,
    window,
  );
  const penaltyCardsValue = burdenValueForDreamwellWindow(
    DREAMWELL_VALUE_CONSTANTS.penaltyCards,
    window,
    penaltyCardCount,
  );
  const delayedCardsValue = burdenValueForDreamwellWindow(
    DREAMWELL_VALUE_CONSTANTS.delayedPenaltyCards,
    window,
    delayedCardCount,
  );
  const candidates: TimedWindowEntry[] = [
    {
      key: "first-draw-energy",
      text: `${window.phrase}, your first Dreamwell draw produces 1 additional energy.`,
      effects: [
        dreamwellModifier(window, {
          kind: "first_draw_energy",
          amount: 1,
          count: 1,
          phaseSelector: "first_draw",
          polarity: "positive",
          affectedObjectClass: "dreamwell_draw",
          windowModifier: "first_draw_energy",
          value: firstDrawEnergyValue,
        }),
      ],
      effect: firstDrawEnergyValue,
    },
    {
      key: "bonus-cards",
      text: `${window.phrase}, shuffle ${bonusCardCount} bonus Dreamwell card${bonusCardCount === 1 ? "" : "s"} into your Dreamwell.`,
      effects: [
        dreamwellModifier(window, {
          kind: "bonus_cards",
          count: bonusCardCount,
          cardRole: "bonus",
          phaseSelector: "any_phase",
          polarity: "positive",
          affectedObjectClass: "dreamwell_card_pool",
          windowModifier: "add_bonus_cards",
          value: bonusCardsValue,
        }),
      ],
      effect: bonusCardsValue,
    },
    {
      key: "lowest-phase-upgrade",
      text: `${window.phrase}, upgrade your lowest-phase Dreamwell card each battle.`,
      effects: [
        dreamwellModifier(window, {
          kind: "upgrade_lowest_phase_card",
          count: 1,
          cardRole: "upgrade",
          phaseSelector: "lowest_phase",
          polarity: "positive",
          affectedObjectClass: "dreamwell_card",
          windowModifier: "upgrade_lowest_phase_card",
          value: lowestPhaseUpgradeValue,
        }),
      ],
      effect: lowestPhaseUpgradeValue,
    },
    {
      key: "skip-penalty",
      text: `${window.phrase}, ignore the first Dreamwell penalty card offered each battle.`,
      effects: [
        dreamwellModifier(window, {
          kind: "ignore_first_penalty",
          count: 1,
          cardRole: "penalty",
          phaseSelector: "penalty_card",
          polarity: "positive",
          affectedObjectClass: "dreamwell_penalty",
          windowModifier: "ignore_first_penalty",
          value: ignorePenaltyValue,
        }),
      ],
      effect: ignorePenaltyValue,
    },
    {
      key: "future-card-replacement",
      text: `${window.phrase}, replace the next penalty Dreamwell card you would draw with a bonus Dreamwell card.`,
      effects: [
        dreamwellModifier(window, {
          kind: "future_card_replacement",
          scope: "future_dreamwell",
          count: 1,
          cardRole: "replacement",
          phaseSelector: "future_dreamwell",
          polarity: "positive",
          affectedObjectClass: "dreamwell_card",
          windowModifier: "replace_penalty_with_bonus",
          value: replacementValue,
          replacement: "penalty_to_bonus",
        }),
      ],
      effect: replacementValue,
    },
    burdenedDreamwellEntry({
      key: "first-draw-less-energy",
      textPrefix: `${window.phrase}, your first Dreamwell draw produces 1 less energy.`,
      burden: dreamwellModifier(window, {
        kind: "first_draw_less_energy",
        amount: -1,
        count: 1,
        phaseSelector: "first_draw",
        polarity: "negative",
        affectedObjectClass: "dreamwell_draw",
        windowModifier: "first_draw_less_energy",
        value: firstDrawPenaltyValue,
      }),
      burdenValue: firstDrawPenaltyValue,
      reward: compensation.dreamsign ?? compensation.card,
    }),
    burdenedDreamwellEntry({
      key: "penalty-cards",
      textPrefix: `${window.phrase}, shuffle ${penaltyCardCount} penalty Dreamwell card${penaltyCardCount === 1 ? "" : "s"} into your Dreamwell.`,
      burden: dreamwellModifier(window, {
        kind: "penalty_cards",
        count: penaltyCardCount,
        cardRole: "penalty",
        phaseSelector: "any_phase",
        polarity: "negative",
        affectedObjectClass: "dreamwell_card_pool",
        windowModifier: "add_penalty_cards",
        value: penaltyCardsValue,
      }),
      burdenValue: penaltyCardsValue,
      reward: compensation.legendaryCard ?? compensation.card ?? compensation.dreamsign,
    }),
    burdenedDreamwellEntry({
      key: "delayed-penalty-cards",
      textPrefix: `${window.phrase}, shuffle ${delayedCardCount} delayed Dreamwell card${delayedCardCount === 1 ? "" : "s"} into your future Dreamwell.`,
      burden: dreamwellModifier(window, {
        kind: "delayed_penalty_cards",
        scope: "future_dreamwell",
        count: delayedCardCount,
        cardRole: "delayed",
        phaseSelector: "future_dreamwell",
        polarity: "negative",
        affectedObjectClass: "dreamwell_card_pool",
        windowModifier: "add_delayed_cards",
        value: delayedCardsValue,
        timing: `after ${window.duration}`,
      }),
      burdenValue: delayedCardsValue,
      reward: compensation.dreamsign ?? compensation.card,
    }),
  ].filter((entry): entry is TimedWindowEntry => entry !== undefined);

  return shuffleDeterministic(drawContext, "timed-window:dreamwell-options", candidates);
}

function shopWindowOptions(window: TimedWindow, drawContext: DrawContext): TimedWindowEntry[] {
  const discount = pickSequentialVariant(
    drawContext,
    "timed-window:shop:discount",
    [25, 30, 35] as const,
  );
  const restoreAmount = pickSequentialVariant(
    drawContext,
    "timed-window:shop:restore-amount",
    [80, 100, 120] as const,
  );
  const restoreBeforeShop: TimedWindowEntry = {
    key: "restore-before-next-shop",
    text: `${window.phrase}, restore ${restoreAmount} essence before your next Shop purchase.`,
    effects: [
      {
        ...shopPayload({
          kind: "next_shop_essence_restore",
          scope: "future_shops",
          duration: window.duration,
          amount: restoreAmount,
          count: window.count,
        }),
        ...metadata(window, {
          timedWindowScope: "shop",
          affectedObjectClass: "shop_resources",
          windowModifier: "pre_shop_essence_restore",
          amount: restoreAmount,
          polarity: "positive",
          windowValue: valueForWindow(150, window),
        }),
      },
      {
        ...resourcePayload({
          kind: "resource_restore_to_maximum",
          resource: "essence",
          amount: restoreAmount,
          basis: "maximum",
          timing: "before next shop",
          extra: {
            resourceAmountKind: "restore_to_maximum",
            shopEconomyTiming: "before_next_shop",
          },
        }),
        ...metadata(window, {
          timedWindowScope: "shop",
          affectedObjectClass: "essence",
          windowModifier: "restore_before_shop",
          amount: restoreAmount,
          polarity: "positive",
          windowValue: valueForWindow(150, window),
        }),
      },
    ],
    effect: valueForWindow(150, window),
  };
  const candidates: TimedWindowEntry[] = [
    {
      key: "free-rerolls",
      text: `${window.phrase}, Shop rerolls are free.`,
      effects: [
        {
          ...shopPayload({
            kind: "free_rerolls",
            scope: "future_shops",
            duration: window.duration,
            amount: 0,
            count: window.count,
          }),
          ...metadata(window, {
            timedWindowScope: "shop",
            affectedObjectClass: "shop_rerolls",
            windowModifier: "free_rerolls",
            amount: window.count,
            polarity: "positive",
            windowValue: valueForWindow(145, window),
          }),
        },
      ],
      effect: valueForWindow(145, window),
    },
    {
      key: "next-purchases-free",
      text: `The next ${window.count} items you purchase from shops are free.`,
      effects: [
        {
          ...shopPayload({
            kind: "free_next_purchases",
            scope: "next_purchases",
            duration: `next ${window.count} purchases`,
            count: window.count,
            counterKind: "purchase_count",
            purchaseCount: window.count,
          }),
          ...metadata(window, {
            timedWindowScope: "shop",
            affectedObjectClass: "shop_purchase",
            windowModifier: "free_next_purchases",
            amount: window.count,
            polarity: "positive",
            windowValue: valueForWindow(155, window),
          }),
        },
      ],
      effect: valueForWindow(155, window),
    },
    {
      key: "first-purchase-free",
      text: `${window.phrase}, the first item you purchase in each shop is free.`,
      effects: [
        {
          ...shopPayload({
            kind: "first_purchase_free",
            scope: "future_shops",
            duration: window.duration,
            count: window.count,
            counterKind: "purchase_count",
            purchaseCount: 1,
          }),
          ...metadata(window, {
            timedWindowScope: "shop",
            affectedObjectClass: "shop_purchase",
            windowModifier: "first_purchase_free",
            amount: window.count,
            polarity: "positive",
            windowValue: valueForWindow(150, window),
          }),
        },
      ],
      effect: valueForWindow(150, window),
    },
    {
      key: "trade-hook",
      text: `${window.phrase}, you may trade 1 omen for a ${discount + 10} essence discount at Shop sites.`,
      effects: [
        {
          ...shopPayload({
            kind: "future_shop_trade_hook",
            scope: "future_shops",
            duration: window.duration,
            amount: discount + 10,
            count: window.count,
            siteType: "Shop",
            hook: `trade 1 omen for a ${discount + 10} essence discount`,
          }),
          ...metadata(window, {
            timedWindowScope: "shop",
            affectedObjectClass: "shop_purchase",
            windowModifier: "omen_trade_discount",
            amount: discount + 10,
            polarity: "positive",
            windowValue: valueForWindow(145, window),
          }),
        },
      ],
      effect: valueForWindow(145, window),
    },
  ];

  return [
    restoreBeforeShop,
    ...shuffleDeterministic(drawContext, "timed-window:shop-options", candidates),
  ];
}

function routeWindowOptions(window: TimedWindow, drawContext: DrawContext): TimedWindowEntry[] {
  const probabilityDelta = pickSequentialVariant(
    drawContext,
    "timed-window:route:probability",
    [20, 25, 30] as const,
  );
  const route = (
    payload: ReturnType<typeof routePayload>,
    extra: Omit<TimedWindowPayloadMetadata, "timedWindowDuration" | "affectedPlayer"> & {
      affectedPlayer?: TimedWindowPayloadMetadata["affectedPlayer"];
    },
  ) => ({
    ...payload,
    duration: window.duration,
    ...metadata(window, extra),
  });
  const candidates: TimedWindowEntry[] = [
    {
      key: "add-dreamsign-offering",
      text: `${window.phrase}, add a Dreamsign Offering site to one route if possible.`,
      routeEffects: [
        route(
          routePayload({
            operation: "add_site",
            routeScope: "future_dreamscapes",
            polarity: "positive",
            siteDeltaValue: valueForWindow(130, window),
            siteType: "Dreamsign Offering",
            timing: window.duration,
            description: "add a Dreamsign Offering during a temporary route window",
          }),
          {
            timedWindowScope: "route",
            affectedObjectClass: "route_site",
            windowModifier: "add_site",
            amount: 1,
            polarity: "positive",
            windowValue: valueForWindow(130, window),
          },
        ),
      ],
      effect: valueForWindow(130, window),
    },
    {
      key: "replace-shop",
      text: `${window.phrase}, replace one Shop site with a Purge site if possible.`,
      routeEffects: [
        route(
          routePayload({
            operation: "replace_site",
            routeScope: "future_dreamscapes",
            polarity: "positive",
            siteDeltaValue: valueForWindow(135, window),
            fromSite: "Shop",
            toSite: "Purge",
            timing: window.duration,
            description: "replace a Shop site during a temporary route window",
          }),
          {
            timedWindowScope: "route",
            affectedObjectClass: "route_site",
            windowModifier: "replace_site",
            amount: 1,
            polarity: "positive",
            windowValue: valueForWindow(135, window),
          },
        ),
      ],
      effect: valueForWindow(135, window),
    },
    {
      key: "transfiguration-odds",
      text: `${window.phrase}, increase Transfiguration site odds by ${probabilityDelta}%.`,
      routeEffects: [
        route(
          routePayload({
            operation: "probability_adjustment",
            routeScope: "future_dreamscapes",
            polarity: "positive",
            siteDeltaValue: valueForWindow(140, window),
            siteType: "Transfiguration",
            probabilityDeltaPercent: probabilityDelta,
            timing: window.duration,
            description: "increase Transfiguration odds during a temporary route window",
          }),
          {
            timedWindowScope: "route",
            affectedObjectClass: "route_site_odds",
            windowModifier: "probability_adjustment",
            amount: probabilityDelta,
            polarity: "positive",
            windowValue: valueForWindow(140, window),
          },
        ),
      ],
      effect: valueForWindow(140, window),
    },
  ];

  return shuffleDeterministic(drawContext, "timed-window:route-options", candidates);
}

function temporaryObjectWindowOptions(
  context: JourneyContext,
  window: TimedWindow,
  drawContext: DrawContext,
): TimedWindowEntry[] {
  const dreamsign = selectedDreamsignTargets(context, drawContext)[0];
  const dreamsignEntry: TimedWindowEntry | undefined = dreamsign
    ? {
        key: "temporary-dreamsign",
        text: `${window.phrase}, gain {${dreamsign.name}} as a temporary Dreamsign.`,
        effects: [
          {
            kind: "dreamsign_temporary_grant",
            dreamsignId: dreamsign.id,
            dreamsignName: dreamsign.name,
            source: "pool",
            temporary: true,
            duration: window.duration,
            ...metadata(window, {
              timedWindowScope: "temporary_object",
              affectedObjectClass: "dreamsign",
              windowModifier: "temporary_grant",
              amount: 1,
              polarity: "positive",
              windowValue: valueForWindow(135, window),
            }),
          },
        ],
        effect: valueForWindow(135, window),
        uncertainty: -10,
      }
    : undefined;
  const candidates: TimedWindowEntry[] = [
    {
      key: "temporary-event-copy",
      text: `${window.phrase}, create a temporary copy of the first Event card you play each battle.`,
      effects: [
        {
          kind: "card_temporary_copy",
          duration: window.duration,
          copyCount: 1,
          temporary: true,
          predicate: { source: "deck", cardType: "Event" },
          ...metadata(window, {
            timedWindowScope: "temporary_object",
            affectedObjectClass: "event_card",
            windowModifier: "temporary_copy",
            amount: 1,
            polarity: "positive",
            windowValue: valueForWindow(140, window),
          }),
        },
      ],
      effect: valueForWindow(140, window),
      uncertainty: -10,
    },
    {
      key: "temporary-character-opening-hand",
      text: `${window.phrase}, one Character card in your deck starts in your opening hand.`,
      effects: [
        {
          kind: "card_opening_hand",
          duration: window.duration,
          predicate: { source: "deck", cardType: "Character" },
          ...metadata(window, {
            timedWindowScope: "temporary_object",
            affectedObjectClass: "character_card",
            windowModifier: "opening_hand",
            amount: 1,
            polarity: "positive",
            windowValue: valueForWindow(130, window),
          }),
        },
      ],
      effect: valueForWindow(130, window),
      uncertainty: -10,
    },
    ...(dreamsignEntry ? [dreamsignEntry] : []),
  ];

  return shuffleDeterministic(
    drawContext,
    "timed-window:temporary-object-options",
    candidates,
  );
}

function timedWindow(
  drawContext: DrawContext,
  shapeId: string,
): TimedWindow {
  const scope = pickSequentialVariant(drawContext, `${shapeId}:window-scope`, [
    "battle",
    "battle_object",
    "dreamwell",
    "shop",
    "route",
    "temporary_object",
  ] as const);

  if (
    scope === "battle" ||
    scope === "battle_object" ||
    scope === "dreamwell" ||
    scope === "temporary_object"
  ) {
    const count = pickSequentialVariant(
      drawContext,
      `${shapeId}:battle-window-count`,
      scope === "dreamwell" ? [2, 3, 5] as const : [2, 3, 4] as const,
    );
    const duration = count === 3 ? BATTLE_WINDOW_DURATION : `next ${count} battles`;

    return {
      scope,
      duration,
      count,
      phrase: `For the ${duration}`,
    };
  }

  if (scope === "shop") {
    const count = pickSequentialVariant(
      drawContext,
      `${shapeId}:shop-window-count`,
      [2, 3] as const,
    );

    return {
      scope,
      duration: `next ${count} future shops`,
      count,
      phrase: `For the next ${count} future shops`,
    };
  }

  const count = pickSequentialVariant(
    drawContext,
    `${shapeId}:route-window-count`,
    [2, 3] as const,
  );

  return {
    scope,
    duration: `next ${count} dreamscapes`,
    count,
    phrase: `For the next ${count} dreamscapes`,
  };
}

export function timedWindowMenuFill(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  shapeId: string;
}): {
  options: JourneyOption[];
  routeEdits: unknown[];
  symmetryContracts: JourneySymmetryContractDebug[];
} {
  const window = timedWindow(args.drawContext, args.shapeId);
  const entries = window.scope === "battle"
    ? battleWindowOptions(args.context, window, args.drawContext)
    : window.scope === "battle_object"
      ? battleObjectWindowOptions(args.context, window, args.drawContext)
    : window.scope === "dreamwell"
      ? dreamwellWindowOptions(args.context, window, args.drawContext)
      : window.scope === "shop"
        ? shopWindowOptions(window, args.drawContext)
        : window.scope === "route"
          ? routeWindowOptions(window, args.drawContext)
          : temporaryObjectWindowOptions(args.context, window, args.drawContext);

  const selected = entries.slice(0, 3);

  return {
    options: selected.map((entry, index) =>
      option({
        number: index + 1,
        text: entry.text,
        effects: entry.effects,
        burdens: entry.burdens,
        targets: entry.targets,
        routeEffects: entry.routeEffects,
        effect: entry.effect,
        burden: entry.burden,
        uncertainty: entry.uncertainty ?? -10,
      }),
    ),
    routeEdits: selected.flatMap((entry) => entry.routeEffects ?? []),
    symmetryContracts: [
      symmetryContract({
        contractKind: "shared_timing_different_rewards",
        sharedProperty: `${window.scope}:${window.duration}`,
        variedProperty: "window reward modifier",
        sharedFirst: true,
        optionNumbers: selected.map((_, index) => index + 1),
        sharedPayloadKeys: [window.duration],
        variedPayloadKeys: selected.map((entry) => entry.key),
        weight: 1,
      }),
    ],
  };
}
