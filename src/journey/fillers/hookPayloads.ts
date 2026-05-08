import type { CardContent, DreamsignContent } from "../../content/model.js";
import type { JourneyContext } from "../../quest/context.js";
import { type DrawContext } from "../../util/rng.js";
import type { JourneyOption } from "../manifest.js";
import { valueOmenLoss } from "../value.js";
import {
  dreamsignExactTarget,
  namedDreamsignPayload,
} from "./dreamsignPayloads.js";
import { shopPayload, statusPayload } from "./environmentPayloads.js";
import { catalogRewardCards, namedCardPayload } from "./namedCardPayloads.js";
import {
  GENERIC_CARD_DRAFT_PROFILE,
  type RewardSlot,
  cost,
  draftCards,
  gainEssence,
  gainOmen,
  lowerFirst,
  option,
  selectedDreamsignTargets,
  target,
} from "./shared.js";

type DelayedTimingSlot = {
  key: string;
  text: string;
  kind: string;
  multiplier: number;
  uncertainty: number;
};

export function hookTrigger(args: {
  triggerKind:
    | "battle"
    | "victory"
    | "each_battle"
    | "dreamscape"
    | "site_visit"
    | "named_card_play"
    | "dreamsign_trigger"
    | "card_added"
    | "essence_payment"
    | "future_shop"
    | "future_dream_journey";
  label: string;
  count?: number;
  siteType?: string;
  card?: CardContent;
  dreamsign?: DreamsignContent;
  amount?: number;
}): Record<string, unknown> {
  return {
    triggerKind: args.triggerKind,
    label: args.label,
    ...(args.count !== undefined ? { count: args.count } : {}),
    ...(args.siteType ? { siteType: args.siteType } : {}),
    ...(args.card ? { cardId: args.card.id, cardName: args.card.name } : {}),
    ...(args.dreamsign
      ? { dreamsignId: args.dreamsign.id, dreamsignName: args.dreamsign.name }
      : {}),
    ...(args.amount !== undefined ? { amount: args.amount } : {}),
  };
}

export function boundedDuration(
  durationKind:
    | "battle_count"
    | "dreamscape_count"
    | "shop_count"
    | "journey_count"
    | "until_trigger",
  label: string,
  count?: number,
): Record<string, unknown> {
  return {
    durationKind,
    label,
    ...(count !== undefined ? { count } : {}),
  };
}

export function expiration(
  policyKind:
    | "forfeit_reward"
    | "resolve_partial"
    | "pay_cost"
    | "return_unchanged"
    | "discard_obligation",
  label: string,
): Record<string, unknown> {
  return { policyKind, label };
}

export function hookVisibility(
  outcomeVisibility: "visible" | "hidden_until_resolution" | "debug_only",
  disclosure: string,
): Record<string, unknown> {
  return { outcomeVisibility, disclosure };
}

export function controlledScene(
  sceneKind: "reward" | "cost" | "transformation" | "trade" | "return",
  label: string,
): Record<string, unknown> {
  return { sceneKind, label };
}

export function delayedHookContract(args: {
  hookId: string;
  optionNumber: number;
  triggerSelector: Record<string, unknown>;
  trackedCondition: string;
  resolution: string;
  expiration: Record<string, unknown>;
  duration: Record<string, unknown>;
  controlledScene: Record<string, unknown>;
  visibilityPolicy?: Record<string, unknown>;
  reward: unknown | unknown[];
  hookBudgetCost?: number;
}): Record<string, unknown> {
  return {
    kind: "delayed_hook_contract",
    hookId: args.hookId,
    optionNumber: args.optionNumber,
    trigger: String(
      args.triggerSelector.label ?? "committed trigger",
    ).toLowerCase(),
    triggerSelector: args.triggerSelector,
    trackedCondition: args.trackedCondition,
    resolution: args.resolution,
    expiration: args.expiration,
    duration: args.duration,
    controlledScene: args.controlledScene,
    visibilityPolicy:
      args.visibilityPolicy ??
      hookVisibility(
        "visible",
        "The committed outcome is shown before choosing.",
      ),
    reward: args.reward,
    hookBudgetCost: args.hookBudgetCost ?? 0,
  };
}

