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
  valueBanePurge,
  valueCardDraft,
  valueDreamsignOperation,
  valueOmenGain,
  valueOmenLoss,
} from "../value.js";
import { baneGainPayload, banePurgePayload } from "./banePayloads.js";
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
  | "sealed_dreamsign"
  | "borrowed_dreamsign"
  | "borrowed_card_draft"
  | "future_named_object_trade"
  | "return_for_resource"
  | "return_for_card_operation"
  | "return_for_route_edit";

type HookStage = "early" | "mid" | "late";

type NamedCardPlayEssenceHookProfile = {
  triggerCount: number;
  battleWindow: number;
  essenceAmount: number;
};

type DreamsignTriggerOmenHookProfile = {
  triggerCount: number;
  battleWindow: number;
  omenAmount: number;
};

type DelayedBaneTimingProfile = {
  key: string;
  triggerKind: "battle" | "victory" | "dreamscape";
  triggerLabel: string;
  triggerCount: number;
  textPrefix: string;
  trackedCondition: string;
  resolutionPrefix: string;
  expirationLabel: string;
  durationKind: "battle_count" | "dreamscape_count";
  durationLabel: string;
  durationCount: number;
  timingLabel: string;
  uncertainty: number;
};

const NAMED_CARD_PLAY_ESSENCE_HOOK_BANDS = {
  early: [
    { triggerCount: 3, battleWindow: 2, essenceAmount: 90 },
    { triggerCount: 4, battleWindow: 3, essenceAmount: 110 },
  ],
  mid: [
    { triggerCount: 3, battleWindow: 3, essenceAmount: 100 },
    { triggerCount: 4, battleWindow: 3, essenceAmount: 120 },
    { triggerCount: 5, battleWindow: 3, essenceAmount: 150 },
  ],
  late: [
    { triggerCount: 4, battleWindow: 3, essenceAmount: 130 },
    { triggerCount: 5, battleWindow: 3, essenceAmount: 160 },
    { triggerCount: 6, battleWindow: 3, essenceAmount: 190 },
  ],
} as const satisfies Record<HookStage, readonly NamedCardPlayEssenceHookProfile[]>;

const DREAMSIGN_TRIGGER_OMEN_HOOK_BANDS = {
  early: [
    { triggerCount: 2, battleWindow: 2, omenAmount: 1 },
    { triggerCount: 3, battleWindow: 3, omenAmount: 2 },
  ],
  mid: [
    { triggerCount: 2, battleWindow: 2, omenAmount: 1 },
    { triggerCount: 3, battleWindow: 3, omenAmount: 2 },
    { triggerCount: 4, battleWindow: 4, omenAmount: 3 },
  ],
  late: [
    { triggerCount: 3, battleWindow: 3, omenAmount: 2 },
    { triggerCount: 4, battleWindow: 3, omenAmount: 3 },
    { triggerCount: 5, battleWindow: 3, omenAmount: 4 },
  ],
} as const satisfies Record<HookStage, readonly DreamsignTriggerOmenHookProfile[]>;

const DELAYED_BANE_HOOK_MIN_EFFECT = 135;

const DELAYED_BANE_TIMING_PROFILES = Object.freeze([
  {
    key: "next-battle",
    triggerKind: "battle",
    triggerLabel: "after next battle",
    triggerCount: 1,
    textPrefix: "After next battle",
    trackedCondition: "Track completion of the next battle.",
    resolutionPrefix: "When the next battle ends",
    expirationLabel:
      "If no battle occurs within 2 dreamscapes, discard the Bane obligation.",
    durationKind: "dreamscape_count",
    durationLabel: "within 2 dreamscapes",
    durationCount: 2,
    timingLabel: "after next battle",
    uncertainty: -8,
  },
  {
    key: "next-victory",
    triggerKind: "victory",
    triggerLabel: "after your next victory",
    triggerCount: 1,
    textPrefix: "After your next victory",
    trackedCondition: "Track your next victory.",
    resolutionPrefix: "When your next victory is earned",
    expirationLabel:
      "If no victory occurs within 3 battles, discard the Bane obligation.",
    durationKind: "battle_count",
    durationLabel: "next 3 battles",
    durationCount: 3,
    timingLabel: "after your next victory",
    uncertainty: -10,
  },
  {
    key: "next-dreamscape",
    triggerKind: "dreamscape",
    triggerLabel: "at the next dreamscape",
    triggerCount: 1,
    textPrefix: "At the next dreamscape",
    trackedCondition: "Track arrival at the next dreamscape.",
    resolutionPrefix: "When the next dreamscape begins",
    expirationLabel:
      "If the next dreamscape is skipped, discard the Bane obligation.",
    durationKind: "dreamscape_count",
    durationLabel: "next dreamscape",
    durationCount: 1,
    timingLabel: "at the next dreamscape",
    uncertainty: -8,
  },
] as const satisfies readonly DelayedBaneTimingProfile[]);

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

