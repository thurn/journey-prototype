import type { JourneyContext } from "../../quest/context.js";
import {
  shuffleDeterministic,
  type DrawContext,
} from "../../util/rng.js";
import type { JourneyOption } from "../manifest.js";
import { dreamwellPayload, shopPayload } from "./environmentPayloads.js";
import { routePayload } from "./routeEditCatalog.js";
import {
  BATTLE_WINDOW_DURATION,
  option,
  pickSequentialVariant,
  selectedDreamsignTargets,
} from "./shared.js";

type TimedWindowScope =
  | "battle"
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
  routeEffects?: unknown[];
  effect: number;
  uncertainty?: number;
};

type TimedWindowPayloadMetadata = {
  timedWindowScope: TimedWindowScope;
  timedWindowDuration: {
    durationKind: "battle_count" | "shop_count" | "dreamscape_count";
    count: number;
  };
  affectedObjectClass: string;
  windowModifier: string;
  amount: number;
  polarity: "positive" | "negative" | "neutral";
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
  args: Omit<TimedWindowPayloadMetadata, "timedWindowDuration">,
): TimedWindowPayloadMetadata {
  return {
    ...args,
    timedWindowDuration: {
      durationKind: durationKind(args.timedWindowScope),
      count: window.count,
    },
  };
}

function valueForWindow(baseValue: number, window: TimedWindow, amount = 1): number {
  return baseValue + (window.count - 2) * 10 + (amount - 1) * 25;
}

function battleWindowOptions(window: TimedWindow, drawContext: DrawContext): TimedWindowEntry[] {
  const openingHandAmount = pickSequentialVariant(
    drawContext,
    "timed-window:battle:opening-hand-amount",
    [1, 2] as const,
  );
  const turnTwoAmount = pickSequentialVariant(
    drawContext,
    "timed-window:battle:turn-two-amount",
    [1, 2] as const,
  );
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
        {
          kind: "battle_window_modifier",
          duration: window.duration,
          modifier: "opening_hand_cards",
          ...metadata(window, {
            timedWindowScope: "battle",
            affectedObjectClass: "opening_hand",
            windowModifier: "extra_cards",
            amount: openingHandAmount,
            polarity: "positive",
            windowValue: valueForWindow(145, window, openingHandAmount),
          }),
        },
      ],
      effect: valueForWindow(145, window, openingHandAmount),
    },
    {
      key: "turn-one-energy",
      text: `${window.phrase}, gain 1 extra energy on turn 1.`,
      effects: [
        {
          kind: "battle_window_modifier",
          duration: window.duration,
          modifier: "turn_1_energy",
          ...metadata(window, {
            timedWindowScope: "battle",
            affectedObjectClass: "turn_1_energy",
            windowModifier: "extra_energy",
            amount: 1,
            polarity: "positive",
            windowValue: valueForWindow(150, window),
          }),
        },
      ],
      effect: valueForWindow(150, window),
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
      key: "turn-two-cards",
      text: `${window.phrase}, draw ${turnTwoAmount} extra card${turnTwoAmount === 1 ? "" : "s"} on turn 2.`,
      effects: [
        {
          kind: "battle_window_modifier",
          duration: window.duration,
          modifier: "turn_2_cards",
          ...metadata(window, {
            timedWindowScope: "battle",
            affectedObjectClass: "turn_2_draw",
            windowModifier: "extra_cards",
            amount: turnTwoAmount,
            polarity: "positive",
            windowValue: valueForWindow(140, window, turnTwoAmount),
          }),
        },
      ],
      effect: valueForWindow(140, window, turnTwoAmount),
    },
  ];

  return shuffleDeterministic(drawContext, "timed-window:battle-options", candidates);
}