function normalizedHookId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

function timingTriggerSelector(timing: DelayedTimingSlot): Record<string, unknown> {
  if (timing.key === "next-battle") {
    return hookTrigger({
      triggerKind: "battle",
      label: timing.text.toLowerCase(),
      count: 1,
    });
  }

  if (timing.key === "next-victory") {
    return hookTrigger({
      triggerKind: "victory",
      label: timing.text.toLowerCase(),
      count: 1,
    });
  }

  if (timing.key === "two-dreamscapes") {
    return hookTrigger({
      triggerKind: "dreamscape",
      label: timing.text.toLowerCase(),
      count: 2,
    });
  }

  return hookTrigger({
    triggerKind: "dreamscape",
    label: timing.text.toLowerCase(),
    count: 1,
  });
}

function timingDuration(timing: DelayedTimingSlot): Record<string, unknown> {
  if (timing.key === "next-battle") {
    return boundedDuration("dreamscape_count", "within 2 dreamscapes", 2);
  }

  if (timing.key === "next-victory") {
    return boundedDuration("battle_count", "next 2 battles", 2);
  }

  if (timing.key === "two-dreamscapes") {
    return boundedDuration("dreamscape_count", "within 2 dreamscapes", 2);
  }

  return boundedDuration("dreamscape_count", "next dreamscape", 1);
}

function timingExpiration(timing: DelayedTimingSlot): Record<string, unknown> {
  if (timing.key === "next-victory") {
    return expiration(
      "forfeit_reward",
      "If the next 2 battles are not victories, discard this hook with no reward.",
    );
  }

  if (timing.key === "next-battle") {
    return expiration(
      "forfeit_reward",
      "If no battle occurs within 2 dreamscapes, discard this hook with no reward.",
    );
  }

  return expiration(
    "forfeit_reward",
    `If ${timing.text.toLowerCase()} does not resolve, discard this hook with no reward.`,
  );
}

export function delayedRewardHookFill(args: {
  shapeId: string;
  optionNumber: number;
  timing: DelayedTimingSlot;
  reward: RewardSlot;
  optionText?: string;
  costs?: unknown[];
  burdens?: unknown[];
  cost?: number;
  burden?: number;
  effect?: number;
  uncertainty?: number;
  hookBudgetCost?: number;
}): { option: JourneyOption; precommit: Record<string, unknown> } {
  const optionEffect = args.effect ?? Math.round(args.reward.effect * args.timing.multiplier);
  const rewardLabel = lowerFirst(args.reward.text).replace(/\.$/u, "");
  const precommit = {
    ...delayedHookContract({
      hookId: normalizedHookId(
        `${args.shapeId}-${args.optionNumber}-${args.timing.key}-${args.reward.key}`,
      ),
      optionNumber: args.optionNumber,
      triggerSelector: timingTriggerSelector(args.timing),
      trackedCondition: `Track ${args.timing.text.toLowerCase()} for option ${args.optionNumber}.`,
      resolution: `${args.timing.text}, ${rewardLabel}.`,
      expiration: timingExpiration(args.timing),
      duration: timingDuration(args.timing),
      controlledScene: controlledScene("reward", rewardLabel),
      visibilityPolicy: hookVisibility(
        "visible",
        "The delayed trigger, expiration window, and committed reward are shown before choosing.",
      ),
      reward: args.reward.effects,
      hookBudgetCost: args.hookBudgetCost ?? 1,
    }),
    sourceShapeId: args.shapeId,
    timingKey: args.timing.key,
    rewardMetadata: {
      rewardKey: args.reward.key,
      baseConvertedEssence: args.reward.effect,
      expectedConvertedEssence: optionEffect,
      timingMultiplier: args.timing.multiplier,
    },
  };

  return {
    option: option({
      number: args.optionNumber,
      text:
        args.optionText ??
        `${args.timing.text}, ${lowerFirst(args.reward.text)}`,
      costs: args.costs ?? [],
      burdens: args.burdens ?? [],
      triggers: [precommit],
      effects: args.reward.effects,
      targets: args.reward.targets ?? [],
      routeEffects: args.reward.routeEffects ?? [],
      cost: args.cost,
      burden: args.burden,
      effect: optionEffect,
      uncertainty: args.uncertainty ?? args.timing.uncertainty,
    }),
    precommit,
  };
}

