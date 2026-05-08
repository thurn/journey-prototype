import type { CardContent, DreamsignContent } from "../../content/model.js";
import type { JourneyContext } from "../../quest/context.js";
import {
  shuffleDeterministic,
  type DrawContext,
} from "../../util/rng.js";
import { BANE_NAMES, type BaneName } from "../effects.js";
import type { JourneyOption } from "../manifest.js";
import {
  valueBaneBurden,
  valueDreamsignOperation,
  valueOmenGain,
  valueOmenLoss,
} from "../value.js";
import {
  dreamsignExactTarget,
  namedDreamsignPayload,
} from "./dreamsignPayloads.js";
import { shopPayload, statusPayload } from "./environmentPayloads.js";
import { catalogRewardCards, cardExactTarget, cardQualityValue, namedCardPayload } from "./namedCardPayloads.js";
import { routePayload } from "./routeEditCatalog.js";
import {
  GENERIC_CARD_DRAFT_PROFILE,
  type RewardSlot,
  baneBurden,
  baneTarget,
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

type PairedReturnFamilyId =
  | "sealed_card"
  | "borrowed_dreamsign"
  | "future_trade";

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

function optionRewardLabel(reward: RewardSlot): string {
  return lowerFirst(reward.text).replace(/\.$/u, "");
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

type ExpandedDelayedHookFill = {
  key: string;
  text: string;
  triggerSelector: Record<string, unknown>;
  trackedCondition: string;
  resolution: string;
  expiration: Record<string, unknown>;
  duration: Record<string, unknown>;
  controlledScene: Record<string, unknown>;
  visibilityPolicy?: Record<string, unknown>;
  reward: unknown | unknown[];
  effects?: unknown[];
  burdens?: unknown[];
  targets?: unknown[];
  effect: number;
  burden?: number;
  uncertainty: number;
  hookBudgetCost?: number;
};

function findCard(
  context: JourneyContext,
  name: string,
  fallback: CardContent,
): CardContent {
  return context.content.cards.find((card) => card.name === name) ?? fallback;
}

function findDreamsign(
  context: JourneyContext,
  name: string,
  fallback: DreamsignContent,
): DreamsignContent {
  return context.content.dreamsigns.find((dreamsign) => dreamsign.name === name) ??
    fallback;
}

function namedDreamsignGrant(
  context: JourneyContext,
  dreamsign: DreamsignContent,
  timing = "immediate",
): Record<string, unknown> {
  return namedDreamsignPayload(
    {
      kind: "dreamsign_gain",
      dreamsign,
      source: "catalog",
      extra: { timing },
    },
    context,
  );
}

function namedCardGrant(
  context: JourneyContext,
  card: CardContent,
  timing = "immediate",
): Record<string, unknown> {
  return namedCardPayload(
    {
      kind: "card_gain",
      result: card,
      source: "catalog",
      extra: { timing },
    },
    context,
  );
}

function expandedDelayedHookCandidates(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage?: "early" | "mid" | "late";
}): ExpandedDelayedHookFill[] {
  const cards = catalogRewardCards(args.context, args.drawContext);
  const cardA = findCard(
    args.context,
    "Moonlit Voyage",
    cards[0] ?? args.context.content.cards[0]!,
  );
  const cardB = findCard(
    args.context,
    "Aspiring Guardian",
    cards.find((card) => card.id !== cardA.id) ?? cardA,
  );
  const cardC = findCard(
    args.context,
    "Beacon of Tomorrow",
    cards.find((card) => card.id !== cardA.id && card.id !== cardB.id) ??
      cardA,
  );
  const cardD = findCard(
    args.context,
    "Scrap Reclaimer",
    cards.find((card) =>
      card.id !== cardA.id && card.id !== cardB.id && card.id !== cardC.id
    ) ?? cardA,
  );
  const cardE = findCard(
    args.context,
    "Evacuation Enforcer",
    cards.find((card) =>
      card.id !== cardA.id &&
      card.id !== cardB.id &&
      card.id !== cardC.id &&
      card.id !== cardD.id
    ) ?? cardA,
  );
  const dreamsigns = selectedDreamsignTargets(args.context, args.drawContext);
  const dreamsignA = findDreamsign(
    args.context,
    "Essence Vial",
    dreamsigns[0] ?? args.context.content.dreamsigns[0]!,
  );
  const dreamsignB = findDreamsign(
    args.context,
    "Dragon Egg",
    dreamsigns.find((dreamsign) => dreamsign.id !== dreamsignA.id) ??
      dreamsignA,
  );
  const dreamsignC = findDreamsign(
    args.context,
    "Eye Amulet",
    dreamsigns.find((dreamsign) =>
      dreamsign.id !== dreamsignA.id && dreamsign.id !== dreamsignB.id
    ) ?? dreamsignA,
  );
  const dreamsignD = findDreamsign(
    args.context,
    "Ginger Root",
    dreamsigns.find((dreamsign) =>
      dreamsign.id !== dreamsignA.id &&
      dreamsign.id !== dreamsignB.id &&
      dreamsign.id !== dreamsignC.id
    ) ?? dreamsignA,
  );
  const delayedBane = (baneName: BaneName, timing: string) =>
    baneBurden(baneName, 1, { timing });
  const routeReward = routePayload({
    operation: "add_site",
    routeScope: "current_dreamscape",
    polarity: "positive",
    siteDeltaValue: 95,
    siteType: "Purge",
    timing: "current dreamscape",
    description: "add a Purge site to the current dreamscape",
  });

  return [
    {
      key: "battle:next:delayed-bane",
      text: `Gain {${cardC.name}}. After next battle, add {Despair}.`,
      triggerSelector: hookTrigger({
        triggerKind: "battle",
        label: "after next battle",
        count: 1,
      }),
      trackedCondition: "Track completion of the next battle.",
      resolution: "When the next battle ends, add {Despair}.",
      expiration: expiration(
        "discard_obligation",
        "If no battle occurs within 2 dreamscapes, discard the Bane obligation.",
      ),
      duration: boundedDuration("dreamscape_count", "within 2 dreamscapes", 2),
      controlledScene: controlledScene("cost", "add Despair"),
      reward: delayedBane("Despair", "after next battle"),
      effects: [namedCardGrant(args.context, cardC)],
      targets: [cardExactTarget(cardC, "catalog")],
      effect: Math.max(
        135,
        cardQualityValue(cardC) +
          valueBaneBurden({ baneName: "Despair", count: 1, delayed: true }),
      ),
      uncertainty: -8,
    },
    {
      key: "battle:next:delayed-nightmare",
      text: `Gain {${cardD.name}}. After next battle, add {Nightmare}.`,
      triggerSelector: hookTrigger({
        triggerKind: "battle",
        label: "after next battle",
        count: 1,
      }),
      trackedCondition: "Track completion of the next battle.",
      resolution: "When the next battle ends, add {Nightmare}.",
      expiration: expiration(
        "discard_obligation",
        "If no battle occurs within 2 dreamscapes, discard the Bane obligation.",
      ),
      duration: boundedDuration("dreamscape_count", "within 2 dreamscapes", 2),
      controlledScene: controlledScene("cost", "add Nightmare"),
      reward: delayedBane("Nightmare", "after next battle"),
      effects: [namedCardGrant(args.context, cardD)],
      targets: [cardExactTarget(cardD, "catalog")],
      effect: Math.max(
        140,
        cardQualityValue(cardD) +
          valueBaneBurden({ baneName: "Nightmare", count: 1, delayed: true }),
      ),
      uncertainty: -8,
    },
    {
      key: "battle:next:delayed-oblivion",
      text: `Gain {${cardE.name}}. After next battle, add {Oblivion}.`,
      triggerSelector: hookTrigger({
        triggerKind: "battle",
        label: "after next battle",
        count: 1,
      }),
      trackedCondition: "Track completion of the next battle.",
      resolution: "When the next battle ends, add {Oblivion}.",
      expiration: expiration(
        "discard_obligation",
        "If no battle occurs within 2 dreamscapes, discard the Bane obligation.",
      ),
      duration: boundedDuration("dreamscape_count", "within 2 dreamscapes", 2),
      controlledScene: controlledScene("cost", "add Oblivion"),
      reward: delayedBane("Oblivion", "after next battle"),
      effects: [namedCardGrant(args.context, cardE)],
      targets: [cardExactTarget(cardE, "catalog")],
      effect: Math.max(
        145,
        cardQualityValue(cardE) +
          valueBaneBurden({ baneName: "Oblivion", count: 1, delayed: true }),
      ),
      uncertainty: -8,
    },
    {
      key: "victory:two:named-dreamsign",
      text: `After 2 victories, gain {${dreamsignA.name}}.`,
      triggerSelector: hookTrigger({
        triggerKind: "victory",
        label: "after 2 victories",
        count: 2,
      }),
      trackedCondition: "Track the next 2 victories.",
      resolution: `After the second victory, gain {${dreamsignA.name}}.`,
      expiration: expiration(
        "forfeit_reward",
        "If 2 victories are not earned within 3 battles, discard this hook with no reward.",
      ),
      duration: boundedDuration("battle_count", "next 3 battles", 3),
      controlledScene: controlledScene("reward", `gain ${dreamsignA.name}`),
      reward: namedDreamsignGrant(args.context, dreamsignA, "after 2 victories"),
      effects: [namedDreamsignGrant(args.context, dreamsignA, "after 2 victories")],
      targets: [dreamsignExactTarget(dreamsignA, "catalog")],
      effect: valueDreamsignOperation("gain", { tideOverlap: false }) * 1.3,
      uncertainty: -12,
    },
    {
      key: "dreamscape:next:named-card",
      text: `At the next dreamscape, gain {${cardD.name}}.`,
      triggerSelector: hookTrigger({
        triggerKind: "dreamscape",
        label: "at the next dreamscape",
        count: 1,
      }),
      trackedCondition: "Track arrival at the next dreamscape.",
      resolution: `At the next dreamscape, gain {${cardD.name}}.`,
      expiration: expiration(
        "forfeit_reward",
        "If the next dreamscape is skipped, discard this hook with no reward.",
      ),
      duration: boundedDuration("dreamscape_count", "next dreamscape", 1),
      controlledScene: controlledScene("reward", `gain ${cardD.name}`),
      reward: namedCardGrant(args.context, cardD, "at the next dreamscape"),
      effects: [namedCardGrant(args.context, cardD, "at the next dreamscape")],
      targets: [cardExactTarget(cardD, "catalog")],
      effect: cardQualityValue(cardD) * 1.25,
      uncertainty: -8,
    },
    {
      key: "each-battle:two:random-purge",
      text: "After each of the next 2 battles, purge 1 random card.",
      triggerSelector: hookTrigger({
        triggerKind: "each_battle",
        label: "after each of the next 2 battles",
        count: 2,
      }),
      trackedCondition: "Track each completed battle in a 2-battle window.",
      resolution: "After each tracked battle, purge 1 random card.",
      expiration: expiration(
        "resolve_partial",
        "If only one battle occurs within 2 dreamscapes, resolve one random purge.",
      ),
      duration: boundedDuration("battle_count", "next 2 battles", 2),
      controlledScene: controlledScene("reward", "purge random cards"),
      reward: {
        kind: "card_purge",
        cardOperationKind: "purge",
        selection: "visible_random",
        source: "deck",
        count: 2,
        timing: "after each of the next 2 battles",
      },
      effect: 125,
      uncertainty: -12,
    },
    {
      key: "site-visit:purge:named-dreamsign",
      text: `After you visit a {Purge} site, gain {${dreamsignB.name}}.`,
      triggerSelector: hookTrigger({
        triggerKind: "site_visit",
        label: "after you visit a Purge site",
        siteType: "Purge",
      }),
      trackedCondition: "Track the next Purge site visit.",
      resolution: `After visiting a Purge site, gain {${dreamsignB.name}}.`,
      expiration: expiration(
        "forfeit_reward",
        "If no Purge site is visited within 2 dreamscapes, discard this hook.",
      ),
      duration: boundedDuration("dreamscape_count", "within 2 dreamscapes", 2),
      controlledScene: controlledScene("reward", `gain ${dreamsignB.name}`),
      reward: namedDreamsignGrant(args.context, dreamsignB, "after Purge site visit"),
      effects: [namedDreamsignGrant(args.context, dreamsignB, "after Purge site visit")],
      targets: [dreamsignExactTarget(dreamsignB, "catalog")],
      effect: valueDreamsignOperation("gain", { tideOverlap: false }) * 1.2,
      uncertainty: -10,
    },
    {
      key: "site-visit:transfiguration:named-dreamsign",
      text: `After you visit a {Transfiguration} site, gain {${dreamsignC.name}}.`,
      triggerSelector: hookTrigger({
        triggerKind: "site_visit",
        label: "after you visit a Transfiguration site",
        siteType: "Transfiguration",
      }),
      trackedCondition: "Track the next Transfiguration site visit.",
      resolution: `After visiting a Transfiguration site, gain {${dreamsignC.name}}.`,
      expiration: expiration(
        "forfeit_reward",
        "If no Transfiguration site is visited within 2 dreamscapes, discard this hook.",
      ),
      duration: boundedDuration("dreamscape_count", "within 2 dreamscapes", 2),
      controlledScene: controlledScene("reward", `gain ${dreamsignC.name}`),
      reward: namedDreamsignGrant(args.context, dreamsignC, "after Transfiguration site visit"),
      effects: [namedDreamsignGrant(args.context, dreamsignC, "after Transfiguration site visit")],
      targets: [dreamsignExactTarget(dreamsignC, "catalog")],
      effect: valueDreamsignOperation("gain", { tideOverlap: false }) * 1.2,
      uncertainty: -10,
    },
    {
      key: "named-card-play:four:essence",
      text: `Once you play {${cardA.name}} 4 times, gain 120 essence.`,
      triggerSelector: hookTrigger({
        triggerKind: "named_card_play",
        label: `once you play ${cardA.name} 4 times`,
        count: 4,
        card: cardA,
      }),
      trackedCondition: `Track playing {${cardA.name}} 4 times.`,
      resolution: `After the fourth {${cardA.name}} play, gain 120 essence.`,
      expiration: expiration(
        "forfeit_reward",
        "If it is not played 4 times within 3 battles, discard this hook.",
      ),
      duration: boundedDuration("battle_count", "next 3 battles", 3),
      controlledScene: controlledScene("reward", "gain 120 essence"),
      reward: gainEssence(120),
      effects: [namedCardGrant(args.context, cardA), gainEssence(120)],
      targets: [cardExactTarget(cardA, "catalog")],
      effect: cardQualityValue(cardA) + 120,
      uncertainty: -14,
    },
    {
      key: "dreamsign-trigger:three:omens",
      text: `Once {${dreamsignD.name}} triggers 3 times, gain 2 omens.`,
      triggerSelector: hookTrigger({
        triggerKind: "dreamsign_trigger",
        label: `once ${dreamsignD.name} triggers 3 times`,
        count: 3,
        dreamsign: dreamsignD,
      }),
      trackedCondition: `Track {${dreamsignD.name}} triggering 3 times.`,
      resolution: `After the third {${dreamsignD.name}} trigger, gain 2 omens.`,
      expiration: expiration(
        "forfeit_reward",
        "If the Dreamsign does not trigger 3 times within 3 battles, discard this hook.",
      ),
      duration: boundedDuration("battle_count", "next 3 battles", 3),
      controlledScene: controlledScene("reward", "gain 2 omens"),
      reward: gainOmen(2),
      effects: [namedDreamsignGrant(args.context, dreamsignD), gainOmen(2)],
      targets: [dreamsignExactTarget(dreamsignD, "catalog")],
      effect: valueDreamsignOperation("gain", { tideOverlap: false }) +
        valueOmenGain(2),
      uncertainty: -14,
    },
    {
      key: "named-card-play:five:duplicate",
      text: `Once you play {${cardB.name}} 5 times, duplicate it.`,
      triggerSelector: hookTrigger({
        triggerKind: "named_card_play",
        label: `once you play ${cardB.name} 5 times`,
        count: 5,
        card: cardB,
      }),
      trackedCondition: `Track playing {${cardB.name}} 5 times.`,
      resolution: `After the fifth {${cardB.name}} play, duplicate it.`,
      expiration: expiration(
        "forfeit_reward",
        "If it is not played 5 times within 3 battles, discard this hook.",
      ),
      duration: boundedDuration("battle_count", "next 3 battles", 3),
      controlledScene: controlledScene("reward", `duplicate ${cardB.name}`),
      reward: namedCardPayload(
        {
          kind: "card_duplicate",
          target: cardB,
          source: "catalog",
          extra: { timing: "after 5 named card plays" },
        },
        args.context,
      ),
      targets: [cardExactTarget(cardB, "catalog")],
      effect: 120,
      uncertainty: -15,
    },
    {
      key: "card-added:one:transform-card",
      text: `When {${cardD.name}} is added, transform it into {${cardE.name}}.`,
      triggerSelector: hookTrigger({
        triggerKind: "card_added",
        label: `when ${cardD.name} is added`,
        count: 1,
        card: cardD,
      }),
      trackedCondition: `Track adding {${cardD.name}} to your deck.`,
      resolution: `When added, transform it into {${cardE.name}}.`,
      expiration: expiration(
        "return_unchanged",
        "If the card is not added before the next Dream Journey, keep it unchanged.",
      ),
      duration: boundedDuration("journey_count", "before the next Dream Journey", 1),
      controlledScene: controlledScene("transformation", `${cardD.name} becomes ${cardE.name}`),
      reward: namedCardPayload(
        {
          kind: "card_transform",
          target: cardD,
          result: cardE,
          source: "catalog",
          extra: { timing: "when named card is added" },
        },
        args.context,
      ),
      targets: [cardExactTarget(cardD, "catalog"), cardExactTarget(cardE, "catalog")],
      effect: 130,
      uncertainty: -12,
    },
    {
      key: "essence-payment:forty:transform-dreamsign",
      text: `When you next pay at least 40 essence, transform {${dreamsignB.name}} into {${dreamsignC.name}}.`,
      triggerSelector: hookTrigger({
        triggerKind: "essence_payment",
        label: "when you next pay at least 40 essence",
        amount: 40,
      }),
      trackedCondition: "Track the next payment of at least 40 essence.",
      resolution: `After paying, transform {${dreamsignB.name}} into {${dreamsignC.name}}.`,
      expiration: expiration(
        "forfeit_reward",
        "If no qualifying payment happens within 2 dreamscapes, discard the transformation.",
      ),
      duration: boundedDuration("dreamscape_count", "within 2 dreamscapes", 2),
      controlledScene: controlledScene(
        "transformation",
        `${dreamsignB.name} becomes ${dreamsignC.name}`,
      ),
      visibilityPolicy: hookVisibility(
        "hidden_until_resolution",
        "The named transformation is precommitted in JSON/debug and summarized before choosing.",
      ),
      reward: namedDreamsignPayload(
        {
          kind: "dreamsign_transform",
          dreamsign: dreamsignB,
          source: "catalog",
          result: dreamsignC,
          resultSource: "catalog",
          extra: { timing: "after essence payment" },
        },
        args.context,
      ),
      targets: [dreamsignExactTarget(dreamsignB, "catalog"), dreamsignExactTarget(dreamsignC, "catalog")],
      effect: 135,
      uncertainty: -15,
    },
    {
      key: "future-shop:bane-to-card",
      text: `At the next future Shop, transform {${BANE_NAMES[0]}} into {${cardE.name}}.`,
      triggerSelector: hookTrigger({
        triggerKind: "future_shop",
        label: "at the next future shop",
        count: 1,
      }),
      trackedCondition: "Track the next future Shop site.",
      resolution: `At the next future Shop, transform {${BANE_NAMES[0]}} into {${cardE.name}}.`,
      expiration: expiration(
        "discard_obligation",
        "If no future Shop appears within 2 dreamscapes, discard this hook.",
      ),
      duration: boundedDuration("shop_count", "next future shop", 1),
      controlledScene: controlledScene("transformation", `${BANE_NAMES[0]} becomes ${cardE.name}`),
      reward: {
        kind: "bane_transform_to_card",
        baneName: BANE_NAMES[0],
        count: 1,
        baneTargetContext: "manifest_obligation",
        selection: "exact",
        timing: "at the next future shop",
        cardId: cardE.id,
        cardName: cardE.name,
        source: "catalog",
        delayed: true,
      },
      targets: [
        baneTarget(`${BANE_NAMES[0]} obligation`, [BANE_NAMES[0]], "manifest_obligation"),
        cardExactTarget(cardE, "catalog"),
      ],
      effect: 130,
      uncertainty: -13,
    },
    {
      key: "future-dream-journey:add-route",
      text: "At the next Dream Journey site, add a {Purge} site to the current dreamscape.",
      triggerSelector: hookTrigger({
        triggerKind: "future_dream_journey",
        label: "at the next Dream Journey site",
        count: 1,
      }),
      trackedCondition: "Track the next Dream Journey site you enter.",
      resolution: "At the next Dream Journey site, add a {Purge} site to the current dreamscape.",
      expiration: expiration(
        "discard_obligation",
        "If no Dream Journey site appears within 2 dreamscapes, discard this hook.",
      ),
      duration: boundedDuration("journey_count", "next Dream Journey site", 1),
      controlledScene: controlledScene("reward", "add a Purge route site"),
      reward: routeReward,
      effect: 95,
      uncertainty: -12,
    },
    {
      key: "future-shop:discount",
      text: "At the next future Shop, trade this hook for an 80 essence discount.",
      triggerSelector: hookTrigger({
        triggerKind: "future_shop",
        label: "at the next future shop",
        count: 1,
      }),
      trackedCondition: "Track the next future Shop site.",
      resolution: "At that shop, trade this hook for an 80 essence discount.",
      expiration: expiration(
        "discard_obligation",
        "If no future Shop appears within 2 dreamscapes, discard this hook.",
      ),
      duration: boundedDuration("shop_count", "next future shop", 1),
      controlledScene: controlledScene("trade", "80 essence Shop discount"),
      reward: shopPayload({
        kind: "future_shop_trade_hook",
        scope: "future_shops",
        duration: "next future shop",
        amount: 80,
        count: 1,
        siteType: "Shop",
        hook: "spend this hook for an 80 essence discount",
      }),
      effect: 80,
      uncertainty: -14,
    },
    {
      key: "future-dream-journey:extra-option",
      text: "At the next Dream Journey site, start with 1 extra option.",
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
      controlledScene: controlledScene("reward", "next Dream Journey has 1 extra option"),
      reward: statusPayload({
        kind: "status_reward_replacement",
        statusName: "Widened Journey",
        statusScope: "quest",
        duration: "one_time",
        ruleMutationKind: "reward_replacement",
        replacement: "one extra Dream Journey option",
      }),
      effect: 90,
      uncertainty: -12,
    },
  ];
}

export function expandedDelayedHookFills(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage?: "early" | "mid" | "late";
}): ExpandedDelayedHookFill[] {
  return shuffleDeterministic(
    args.drawContext,
    `${args.label}:expanded-hook-fills`,
    expandedDelayedHookCandidates(args),
  );
}