function ordinalWord(value: number): string {
  return value === 1
    ? "first"
    : value === 2
      ? "second"
      : value === 3
        ? "third"
        : value === 4
          ? "fourth"
          : value === 5
            ? "fifth"
            : `${value}th`;
}

function namedCardPlayEssenceHook(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage: HookStage;
  card: CardContent;
}): ExpandedDelayedHookFill {
  const profiles: readonly NamedCardPlayEssenceHookProfile[] =
    NAMED_CARD_PLAY_ESSENCE_HOOK_BANDS[args.stage];
  const profile = shuffleDeterministic(
    args.drawContext,
    `${args.label}:named-card-play-essence-profile`,
    profiles,
  )[0]!;
  const battleText = profile.battleWindow === 1
    ? "next battle"
    : `next ${profile.battleWindow} battles`;

  return {
    key: `named-card-play:${profile.triggerCount}:essence-${profile.essenceAmount}`,
    text: `Once you play {${args.card.name}} ${profile.triggerCount} times, gain ${profile.essenceAmount} essence.`,
    triggerSelector: hookTrigger({
      triggerKind: "named_card_play",
      label: `once you play ${args.card.name} ${profile.triggerCount} times`,
      count: profile.triggerCount,
      card: args.card,
    }),
    trackedCondition: `Track playing {${args.card.name}} ${profile.triggerCount} times.`,
    resolution: `After the ${ordinalWord(profile.triggerCount)} {${args.card.name}} play, gain ${profile.essenceAmount} essence.`,
    expiration: expiration(
      "forfeit_reward",
      `If it is not played ${profile.triggerCount} times within ${profile.battleWindow} battles, discard this hook.`,
    ),
    duration: boundedDuration("battle_count", battleText, profile.battleWindow),
    controlledScene: controlledScene(
      "reward",
      `gain ${profile.essenceAmount} essence`,
    ),
    reward: gainEssence(profile.essenceAmount),
    effects: [
      namedCardGrant(args.context, args.card),
      gainEssence(profile.essenceAmount),
    ],
    targets: [cardExactTarget(args.card, "catalog")],
    effect: cardQualityValue(args.card) + profile.essenceAmount,
    uncertainty: -14,
  };
}

function dreamsignTriggerOmenHook(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage: HookStage;
  dreamsign: DreamsignContent;
}): ExpandedDelayedHookFill {
  const profiles: readonly DreamsignTriggerOmenHookProfile[] =
    DREAMSIGN_TRIGGER_OMEN_HOOK_BANDS[args.stage];
  const profile = shuffleDeterministic(
    args.drawContext,
    `${args.label}:dreamsign-trigger-omen-profile`,
    profiles,
  )[0]!;
  const battleText = profile.battleWindow === 1
    ? "next battle"
    : `next ${profile.battleWindow} battles`;

  return {
    key: `dreamsign-trigger:${profile.triggerCount}:omens-${profile.omenAmount}`,
    text: `Once {${args.dreamsign.name}} triggers ${profile.triggerCount} times, gain ${profile.omenAmount} ${profile.omenAmount === 1 ? "omen" : "omens"}.`,
    triggerSelector: hookTrigger({
      triggerKind: "dreamsign_trigger",
      label: `once ${args.dreamsign.name} triggers ${profile.triggerCount} times`,
      count: profile.triggerCount,
      dreamsign: args.dreamsign,
    }),
    trackedCondition: `Track {${args.dreamsign.name}} triggering ${profile.triggerCount} times.`,
    resolution: `After the ${ordinalWord(profile.triggerCount)} {${args.dreamsign.name}} trigger, gain ${profile.omenAmount} ${profile.omenAmount === 1 ? "omen" : "omens"}.`,
    expiration: expiration(
      "forfeit_reward",
      `If the Dreamsign does not trigger ${profile.triggerCount} times within ${profile.battleWindow} battles, discard this hook.`,
    ),
    duration: boundedDuration("battle_count", battleText, profile.battleWindow),
    controlledScene: controlledScene(
      "reward",
      `gain ${profile.omenAmount} ${profile.omenAmount === 1 ? "omen" : "omens"}`,
    ),
    reward: gainOmen(profile.omenAmount),
    effects: [
      namedDreamsignGrant(args.context, args.dreamsign),
      gainOmen(profile.omenAmount),
    ],
    targets: [dreamsignExactTarget(args.dreamsign, "catalog")],
    effect: valueDreamsignOperation("gain", { tideOverlap: false }) +
      valueOmenGain(profile.omenAmount),
    uncertainty: -14,
  };
}