export function delayedTriggerMatrixOptions(
  context: JourneyContext,
  drawContext: DrawContext,
): JourneyOption[] {
  const cards = catalogRewardCards(context, drawContext);
  const cardA = cards[0] ?? context.content.cards[0]!;
  const cardB = cards[1] ?? cardA;
  const dreamsigns = selectedDreamsignTargets(context, drawContext);
  const dreamsign = dreamsigns[0] ?? context.content.dreamsigns[0]!;
  const battleHooks = [
    delayedHookContract({
      hookId: "hook-battle",
      optionNumber: 1,
      triggerSelector: hookTrigger({
        triggerKind: "battle",
        label: "after next battle",
        count: 1,
      }),
      trackedCondition: "Track completion of the next battle.",
      resolution: "When the battle ends, gain 90 essence.",
      expiration: expiration(
        "forfeit_reward",
        "If no battle occurs within 2 dreamscapes, discard this hook with no reward.",
      ),
      duration: boundedDuration("dreamscape_count", "within 2 dreamscapes", 2),
      controlledScene: controlledScene("reward", "gain 90 essence"),
      reward: gainEssence(90),
      hookBudgetCost: 1,
    }),
    delayedHookContract({
      hookId: "hook-victory",
      optionNumber: 1,
      triggerSelector: hookTrigger({
        triggerKind: "victory",
        label: "after next victory",
        count: 1,
      }),
      trackedCondition: "Track the next won battle.",
      resolution: "On victory, gain 1 omen.",
      expiration: expiration(
        "forfeit_reward",
        "If the next 2 battles are not victories, discard this hook.",
      ),
      duration: boundedDuration("battle_count", "next 2 battles", 2),
      controlledScene: controlledScene("reward", "gain 1 omen"),
      reward: gainOmen(1),
    }),
    delayedHookContract({
      hookId: "hook-each-battle",
      optionNumber: 1,
      triggerSelector: hookTrigger({
        triggerKind: "each_battle",
        label: "each of the next 2 battles",
        count: 2,
      }),
      trackedCondition: "Track each completed battle in a 2-battle window.",
      resolution: "After the second tracked battle, draft 1 of 4 cards.",
      expiration: expiration(
        "resolve_partial",
        "If only one battle occurs within 2 dreamscapes, gain 40 essence instead.",
      ),
      duration: boundedDuration("battle_count", "next 2 battles", 2),
      controlledScene: controlledScene("reward", "draft 1 of 4 cards"),
      reward: draftCards(GENERIC_CARD_DRAFT_PROFILE),
    }),
    delayedHookContract({
      hookId: "hook-site-visit",
      optionNumber: 1,
      triggerSelector: hookTrigger({
        triggerKind: "site_visit",
        label: "when you visit a Shop site",
        siteType: "Shop",
      }),
      trackedCondition: "Track the next Shop site visit.",
      resolution: "At that site, trade this hook for a 45 essence discount.",
      expiration: expiration(
        "discard_obligation",
        "If no Shop appears within 2 dreamscapes, discard the trade hook.",
      ),
      duration: boundedDuration("dreamscape_count", "within 2 dreamscapes", 2),
      controlledScene: controlledScene("trade", "45 essence Shop discount"),
      reward: shopPayload({
        kind: "future_shop_trade_hook",
        scope: "future_shops",
        duration: "next Shop site",
        amount: 45,
        count: 1,
        siteType: "Shop",
        hook: "spend this hook for a 45 essence discount",
      }),
    }),
  ];
  const objectHooks = [
    delayedHookContract({
      hookId: "hook-named-card-play",
      optionNumber: 2,
      triggerSelector: hookTrigger({
        triggerKind: "named_card_play",
        label: `when you play ${cardA.name}`,
        card: cardA,
      }),
      trackedCondition: `Track the next time {${cardA.name}} is played.`,
      resolution: `When played, transform it into {${cardB.name}} after the battle.`,
      expiration: expiration(
        "return_unchanged",
        "If it is not played in the next 3 battles, keep the card unchanged.",
      ),
      duration: boundedDuration("battle_count", "next 3 battles", 3),
      controlledScene: controlledScene(
        "transformation",
        `${cardA.name} becomes ${cardB.name}`,
      ),
      reward: namedCardPayload(
        {
          kind: "card_transform",
          target: cardA,
          result: cardB,
          source: "catalog",
          extra: { timing: "after named card play" },
        },
        context,
      ),
      hookBudgetCost: 1,
    }),
    delayedHookContract({
      hookId: "hook-dreamsign-trigger",
      optionNumber: 2,
      triggerSelector: hookTrigger({
        triggerKind: "dreamsign_trigger",
        label: `when ${dreamsign.name} triggers`,
        dreamsign,
      }),
      trackedCondition: `Track the next {${dreamsign.name}} trigger.`,
      resolution: "When it triggers, gain 120 essence.",
      expiration: expiration(
        "forfeit_reward",
        "If the Dreamsign does not trigger within 3 battles, gain nothing.",
      ),
      duration: boundedDuration("battle_count", "next 3 battles", 3),
      controlledScene: controlledScene("reward", "gain 120 essence"),
      reward: gainEssence(120),
    }),
    delayedHookContract({
      hookId: "hook-card-added",
      optionNumber: 2,
      triggerSelector: hookTrigger({
        triggerKind: "card_added",
        label: `when ${cardB.name} is added`,
        card: cardB,
      }),
      trackedCondition: `Track adding {${cardB.name}} to your deck.`,
      resolution: "When added, gain a temporary copy for the next battle.",
      expiration: expiration(
        "forfeit_reward",
        "If the card is not added before the next Dream Journey, discard the copy.",
      ),
      duration: boundedDuration(
        "journey_count",
        "before the next Dream Journey",
        1,
      ),
      controlledScene: controlledScene(
        "reward",
        `temporary copy of ${cardB.name}`,
      ),
      reward: namedCardPayload(
        {
          kind: "card_temporary_copy",
          target: cardB,
          source: "catalog",
          extra: { duration: "next battle", temporary: true },
        },
        context,
      ),
    }),
  ];
  const economyHooks = [
    delayedHookContract({
      hookId: "hook-essence-payment",
      optionNumber: 3,
      triggerSelector: hookTrigger({
        triggerKind: "essence_payment",
        label: "when you next pay at least 40 essence",
        amount: 40,
      }),
      trackedCondition: "Track the next payment of 40 or more essence.",
      resolution: "After paying, refund 20 essence and gain 1 omen.",
      expiration: expiration(
        "forfeit_reward",
        "If no qualifying payment happens within 2 dreamscapes, discard the refund.",
      ),
      duration: boundedDuration("dreamscape_count", "within 2 dreamscapes", 2),
      controlledScene: controlledScene(
        "reward",
        "refund 20 essence and gain 1 omen",
      ),
      visibilityPolicy: hookVisibility(
        "hidden_until_resolution",
        "The refund amount is precommitted in JSON/debug and summarized before choosing.",
      ),
      reward: [gainEssence(20), gainOmen(1)],
      hookBudgetCost: 1,
    }),
    delayedHookContract({
      hookId: "hook-future-shop",
      optionNumber: 3,
      triggerSelector: hookTrigger({
        triggerKind: "future_shop",
        label: "at the next future shop",
        count: 1,
      }),
      trackedCondition: "Track the next future Shop site.",
      resolution: "At that shop, trade 1 omen for an 80 essence discount.",
      expiration: expiration(
        "discard_obligation",
        "If no future shop appears within 2 dreamscapes, discard the trade.",
      ),
      duration: boundedDuration("shop_count", "next future shop", 1),
      controlledScene: controlledScene(
        "trade",
        "trade 1 omen for an 80 essence discount",
      ),
      reward: shopPayload({
        kind: "future_shop_trade_hook",
        scope: "future_shops",
        duration: "next future shop",
        amount: 80,
        count: 1,
        siteType: "Shop",
        hook: "trade 1 omen for an 80 essence discount",
      }),
    }),
    delayedHookContract({
      hookId: "hook-future-dream-journey",
      optionNumber: 3,
      triggerSelector: hookTrigger({
        triggerKind: "future_dream_journey",
        label: "at the next Dream Journey site",
        count: 1,
      }),
      trackedCondition: "Track the next Dream Journey site you enter.",
      resolution: "The next Dream Journey starts with 1 extra option.",
      expiration: expiration(
        "discard_obligation",
        "If no Dream Journey site appears within 2 dreamscapes, discard this hook.",
      ),
      duration: boundedDuration("journey_count", "next Dream Journey site", 1),
      controlledScene: controlledScene(
        "reward",
        "next Dream Journey has 1 extra option",
      ),
      reward: statusPayload({
        kind: "status_reward_replacement",
        statusName: "Widened Journey",
        statusScope: "quest",
        duration: "one_time",
        ruleMutationKind: "reward_replacement",
        replacement: "one extra Dream Journey option",
      }),
    }),
  ];

  return [
    option({
      number: 1,
      text: "Track the next battle, next victory, each of the next 2 battles, and the next Shop visit. Resolve into essence, omens, a card draft, or a Shop trade; any expired hook forfeits, resolves partial, or is discarded as stated.",
      triggers: battleHooks,
      effect: 150,
      uncertainty: -10,
    }),
    option({
      number: 2,
      text: `Track a {${cardA.name}} play, a {${dreamsign.name}} trigger, and adding {${cardB.name}}. Resolve into a transformation, essence, or a temporary card; expiration leaves the object unchanged or forfeits the reward.`,
      targets: [
        target("card", `${cardA.name} in catalog`, {
          source: "catalog",
          ids: [cardA.id],
          names: [cardA.name],
        }),
        target("card", `${cardB.name} in catalog`, {
          source: "catalog",
          ids: [cardB.id],
          names: [cardB.name],
        }),
        dreamsignExactTarget(dreamsign, "pool"),
      ],
      triggers: objectHooks,
      effect: 145,
      uncertainty: -12,
    }),
    option({
      number: 3,
      text: "Track an essence payment, the next future shop, and the next Dream Journey site. Resolve into a refund, an omen-for-discount trade, or one extra future option; hidden refund details are disclosed in JSON/debug and expire after the bounded window.",
      triggers: economyHooks,
      effect: 155,
      uncertainty: -15,
    }),
  ];
}