function dreamwellWindowOptions(window: TimedWindow, drawContext: DrawContext): TimedWindowEntry[] {
  const candidates: TimedWindowEntry[] = [
    {
      key: "first-draw-energy",
      text: `${window.phrase}, your first Dreamwell draw produces 1 additional energy.`,
      effects: [
        {
          ...dreamwellPayload({
            kind: "first_draw_energy",
            scope: "battle_window",
            duration: window.duration,
            amount: 1,
          }),
          ...metadata(window, {
            timedWindowScope: "dreamwell",
            affectedObjectClass: "dreamwell_draw",
            windowModifier: "first_draw_energy",
            amount: 1,
            polarity: "positive",
            windowValue: valueForWindow(135, window),
          }),
        },
      ],
      effect: valueForWindow(135, window),
    },
    {
      key: "positive-card",
      text: `${window.phrase}, the Dreamwell includes 1 additional positive card.`,
      effects: [
        {
          ...dreamwellPayload({
            kind: "positive_card",
            scope: "battle_window",
            duration: window.duration,
            amount: 1,
            cardRole: "positive",
          }),
          ...metadata(window, {
            timedWindowScope: "dreamwell",
            affectedObjectClass: "dreamwell_card_pool",
            windowModifier: "add_positive_card",
            amount: 1,
            polarity: "positive",
            windowValue: valueForWindow(145, window),
          }),
        },
      ],
      effect: valueForWindow(145, window),
    },
    {
      key: "upgrade-card",
      text: `${window.phrase}, upgrade the first Dreamwell card you draw each battle.`,
      effects: [
        {
          ...dreamwellPayload({
            kind: "upgrade_first_card",
            scope: "battle_window",
            duration: window.duration,
            amount: 1,
            cardRole: "upgrade",
          }),
          ...metadata(window, {
            timedWindowScope: "dreamwell",
            affectedObjectClass: "dreamwell_card",
            windowModifier: "upgrade_first_card",
            amount: 1,
            polarity: "positive",
            windowValue: valueForWindow(140, window),
          }),
        },
      ],
      effect: valueForWindow(140, window),
    },
    {
      key: "skip-penalty",
      text: `${window.phrase}, ignore the first Dreamwell penalty card offered each battle.`,
      effects: [
        {
          ...dreamwellPayload({
            kind: "ignore_first_penalty",
            scope: "battle_window",
            duration: window.duration,
            amount: 1,
            cardRole: "penalty",
          }),
          ...metadata(window, {
            timedWindowScope: "dreamwell",
            affectedObjectClass: "dreamwell_penalty",
            windowModifier: "ignore_first_penalty",
            amount: 1,
            polarity: "positive",
            windowValue: valueForWindow(135, window),
          }),
        },
      ],
      effect: valueForWindow(135, window),
    },
  ];

  return shuffleDeterministic(drawContext, "timed-window:dreamwell-options", candidates);
}

function shopWindowOptions(window: TimedWindow, drawContext: DrawContext): TimedWindowEntry[] {
  const discount = pickSequentialVariant(
    drawContext,
    "timed-window:shop:discount",
    [25, 30, 35] as const,
  );
  const candidates: TimedWindowEntry[] = [
    {
      key: "reroll-discount",
      text: `${window.phrase}, rerolls cost 1 fewer omen.`,
      effects: [
        {
          ...shopPayload({
            kind: "reroll_discount",
            scope: "future_shops",
            duration: window.duration,
            amount: 1,
            count: window.count,
          }),
          ...metadata(window, {
            timedWindowScope: "shop",
            affectedObjectClass: "shop_rerolls",
            windowModifier: "omen_discount",
            amount: 1,
            polarity: "positive",
            windowValue: valueForWindow(135, window),
          }),
        },
      ],
      effect: valueForWindow(135, window),
    },
    {
      key: "purchase-discount",
      text: `${window.phrase}, your first purchase costs ${discount} less essence.`,
      effects: [
        {
          ...shopPayload({
            kind: "first_purchase_discount",
            scope: "future_shops",
            duration: window.duration,
            amount: discount,
            count: window.count,
          }),
          ...metadata(window, {
            timedWindowScope: "shop",
            affectedObjectClass: "shop_purchase",
            windowModifier: "essence_discount",
            amount: discount,
            polarity: "positive",
            windowValue: valueForWindow(140, window),
          }),
        },
      ],
      effect: valueForWindow(140, window),
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

  return shuffleDeterministic(drawContext, "timed-window:shop-options", candidates);
}

function routeWindowOptions(window: TimedWindow, drawContext: DrawContext): TimedWindowEntry[] {
  const probabilityDelta = pickSequentialVariant(
    drawContext,
    "timed-window:route:probability",
    [20, 25, 30] as const,
  );
  const route = (
    payload: ReturnType<typeof routePayload>,
    extra: Omit<TimedWindowPayloadMetadata, "timedWindowDuration">,
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
    "dreamwell",
    "shop",
    "route",
    "temporary_object",
  ] as const);

  if (scope === "battle" || scope === "dreamwell" || scope === "temporary_object") {
    const count = pickSequentialVariant(
      drawContext,
      `${shapeId}:battle-window-count`,
      [2, 3, 4] as const,
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
} {
  const window = timedWindow(args.drawContext, args.shapeId);
  const entries = window.scope === "battle"
    ? battleWindowOptions(window, args.drawContext)
    : window.scope === "dreamwell"
      ? dreamwellWindowOptions(window, args.drawContext)
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
        routeEffects: entry.routeEffects,
        effect: entry.effect,
        uncertainty: entry.uncertainty ?? -10,
      }),
    ),
    routeEdits: selected.flatMap((entry) => entry.routeEffects ?? []),
  };
}