function delayedBaneHook(args: {
  context: JourneyContext;
  card: CardContent;
  baneName: BaneName;
  timing: DelayedBaneTimingProfile;
}): ExpandedDelayedHookFill {
  const burden = baneBurden(args.baneName, 1, {
    timing: args.timing.timingLabel,
  });

  return {
    key: `${args.timing.key}:delayed-bane:${normalizedHookId(args.baneName)}`,
    text: `Gain {${args.card.name}}. ${args.timing.textPrefix}, add {${args.baneName}}.`,
    triggerSelector: hookTrigger({
      triggerKind: args.timing.triggerKind,
      label: args.timing.triggerLabel,
      count: args.timing.triggerCount,
    }),
    trackedCondition: args.timing.trackedCondition,
    resolution: `${args.timing.resolutionPrefix}, add {${args.baneName}}.`,
    expiration: expiration("discard_obligation", args.timing.expirationLabel),
    duration: boundedDuration(
      args.timing.durationKind,
      args.timing.durationLabel,
      args.timing.durationCount,
    ),
    controlledScene: controlledScene("cost", `add ${args.baneName}`),
    reward: burden,
    effects: [namedCardGrant(args.context, args.card)],
    targets: [cardExactTarget(args.card, "catalog")],
    effect: Math.max(
      DELAYED_BANE_HOOK_MIN_EFFECT,
      cardQualityValue(args.card) +
        valueBaneBurden({
          baneName: args.baneName,
          count: 1,
          delayed: true,
        }),
    ),
    uncertainty: args.timing.uncertainty,
  };
}

function expandedDelayedHookCandidates(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage?: HookStage;
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
  const delayedBaneCards = [cardC, cardD, cardE];
  const delayedBaneNames = shuffleDeterministic(
    args.drawContext,
    `${args.label}:delayed-bane-names`,
    BANE_NAMES,
  );
  const delayedBaneTiming = shuffleDeterministic(
    args.drawContext,
    `${args.label}:delayed-bane-timings`,
    DELAYED_BANE_TIMING_PROFILES,
  )[0]!;
  const delayedBaneHooks = delayedBaneCards.map((card, index) =>
    delayedBaneHook({
      context: args.context,
      card,
      baneName: delayedBaneNames[index % delayedBaneNames.length]!,
      timing: delayedBaneTiming,
    })
  );
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
    ...delayedBaneHooks,
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
    namedCardPlayEssenceHook({
      context: args.context,
      drawContext: args.drawContext,
      label: args.label,
      stage: args.stage ?? "mid",
      card: cardA,
    }),
    dreamsignTriggerOmenHook({
      context: args.context,
      drawContext: args.drawContext,
      label: args.label,
      stage: args.stage ?? "mid",
      dreamsign: dreamsignD,
    }),
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
  futureCost?: unknown | unknown[];
  returnReward?: unknown | unknown[];
  visibilityPolicy?: Record<string, unknown>;
  reward: unknown | unknown[];
}): Record<string, unknown> {
  const futureCost = args.futureCost ?? [];
  const returnReward = args.returnReward ?? args.reward;
  const returnScene: Record<string, unknown> = {
    ...args.returnScene,
    referencesAnchor: args.anchor,
    futureCost,
    returnReward,
  };

  return {
    kind: "paired_return_contract",
    pairedReturnId: args.pairedReturnId,
    hookId: args.pairedReturnId,
    optionNumber: args.optionNumber,
    anchor: args.anchor,
    created: args.created,
    returnScene,
    futureCost,
    returnReward,
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
    reward: returnReward,
    hookBudgetCost: 1,
  };
}