export function pairedReturnContract(args: {
  pairedReturnId: string;
  optionNumber: number;
  anchor: string;
  created: Record<string, unknown>;
  returnScene: Record<string, unknown>;
  visibilityPolicy?: Record<string, unknown>;
  reward: unknown | unknown[];
}): Record<string, unknown> {
  const returnScene = args.returnScene;

  return {
    kind: "paired_return_contract",
    pairedReturnId: args.pairedReturnId,
    hookId: args.pairedReturnId,
    optionNumber: args.optionNumber,
    anchor: args.anchor,
    created: args.created,
    returnScene,
    trigger: String(
      (returnScene.triggerSelector as Record<string, unknown> | undefined)
        ?.label ?? "committed return",
    ).toLowerCase(),
    triggerSelector: returnScene.triggerSelector,
    trackedCondition: `Track return scene for ${args.anchor}.`,
    resolution:
      typeof returnScene.resolution === "string"
        ? returnScene.resolution
        : `Resolve ${args.anchor}.`,
    expiration: returnScene.expiration,
    duration: returnScene.duration,
    controlledScene: controlledScene("return", args.anchor),
    visibilityPolicy:
      args.visibilityPolicy ??
      hookVisibility("visible", "The return scene is shown before choosing."),
    reward: args.reward,
    hookBudgetCost: 1,
  };
}