export function delayedHookFillFromExpanded(args: {
  shapeId: string;
  optionNumber: number;
  fill: ExpandedDelayedHookFill;
  optionText?: string;
  costs?: unknown[];
  burdens?: unknown[];
  cost?: number;
  burden?: number;
  effect?: number;
  uncertainty?: number;
}): { option: JourneyOption; precommit: Record<string, unknown> } {
  const precommit = {
    ...delayedHookContract({
      hookId: normalizedHookId(
        `${args.shapeId}-${args.optionNumber}-${args.fill.key}`,
      ),
      optionNumber: args.optionNumber,
      triggerSelector: args.fill.triggerSelector,
      trackedCondition: args.fill.trackedCondition,
      resolution: args.fill.resolution,
      expiration: args.fill.expiration,
      duration: args.fill.duration,
      controlledScene: args.fill.controlledScene,
      visibilityPolicy: args.fill.visibilityPolicy,
      reward: args.fill.reward,
      hookBudgetCost: args.fill.hookBudgetCost ?? 1,
    }),
    sourceShapeId: args.shapeId,
    timingKey: args.fill.key,
    rewardMetadata: {
      rewardKey: args.fill.key,
      expectedConvertedEssence: args.effect ?? args.fill.effect,
    },
  };

  return {
    option: option({
      number: args.optionNumber,
      text: args.optionText ?? args.fill.text,
      costs: args.costs ?? [],
      burdens: [...(args.burdens ?? []), ...(args.fill.burdens ?? [])],
      triggers: [precommit],
      effects: args.fill.effects ?? [],
      targets: args.fill.targets ?? [],
      cost: args.cost,
      burden: args.burden ?? args.fill.burden,
      effect: args.effect ?? args.fill.effect,
      uncertainty: args.uncertainty ?? args.fill.uncertainty,
    }),
    precommit,
  };
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

function pairedReturnFamilies(
  drawContext: DrawContext,
  label: string,
): PairedReturnFamilyId[] {
  return shuffleDeterministic(drawContext, label, [
    "sealed_card",
    "borrowed_dreamsign",
    "future_trade",
  ] as const);
}

export function pairedReturnHookFill(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  shapeId: string;
  optionNumber: number;
  reward: RewardSlot;
}): { option: JourneyOption; precommit: Record<string, unknown> } {
  const cards = catalogRewardCards(args.context, args.drawContext);
  const cardA = cards[(args.optionNumber - 1) % Math.max(cards.length, 1)] ??
    args.context.content.cards[0]!;
  const cardB = cards[args.optionNumber % Math.max(cards.length, 1)] ?? cardA;
  const dreamsigns = selectedDreamsignTargets(args.context, args.drawContext);
  const dreamsignA =
    dreamsigns[(args.optionNumber - 1) % Math.max(dreamsigns.length, 1)] ??
    args.context.content.dreamsigns[0]!;
  const dreamsignB =
    dreamsigns[args.optionNumber % Math.max(dreamsigns.length, 1)] ??
    args.context.content.dreamsigns.find((entry) => entry.id !== dreamsignA.id) ??
    dreamsignA;
  const family = pairedReturnFamilies(
    args.drawContext,
    `${args.shapeId}:return-family-order`,
  )[(args.optionNumber - 1) % 3]!;
  const rewardLabel = optionRewardLabel(args.reward);
  const pairedReturnId = normalizedHookId(
    `${args.shapeId}-${args.optionNumber}-${family}-${args.reward.key}`,
  );
  const optionEffect = Math.round(args.reward.effect * 1.15);

  if (family === "sealed_card") {
    const createdId = `${pairedReturnId}-sealed-card`;
    const precommit = {
      ...pairedReturnContract({
        pairedReturnId,
        optionNumber: args.optionNumber,
        anchor: `${cardA.name} sealed bundle`,
        created: {
          referenceKind: "sealed_object",
          referenceId: createdId,
          label: `Seal {${cardA.name}} until the next Dream Journey site.`,
          objectKind: "card",
          cardId: cardA.id,
          cardName: cardA.name,
          statusScope: "quest",
        },
        returnScene: {
          returnSceneKind: "sealed_object_return",
          triggerSelector: hookTrigger({
            triggerKind: "future_dream_journey",
            label: "at the next Dream Journey site",
            count: 1,
          }),
          referencesCreatedId: createdId,
          resolution: `Return {${cardA.name}} as {${cardB.name}} and ${rewardLabel}.`,
          expiration: expiration(
            "return_unchanged",
            "If no Dream Journey site appears within 2 dreamscapes, return the sealed card unchanged.",
          ),
          duration: boundedDuration(
            "dreamscape_count",
            "within 2 dreamscapes",
            2,
          ),
        },
        reward: [
          namedCardPayload(
            {
              kind: "card_transform",
              target: cardA,
              result: cardB,
              source: "catalog",
              extra: { timing: "at the next Dream Journey site" },
            },
            args.context,
          ),
          ...args.reward.effects,
        ],
      }),
      sourceShapeId: args.shapeId,
      returnFamilyId: family,
      rewardMetadata: {
        rewardKey: args.reward.key,
        baseConvertedEssence: args.reward.effect,
        expectedConvertedEssence: optionEffect,
      },
    };

    return {
      option: option({
        number: args.optionNumber,
        text: `Seal {${cardA.name}} until the next Dream Journey site. Return it as {${cardB.name}} and ${rewardLabel}, or return it unchanged if the 2-dreamscape window expires.`,
        triggers: [precommit],
        effects: args.reward.effects,
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
          ...(args.reward.targets ?? []),
        ],
        effect: optionEffect,
        uncertainty: -10,
      }),
      precommit,
    };
  }

  if (family === "borrowed_dreamsign") {
    const createdId = `${pairedReturnId}-borrowed-dreamsign`;
    const futureOmenCost = 1;
    const expectedValue = optionEffect + valueOmenLoss(futureOmenCost);
    const precommit = {
      ...pairedReturnContract({
        pairedReturnId,
        optionNumber: args.optionNumber,
        anchor: `${dreamsignA.name} borrowed sign`,
        created: {
          referenceKind: "borrowed_object",
          referenceId: createdId,
          label: `Borrow {${dreamsignA.name}} for the next 2 battles.`,
          objectKind: "dreamsign",
          dreamsignId: dreamsignA.id,
          dreamsignName: dreamsignA.name,
          cost: { resource: "omens", amount: futureOmenCost },
        },
        returnScene: {
          returnSceneKind: "borrowed_object_return",
          triggerSelector: hookTrigger({
            triggerKind: "each_battle",
            label: "after 2 battles",
            count: 2,
          }),
          referencesCreatedId: createdId,
          resolution: `Return {${dreamsignA.name}} and pay ${futureOmenCost} omen; if paid, ${rewardLabel}.`,
          expiration: expiration(
            "pay_cost",
            "If the borrowed sign is not returned after 2 battles, pay the committed omen cost.",
          ),
          duration: boundedDuration("battle_count", "next 2 battles", 2),
        },
        reward: [
          namedDreamsignPayload(
            {
              kind: "dreamsign_temporary_grant",
              dreamsign: dreamsignA,
              source: "pool",
              extra: { temporary: true, duration: "next 2 battles" },
            },
            args.context,
          ),
          ...args.reward.effects,
        ],
      }),
      sourceShapeId: args.shapeId,
      returnFamilyId: family,
      rewardMetadata: {
        rewardKey: args.reward.key,
        baseConvertedEssence: args.reward.effect,
        expectedConvertedEssence: expectedValue,
      },
    };

    return {
      option: option({
        number: args.optionNumber,
        text: `Borrow {${dreamsignA.name}} for 2 battles. Return it after 2 battles and pay ${futureOmenCost} omen; if paid, ${rewardLabel}.`,
        triggers: [precommit],
        effects: args.reward.effects,
        targets: [
          dreamsignExactTarget(dreamsignA, "pool"),
          ...(args.reward.targets ?? []),
        ],
        effect: expectedValue,
        uncertainty: -15,
      }),
      precommit,
    };
  }

  const createdId = `${pairedReturnId}-future-trade`;
  const expectedValue = optionEffect + valueOmenLoss(1);
  const precommit = {
    ...pairedReturnContract({
      pairedReturnId,
      optionNumber: args.optionNumber,
      anchor: `${dreamsignA.name} for ${dreamsignB.name} trade promise`,
      created: {
        referenceKind: "trade_promise",
        referenceId: createdId,
        label: `Promise to trade {${dreamsignA.name}} for {${dreamsignB.name}} at the next Shop.`,
        objectKind: "promise",
        dreamsignId: dreamsignA.id,
        dreamsignName: dreamsignA.name,
        cost: { resource: "omens", amount: 1 },
      },
      returnScene: {
        returnSceneKind: "future_trade",
        triggerSelector: hookTrigger({
          triggerKind: "future_shop",
          label: "at the next future shop",
          count: 1,
        }),
        referencesCreatedId: createdId,
        resolution: `Trade {${dreamsignA.name}} and 1 omen for {${dreamsignB.name}}, then ${rewardLabel}.`,
        expiration: expiration(
          "discard_obligation",
          "If no future shop appears within 2 dreamscapes, discard the trade promise.",
        ),
        duration: boundedDuration("dreamscape_count", "within 2 dreamscapes", 2),
      },
      reward: [
        namedDreamsignPayload(
          {
            kind: "dreamsign_trade_hook",
            dreamsign: dreamsignA,
            source: "pool",
            result: dreamsignB,
            resultSource: "pool",
            extra: {
              timing: "at the next future shop",
              obligation: `Trade ${dreamsignA.name} and 1 omen for ${dreamsignB.name}`,
              giveDreamsignId: dreamsignA.id,
              giveDreamsignName: dreamsignA.name,
              receiveDreamsignId: dreamsignB.id,
              receiveDreamsignName: dreamsignB.name,
            },
          },
          args.context,
        ),
        ...args.reward.effects,
      ],
    }),
    sourceShapeId: args.shapeId,
    returnFamilyId: family,
    rewardMetadata: {
      rewardKey: args.reward.key,
      baseConvertedEssence: args.reward.effect,
      expectedConvertedEssence: expectedValue,
    },
  };

  return {
    option: option({
      number: args.optionNumber,
      text: `Promise a future shop trade: give {${dreamsignA.name}} and 1 omen for {${dreamsignB.name}}, then ${rewardLabel}. Discard the promise if no future shop appears within 2 dreamscapes.`,
      triggers: [precommit],
      effects: args.reward.effects,
      targets: [
        dreamsignExactTarget(dreamsignA, "pool"),
        dreamsignExactTarget(dreamsignB, "pool"),
        ...(args.reward.targets ?? []),
      ],
      effect: expectedValue,
      uncertainty: -15,
    }),
    precommit,
  };
}