function pairedReturnFamilies(
  drawContext: DrawContext,
  label: string,
): PairedReturnFamilyId[] {
  const rowPlans: readonly (readonly PairedReturnFamilyId[])[] = [
    ["sealed_dreamsign", "return_for_resource", "return_for_card_operation"],
    ["borrowed_dreamsign", "borrowed_dreamsign", "borrowed_card_draft"],
    ["future_named_object_trade", "future_named_object_trade", "return_for_route_edit"],
    ["sealed_card", "sealed_dreamsign", "future_named_object_trade"],
    ["return_for_resource", "return_for_card_operation", "return_for_route_edit"],
  ];

  return [
    ...shuffleDeterministic(drawContext, `${label}:row-plans`, rowPlans)[0]!,
  ];
}

type PairedReturnReward = {
  key: string;
  text: string;
  payloads: unknown[];
  targets?: unknown[];
  effect: number;
  uncertainty?: number;
};

function generatedObjectReturnReward(label: string): Record<string, unknown> {
  const id = normalizedHookId(`generated-return-${label}`);

  return {
    kind: "generated_object_grant",
    generatedObjectOperationKind: "grant",
    generatedObjectId: id,
    generatedObjectKind: "dreamsign",
    generatedObjectName: "Lantern Echo",
    generatedObjectReferenceKind: "placeholder",
    rulesText: "The next time a returned object resolves, gain 1 omen.",
    timing: "return scene",
    source: "manifest_generated",
  };
}

function pairedReturnReward(
  context: JourneyContext,
  drawContext: DrawContext,
  label: string,
  rewardKind: "resource" | "card_purge" | "card_duplicate" | "dreamsign" | "route" | "bane" | "generated_object",
): PairedReturnReward {
  const dreamsigns = selectedDreamsignTargets(context, drawContext);
  const dreamsign = dreamsigns[0] ?? context.content.dreamsigns[0]!;

  if (rewardKind === "resource") {
    return {
      key: "return-resource:essence",
      text: "gain 120 essence",
      payloads: [gainEssence(120)],
      effect: 120,
    };
  }

  if (rewardKind === "card_purge") {
    const payload = {
      kind: "card_purge",
      cardOperationKind: "purge",
      selection: "chosen_after_commitment",
      source: "deck",
      count: 1,
      timing: "return scene",
    };

    return {
      key: "return-card-operation:purge",
      text: "purge a chosen card",
      payloads: [payload],
      targets: [target("card", "a chosen card in deck", { source: "deck" })],
      effect: 90,
    };
  }

  if (rewardKind === "card_duplicate") {
    const payload = {
      kind: "card_duplicate",
      cardOperationKind: "duplicate",
      selection: "chosen_after_commitment",
      source: "deck",
      count: 1,
      copyCount: 1,
      timing: "return scene",
    };

    return {
      key: "return-card-operation:duplicate",
      text: "duplicate a chosen card",
      payloads: [payload],
      targets: [target("card", "a chosen card in deck", { source: "deck" })],
      effect: 115,
    };
  }

  if (rewardKind === "dreamsign") {
    return {
      key: `return-dreamsign:${dreamsign.id}`,
      text: `gain {${dreamsign.name}}`,
      payloads: [
        namedDreamsignPayload(
          {
            kind: "dreamsign_gain",
            dreamsign,
            source: "pool",
            extra: { timing: "return scene" },
          },
          context,
        ),
      ],
      targets: [dreamsignExactTarget(dreamsign, "pool")],
      effect: valueDreamsignOperation("gain", { tideOverlap: false }),
    };
  }

  if (rewardKind === "route") {
    return {
      key: "return-route:add-dreamsign-draft",
      text: "add a {Dreamsign Draft} site",
      payloads: [
        routePayload({
          operation: "add_site",
          routeScope: "current_dreamscape",
          polarity: "positive",
          siteDeltaValue: 145,
          siteType: "Dreamsign Draft",
          timing: "return scene",
          description: "add a Dreamsign Draft site to the current dreamscape",
        }),
      ],
      effect: 145,
    };
  }

  if (rewardKind === "bane") {
    return {
      key: "return-bane:purge-nightmare",
      text: "purge a chosen {Nightmare} obligation",
      payloads: [
        banePurgePayload({
          baneName: "Nightmare",
          targetContext: "manifest_obligation",
          selection: "chosen_after_commitment",
        }),
      ],
      targets: [baneTarget("manifest-local Nightmare obligation", ["Nightmare"], "manifest_obligation")],
      effect: valueBanePurge({
        baneName: "Nightmare",
        targetContext: "manifest_obligation",
        selection: "chosen_after_commitment",
      }),
    };
  }

  return {
    key: "return-generated-object:dreamsign",
    text: "gain a generated Dreamsign",
    payloads: [generatedObjectReturnReward(label)],
    effect: 135,
    uncertainty: -8,
  };
}