export function pairedReturnSealBorrowTradeOptions(
  context: JourneyContext,
  drawContext: DrawContext,
): JourneyOption[] {
  const cards = catalogRewardCards(context, drawContext);
  const sealedCard = cards[0] ?? context.content.cards[0]!;
  const returnedCard = cards[1] ?? sealedCard;
  const dreamsigns = selectedDreamsignTargets(context, drawContext);
  const borrowedDreamsign = dreamsigns[0] ?? context.content.dreamsigns[0]!;
  const tradeDreamsign =
    dreamsigns[1] ??
    context.content.dreamsigns.find(
      (entry) => entry.id !== borrowedDreamsign.id,
    ) ??
    borrowedDreamsign;
  const sealedReturn = pairedReturnContract({
    pairedReturnId: "return-sealed-card",
    optionNumber: 1,
    anchor: `${sealedCard.name} sealed bundle`,
    created: {
      referenceKind: "sealed_object",
      referenceId: "sealed-card",
      label: `Seal {${sealedCard.name}} until the next Dream Journey site.`,
      objectKind: "card",
      cardId: sealedCard.id,
      cardName: sealedCard.name,
      statusScope: "quest",
    },
    returnScene: {
      returnSceneKind: "sealed_object_return",
      triggerSelector: hookTrigger({
        triggerKind: "future_dream_journey",
        label: "at the next Dream Journey site",
        count: 1,
      }),
      referencesCreatedId: "sealed-card",
      resolution: `Return {${sealedCard.name}} as {${returnedCard.name}} and gain 1 omen.`,
      expiration: expiration(
        "return_unchanged",
        "If no Dream Journey site appears within 2 dreamscapes, return the sealed card unchanged.",
      ),
      duration: boundedDuration("dreamscape_count", "within 2 dreamscapes", 2),
    },
    reward: [
      namedCardPayload(
        {
          kind: "card_transform",
          target: sealedCard,
          result: returnedCard,
          source: "catalog",
          extra: { timing: "at the next Dream Journey site" },
        },
        context,
      ),
      gainOmen(1),
    ],
  });
  const borrowedReturn = pairedReturnContract({
    pairedReturnId: "return-borrowed-dreamsign",
    optionNumber: 2,
    anchor: `${borrowedDreamsign.name} borrowed sign`,
    created: {
      referenceKind: "borrowed_object",
      referenceId: "borrowed-dreamsign",
      label: `Borrow {${borrowedDreamsign.name}} for the next 2 battles.`,
      objectKind: "dreamsign",
      dreamsignId: borrowedDreamsign.id,
      dreamsignName: borrowedDreamsign.name,
    },
    returnScene: {
      returnSceneKind: "borrowed_object_return",
      triggerSelector: hookTrigger({
        triggerKind: "each_battle",
        label: "after 2 battles",
        count: 2,
      }),
      referencesCreatedId: "borrowed-dreamsign",
      resolution: `Return {${borrowedDreamsign.name}} and pay 1 omen; if paid, gain 90 essence.`,
      expiration: expiration(
        "pay_cost",
        "If the borrowed sign is not returned after 2 battles, pay 1 omen.",
      ),
      duration: boundedDuration("battle_count", "next 2 battles", 2),
    },
    reward: [
      namedDreamsignPayload(
        {
          kind: "dreamsign_temporary_grant",
          dreamsign: borrowedDreamsign,
          source: "pool",
          extra: { temporary: true, duration: "next 2 battles" },
        },
        context,
      ),
      gainEssence(90),
    ],
  });
  const tradeReturn = pairedReturnContract({
    pairedReturnId: "return-future-trade",
    optionNumber: 2,
    anchor: `${borrowedDreamsign.name} for ${tradeDreamsign.name} trade promise`,
    created: {
      referenceKind: "trade_promise",
      referenceId: "future-dreamsign-trade",
      label: `Promise to trade {${borrowedDreamsign.name}} for {${tradeDreamsign.name}} at the next Shop.`,
      objectKind: "promise",
      dreamsignId: borrowedDreamsign.id,
      dreamsignName: borrowedDreamsign.name,
      cost: { resource: "omens", amount: 1 },
    },
    returnScene: {
      returnSceneKind: "future_trade",
      triggerSelector: hookTrigger({
        triggerKind: "future_shop",
        label: "at the next future shop",
        count: 1,
      }),
      referencesCreatedId: "future-dreamsign-trade",
      resolution: `Trade {${borrowedDreamsign.name}} and 1 omen for {${tradeDreamsign.name}}.`,
      expiration: expiration(
        "discard_obligation",
        "If no future shop appears within 2 dreamscapes, discard the trade promise.",
      ),
      duration: boundedDuration("dreamscape_count", "within 2 dreamscapes", 2),
    },
    reward: namedDreamsignPayload(
      {
        kind: "dreamsign_trade_hook",
        dreamsign: borrowedDreamsign,
        source: "pool",
        result: tradeDreamsign,
        resultSource: "pool",
        extra: {
          timing: "at the next future shop",
          obligation: `Trade ${borrowedDreamsign.name} and 1 omen for ${tradeDreamsign.name}`,
          giveDreamsignId: borrowedDreamsign.id,
          giveDreamsignName: borrowedDreamsign.name,
          receiveDreamsignId: tradeDreamsign.id,
          receiveDreamsignName: tradeDreamsign.name,
        },
      },
      context,
    ),
  });

  return [
    option({
      number: 1,
      text: `Seal {${sealedCard.name}} until the next Dream Journey site. Track that site; return it as {${returnedCard.name}} and gain 1 omen, or return it unchanged if the 2-dreamscape window expires.`,
      targets: [
        target("card", `${sealedCard.name} in catalog`, {
          source: "catalog",
          ids: [sealedCard.id],
          names: [sealedCard.name],
        }),
        target("card", `${returnedCard.name} in catalog`, {
          source: "catalog",
          ids: [returnedCard.id],
          names: [returnedCard.name],
        }),
      ],
      triggers: [sealedReturn],
      effect: 145,
      uncertainty: -10,
    }),
    option({
      number: 2,
      text: `Borrow {${borrowedDreamsign.name}} for 2 battles and remember a future trade. Return the borrowed sign after 2 battles for 1 omen and 90 essence; at the next future shop, trade it and 1 omen for {${tradeDreamsign.name}}, or discard the promise if it expires.`,
      costs: [cost("omens", Math.min(1, context.state.quest.resources.omens))],
      targets: [
        dreamsignExactTarget(borrowedDreamsign, "pool"),
        dreamsignExactTarget(tradeDreamsign, "pool"),
      ],
      triggers: [borrowedReturn, tradeReturn],
      cost: Math.abs(
        valueOmenLoss(Math.min(1, context.state.quest.resources.omens)),
      ),
      effect: 155,
      uncertainty: -15,
    }),
  ];
}