function returnRewardKindFor(
  family: PairedReturnFamilyId,
  optionNumber: number,
): Parameters<typeof pairedReturnReward>[3] {
  if (family === "return_for_resource") {
    return "resource";
  }

  if (family === "return_for_card_operation") {
    return optionNumber % 2 === 0 ? "card_purge" : "card_duplicate";
  }

  if (family === "return_for_route_edit") {
    return "route";
  }

  if (family === "future_named_object_trade") {
    return optionNumber % 3 === 1
      ? "resource"
      : optionNumber % 3 === 2
        ? "card_duplicate"
        : "route";
  }

  if (family === "borrowed_dreamsign") {
    return optionNumber % 2 === 0 ? "generated_object" : "resource";
  }

  if (family === "borrowed_card_draft") {
    return "bane";
  }

  if (family === "sealed_card") {
    return "dreamsign";
  }

  return optionNumber % 3 === 1
    ? "resource"
    : optionNumber % 3 === 2
      ? "card_purge"
      : "card_duplicate";
}

export function pairedReturnHookFill(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  shapeId: string;
  optionNumber: number;
  reward: RewardSlot;
  familyId?: PairedReturnFamilyId;
}): { option: JourneyOption; precommit: Record<string, unknown> } {
  const cards = catalogRewardCards(args.context, args.drawContext);
  const visibleCards = cards.filter((card) => !/\btides?\b/iu.test(card.name));
  const fallbackVisibleCard =
    args.context.content.cards.find((card) => !/\btides?\b/iu.test(card.name)) ??
    args.context.content.cards[0]!;
  const cardA =
    visibleCards[(args.optionNumber - 1) % Math.max(visibleCards.length, 1)] ??
    fallbackVisibleCard;
  const cardB = visibleCards[args.optionNumber % Math.max(visibleCards.length, 1)] ??
    visibleCards.find((card) => card.id !== cardA.id) ??
    cardA;
  const dreamsigns = selectedDreamsignTargets(args.context, args.drawContext);
  const fallbackDreamsign =
    dreamsigns[(args.optionNumber - 1) % Math.max(dreamsigns.length, 1)] ??
    args.context.content.dreamsigns[0]!;
  const secondFallbackDreamsign =
    dreamsigns[args.optionNumber % Math.max(dreamsigns.length, 1)] ??
    args.context.content.dreamsigns.find((entry) => entry.id !== fallbackDreamsign.id) ??
    fallbackDreamsign;
  const returningNames = ["Ginger Root", "Cloud Lens", "Leather Satchel"];
  const borrowedNames = ["Green Amulet", "Wolf Sigil", "Green Amulet"];
  const tradeNames = ["Gold Key", "Parchment", "Opal"];
  const sealedDreamsign = findDreamsign(
    args.context,
    returningNames[(args.optionNumber - 1) % returningNames.length]!,
    fallbackDreamsign,
  );
  const borrowedDreamsign = findDreamsign(
    args.context,
    borrowedNames[(args.optionNumber - 1) % borrowedNames.length]!,
    fallbackDreamsign,
  );
  const tradeDreamsign = findDreamsign(
    args.context,
    tradeNames[(args.optionNumber - 1) % tradeNames.length]!,
    fallbackDreamsign,
  );
  const receiveDreamsign = secondFallbackDreamsign.id === tradeDreamsign.id
    ? fallbackDreamsign
    : secondFallbackDreamsign;
  const family = args.familyId ??
    pairedReturnFamilies(
      args.drawContext,
      `${args.shapeId}:return-family-order`,
    )[(args.optionNumber - 1) % 3]!;
  const reward = pairedReturnReward(
    args.context,
    args.drawContext,
    `${args.shapeId}:${args.optionNumber}:${family}`,
    returnRewardKindFor(family, args.optionNumber),
  );
  const rewardPayload = reward.payloads.length === 1
    ? reward.payloads[0]!
    : reward.payloads;
  const pairedReturnId = normalizedHookId(
    `${args.shapeId}-${args.optionNumber}-${family}-${reward.key}`,
  );
  const expectedValue = Math.max(120, reward.effect);

  if (
    family === "sealed_dreamsign" ||
    family === "return_for_resource" ||
    family === "return_for_card_operation"
  ) {
    const createdId = `${pairedReturnId}-sealed-dreamsign`;
    const recoverPayload = namedDreamsignPayload(
      {
        kind: "dreamsign_gain",
        dreamsign: sealedDreamsign,
        source: "catalog",
        extra: { timing: "return scene", recoveredSealedObject: true },
      },
      args.context,
    );
    const returnReward = [recoverPayload, ...reward.payloads];
    const precommit = {
      ...pairedReturnContract({
        pairedReturnId,
        optionNumber: args.optionNumber,
        anchor: `${sealedDreamsign.name} sealed Dreamsign`,
        created: {
          referenceKind: "sealed_object",
          referenceId: createdId,
          label: `Seal {${sealedDreamsign.name}} until the return scene.`,
          objectKind: "dreamsign",
          dreamsignId: sealedDreamsign.id,
          dreamsignName: sealedDreamsign.name,
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
          resolution: `Recover {${sealedDreamsign.name}} and ${reward.text}.`,
          expiration: expiration(
            "return_unchanged",
            "If no Dream Journey site appears within 2 dreamscapes, recover the sealed Dreamsign with no extra reward.",
          ),
          duration: boundedDuration("dreamscape_count", "within 2 dreamscapes", 2),
        },
        futureCost: [],
        returnReward,
        reward: returnReward,
      }),
      sourceShapeId: args.shapeId,
      returnFamilyId: family,
      rewardMetadata: {
        rewardKey: reward.key,
        expectedConvertedEssence: expectedValue,
      },
    };

    return {
      option: option({
        number: args.optionNumber,
        text: `Seal {${sealedDreamsign.name}}. At the next Dream Journey site, recover it and ${reward.text}; if the 2-dreamscape window expires, recover it unchanged.`,
        triggers: [precommit],
        effects: reward.payloads,
        targets: [
          dreamsignExactTarget(sealedDreamsign, "catalog"),
          ...(reward.targets ?? []),
        ],
        effect: expectedValue,
        uncertainty: reward.uncertainty ?? -10,
      }),
      precommit,
    };
  }

  if (family === "sealed_card") {
    const createdId = `${pairedReturnId}-sealed-card`;
    const transformedCard = namedCardPayload(
      {
        kind: "card_transform",
        target: cardA,
        result: cardB,
        source: "catalog",
        extra: { timing: "return scene" },
      },
      args.context,
    );
    const returnReward = [transformedCard, ...reward.payloads];
    const precommit = {
      ...pairedReturnContract({
        pairedReturnId,
        optionNumber: args.optionNumber,
        anchor: `${cardA.name} sealed card`,
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
          resolution: `Return {${cardA.name}} as {${cardB.name}} and ${reward.text}.`,
          expiration: expiration(
            "return_unchanged",
            "If no Dream Journey site appears within 2 dreamscapes, return the sealed card unchanged.",
          ),
          duration: boundedDuration("dreamscape_count", "within 2 dreamscapes", 2),
        },
        futureCost: [],
        returnReward,
        reward: returnReward,
      }),
      sourceShapeId: args.shapeId,
      returnFamilyId: family,
      rewardMetadata: {
        rewardKey: reward.key,
        expectedConvertedEssence: expectedValue + 40,
      },
    };

    return {
      option: option({
        number: args.optionNumber,
        text: `Seal {${cardA.name}} until the next Dream Journey site. Return it as {${cardB.name}} and ${reward.text}, or return it unchanged if the 2-dreamscape window expires.`,
        triggers: [precommit],
        effects: reward.payloads,
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
          ...(reward.targets ?? []),
        ],
        effect: expectedValue + 40,
        uncertainty: reward.uncertainty ?? -10,
      }),
      precommit,
    };
  }

  if (family === "borrowed_dreamsign") {
    const createdId = `${pairedReturnId}-borrowed-dreamsign`;
    const temporaryGrant = namedDreamsignPayload(
      {
        kind: "dreamsign_temporary_grant",
        dreamsign: borrowedDreamsign,
        source: "catalog",
        extra: { temporary: true, duration: "next 2 battles" },
      },
      args.context,
    );
    const futureCost = args.optionNumber % 2 === 0
      ? [
          namedDreamsignPayload(
            {
              kind: "dreamsign_loss",
              dreamsign: borrowedDreamsign,
              source: "catalog",
              extra: { timing: "after 2 battles", temporary: true },
            },
            args.context,
          ),
          baneGainPayload({
            baneName: "Nightmare",
            targetContext: "future_burden",
            timing: "after 2 battles",
          }),
        ]
      : [
          namedDreamsignPayload(
            {
              kind: "dreamsign_loss",
              dreamsign: borrowedDreamsign,
              source: "catalog",
              extra: { timing: "after 2 battles", temporary: true },
            },
            args.context,
          ),
          cost("essence", 100),
        ];
    const futureCostValue = args.optionNumber % 2 === 0
      ? valueBaneBurden({ baneName: "Nightmare", count: 1, delayed: true })
      : -100;
    const returnReward = rewardPayload;
    const precommit = {
      ...pairedReturnContract({
        pairedReturnId,
        optionNumber: args.optionNumber,
        anchor: `${borrowedDreamsign.name} borrowed Dreamsign`,
        created: {
          referenceKind: "borrowed_object",
          referenceId: createdId,
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
          referencesCreatedId: createdId,
          resolution: `Lose {${borrowedDreamsign.name}}, pay the return cost, then ${reward.text}.`,
          expiration: expiration(
            "pay_cost",
            "If the borrowed Dreamsign is not returned after 2 battles, apply the committed return cost.",
          ),
          duration: boundedDuration("battle_count", "next 2 battles", 2),
        },
        futureCost,
        returnReward,
        reward: returnReward,
      }),
      sourceShapeId: args.shapeId,
      returnFamilyId: family,
      rewardMetadata: {
        rewardKey: reward.key,
        expectedConvertedEssence: expectedValue + futureCostValue + 95,
      },
    };

    return {
      option: option({
        number: args.optionNumber,
        text: `Borrow {${borrowedDreamsign.name}} for 2 battles. After 2 battles, lose it, pay the return cost, then ${reward.text}.`,
        triggers: [precommit],
        effects: [temporaryGrant],
        targets: [
          dreamsignExactTarget(borrowedDreamsign, "catalog"),
          ...(reward.targets ?? []),
        ],
        effect: expectedValue + futureCostValue + 95,
        uncertainty: reward.uncertainty ?? -15,
      }),
      precommit,
    };
  }

  if (family === "borrowed_card_draft") {
    const createdId = `${pairedReturnId}-borrowed-card-draft`;
    const temporaryDraft = draftCards(GENERIC_CARD_DRAFT_PROFILE, {
      takeCount: 2,
      temporary: true,
    });
    const futureCost = [{
      kind: "card_purge",
      cardOperationKind: "purge",
      selection: "temporary_drafted_cards",
      source: "temporary_manifest_grant",
      count: 2,
      timing: "after 2 battles",
    }];
    const returnReward = rewardPayload;
    const expectedDraftValue = valueCardDraft(temporaryDraft);
    const precommit = {
      ...pairedReturnContract({
        pairedReturnId,
        optionNumber: args.optionNumber,
        anchor: "borrowed temporary card draft",
        created: {
          referenceKind: "borrowed_object",
          referenceId: createdId,
          label: "Draft 2 temporary cards for the next 2 battles.",
          objectKind: "card",
          statusScope: "quest",
        },
        returnScene: {
          returnSceneKind: "borrowed_object_return",
          triggerSelector: hookTrigger({
            triggerKind: "each_battle",
            label: "after 2 battles",
            count: 2,
          }),
          referencesCreatedId: createdId,
          resolution: `Purge both temporary drafted cards, then ${reward.text}.`,
          expiration: expiration(
            "pay_cost",
            "If the temporary cards cannot be purged after 2 battles, keep the purge obligation.",
          ),
          duration: boundedDuration("battle_count", "next 2 battles", 2),
        },
        futureCost,
        returnReward,
        reward: returnReward,
      }),
      sourceShapeId: args.shapeId,
      returnFamilyId: family,
      rewardMetadata: {
        rewardKey: reward.key,
        expectedConvertedEssence: expectedValue + expectedDraftValue - 60,
      },
    };

    return {
      option: option({
        number: args.optionNumber,
        text: `Draft 2 of 4 cards for 2 battles. After 2 battles, purge both temporary cards, then ${reward.text}.`,
        triggers: [precommit],
        effects: [temporaryDraft],
        targets: [
          target("card", GENERIC_CARD_DRAFT_PROFILE.targetDescription, temporaryDraft.predicate),
          ...(reward.targets ?? []),
        ],
        effect: expectedValue + expectedDraftValue - 60,
        uncertainty: reward.uncertainty ?? -14,
      }),
      precommit,
    };
  }

  const createdId = `${pairedReturnId}-future-trade`;
  const tradePayload = namedDreamsignPayload(
    {
      kind: "dreamsign_trade_hook",
      dreamsign: tradeDreamsign,
      source: "catalog",
      result: receiveDreamsign,
      resultSource: "catalog",
      extra: {
        timing: "return scene",
        obligation: `Trade ${tradeDreamsign.name} for ${reward.text}`,
        giveDreamsignId: tradeDreamsign.id,
        giveDreamsignName: tradeDreamsign.name,
        receiveDreamsignId: receiveDreamsign.id,
        receiveDreamsignName: receiveDreamsign.name,
      },
    },
    args.context,
  );
  const triggerSelector = family === "return_for_route_edit"
    ? hookTrigger({
        triggerKind: "battle",
        label: "after 2 battles",
        count: 2,
      })
    : args.optionNumber % 2 === 0
      ? hookTrigger({
          triggerKind: "future_dream_journey",
          label: "at the next Dream Journey site",
          count: 1,
        })
      : hookTrigger({
          triggerKind: "future_shop",
          label: "at the next future shop",
          count: 1,
        });
  const futureCost = [tradePayload];
  const returnReward = rewardPayload;
  const precommit = {
    ...pairedReturnContract({
      pairedReturnId,
      optionNumber: args.optionNumber,
      anchor: `${tradeDreamsign.name} trade hook`,
      created: {
        referenceKind: "trade_promise",
        referenceId: createdId,
        label: `Gain {${tradeDreamsign.name}} as a future trade hook.`,
        objectKind: "dreamsign",
        dreamsignId: tradeDreamsign.id,
        dreamsignName: tradeDreamsign.name,
      },
      returnScene: {
        returnSceneKind: "future_trade",
        triggerSelector,
        referencesCreatedId: createdId,
        resolution: `Trade {${tradeDreamsign.name}} for ${reward.text}.`,
        expiration: expiration(
          "discard_obligation",
          "If the named future site or battle window does not arrive within 2 dreamscapes, discard the trade hook.",
        ),
        duration: boundedDuration("dreamscape_count", "within 2 dreamscapes", 2),
      },
      futureCost,
      returnReward,
      reward: returnReward,
    }),
    sourceShapeId: args.shapeId,
    returnFamilyId: family,
    rewardMetadata: {
      rewardKey: reward.key,
      expectedConvertedEssence: expectedValue + 70,
    },
  };

  return {
    option: option({
      number: args.optionNumber,
      text: `Gain {${tradeDreamsign.name}}. ${String(triggerSelector.label)}, trade it for ${reward.text}; discard the hook if the window expires.`,
      triggers: [precommit],
      effects: [
        namedDreamsignGrant(args.context, tradeDreamsign),
      ],
      targets: [
        dreamsignExactTarget(tradeDreamsign, "catalog"),
        ...(reward.targets ?? []),
      ],
      effect: expectedValue + 70,
      uncertainty: reward.uncertainty ?? -15,
    }),
    precommit,
  };
}
