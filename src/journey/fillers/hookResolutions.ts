import type { CardContent, DreamsignContent } from "../../content/model.js";
import type { JourneyContext } from "../../quest/context.js";
import { shuffleDeterministic, type DrawContext } from "../../util/rng.js";
import { BANE_NAMES, SITE_TYPES } from "../effects.js";
import {
  valueBaneBurden,
  valueDreamsignOperation,
  valueOmenGain,
} from "../value.js";
import { shopPayload, statusPayload } from "./environmentPayloads.js";
import {
  catalogRewardCards,
  cardExactTarget,
  cardQualityValue,
  namedCardPayload,
} from "./namedCardPayloads.js";
import {
  dreamsignExactTarget,
  namedDreamsignPayload,
} from "./dreamsignPayloads.js";
import { routeEditRewards } from "./routeEditCatalog.js";
import {
  baneBurden,
  baneTarget,
  gainEssence,
  gainOmen,
  lowerFirst,
  selectedDreamsignTargets,
} from "./shared.js";
import type { TriggerEntry } from "./hookTriggers.js";

/**
 * Stages at which a resolution may be emitted. Mirrors the existing hook stage
 * vocabulary used by `expandedDelayedHookCandidates`.
 */
export type HookStage = "early" | "mid" | "late";

/**
 * The shape that every resolution's `producesPayload` returns. The cartesian
 * loop in `expandedDelayedHookCandidates` lifts these fields into the final
 * `ExpandedDelayedHookFill` record (alongside trigger-derived fields).
 */
export type ResolutionPayload = {
  text: string;
  resolutionText: string;
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
  /** Override the default `${trigger.kind}:${resolution.kind}` key. */
  keySuffix?: string;
  /** Override the default trigger selector built from trigger defaults. */
  triggerSelector?: Record<string, unknown>;
  /** Override the default tracked-condition text. */
  trackedCondition?: string;
};

export type ResolutionPayloadArgs = {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage: HookStage;
  trigger: TriggerEntry;
};

export type ResolutionKind =
  | "card_draft"
  | "card_purge"
  | "essence_gain"
  | "omen_gain"
  | "named_card_grant"
  | "named_dreamsign_grant"
  | "card_duplicate"
  | "card_transform"
  | "dreamsign_transform"
  | "bane_transform_to_card"
  | "future_shop_discount"
  | "future_shop_trade_hook"
  | "delayed_bane_arrival"
  | "status_reward_replacement"
  | "future_journey_option"
  | "future_journey_route_edit"
  | "site_visit_reward";

export type ResolutionEntry = {
  readonly kind: ResolutionKind;
  readonly producesPayload: (args: ResolutionPayloadArgs) => ResolutionPayload | undefined;
  readonly requiresResource: "essence" | "card" | "bane" | "dreamsign" | "none";
  readonly compatibleStages: readonly HookStage[];
  readonly weight: number;
};

const ALL_STAGES: readonly HookStage[] = ["early", "mid", "late"];

// ---------- Stage band tables (formerly module-level constants) ----------

type RandomPurgeProfile = { battleWindow: number; purgeCount: number; effect: number };
const RANDOM_PURGE_BANDS: Record<HookStage, readonly RandomPurgeProfile[]> = {
  early: [
    { battleWindow: 2, purgeCount: 1, effect: 95 },
    { battleWindow: 2, purgeCount: 2, effect: 120 },
  ],
  mid: [
    { battleWindow: 2, purgeCount: 2, effect: 125 },
    { battleWindow: 3, purgeCount: 2, effect: 140 },
  ],
  late: [
    { battleWindow: 3, purgeCount: 2, effect: 145 },
    { battleWindow: 3, purgeCount: 3, effect: 165 },
  ],
};

type EssenceHookProfile = { triggerCount: number; battleWindow: number; essenceAmount: number };
const NAMED_CARD_PLAY_ESSENCE_BANDS: Record<HookStage, readonly EssenceHookProfile[]> = {
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
};

type OmenHookProfile = { triggerCount: number; battleWindow: number; omenAmount: number };
const DREAMSIGN_TRIGGER_OMEN_BANDS: Record<HookStage, readonly OmenHookProfile[]> = {
  early: [
    { triggerCount: 2, battleWindow: 2, omenAmount: 1 },
    { triggerCount: 3, battleWindow: 3, omenAmount: 2 },
  ],
  mid: [
    { triggerCount: 2, battleWindow: 2, omenAmount: 1 },
    { triggerCount: 3, battleWindow: 3, omenAmount: 2 },
    { triggerCount: 4, battleWindow: 3, omenAmount: 3 },
  ],
  late: [
    { triggerCount: 3, battleWindow: 3, omenAmount: 2 },
    { triggerCount: 4, battleWindow: 3, omenAmount: 3 },
    { triggerCount: 5, battleWindow: 3, omenAmount: 4 },
  ],
};

type NamedCardDuplicateProfile = {
  triggerCount: number;
  battleWindow: number;
  copyCount: number;
  effect: number;
};
const NAMED_CARD_DUPLICATE_BANDS: Record<HookStage, readonly NamedCardDuplicateProfile[]> = {
  early: [
    { triggerCount: 3, battleWindow: 2, copyCount: 1, effect: 105 },
    { triggerCount: 4, battleWindow: 3, copyCount: 1, effect: 115 },
  ],
  mid: [
    { triggerCount: 4, battleWindow: 3, copyCount: 1, effect: 115 },
    { triggerCount: 5, battleWindow: 3, copyCount: 1, effect: 120 },
  ],
  late: [
    { triggerCount: 5, battleWindow: 3, copyCount: 1, effect: 125 },
    { triggerCount: 6, battleWindow: 3, copyCount: 2, effect: 155 },
  ],
};

type EssencePaymentDreamsignTransformProfile = {
  amount: number;
  dreamscapeWindow: number;
  effect: number;
};
const ESSENCE_PAYMENT_DREAMSIGN_TRANSFORM_BANDS: Record<
  HookStage,
  readonly EssencePaymentDreamsignTransformProfile[]
> = {
  early: [
    { amount: 30, dreamscapeWindow: 2, effect: 125 },
    { amount: 40, dreamscapeWindow: 2, effect: 135 },
  ],
  mid: [
    { amount: 40, dreamscapeWindow: 2, effect: 135 },
    { amount: 55, dreamscapeWindow: 3, effect: 145 },
  ],
  late: [
    { amount: 55, dreamscapeWindow: 2, effect: 145 },
    { amount: 70, dreamscapeWindow: 3, effect: 160 },
  ],
};

type FutureShopDiscountProfile = { amount: number; effect: number };
const FUTURE_SHOP_DISCOUNT_BANDS: Record<HookStage, readonly FutureShopDiscountProfile[]> = {
  early: [
    { amount: 60, effect: 60 },
    { amount: 80, effect: 80 },
  ],
  mid: [
    { amount: 80, effect: 80 },
    { amount: 100, effect: 100 },
  ],
  late: [
    { amount: 100, effect: 100 },
    { amount: 120, effect: 120 },
  ],
};

type FutureJourneyOptionProfile = { optionCount: number; effect: number };
const FUTURE_JOURNEY_OPTION_BANDS: Record<HookStage, readonly FutureJourneyOptionProfile[]> = {
  early: [
    { optionCount: 1, effect: 90 },
    { optionCount: 2, effect: 130 },
  ],
  mid: [
    { optionCount: 1, effect: 95 },
    { optionCount: 2, effect: 135 },
  ],
  late: [
    { optionCount: 2, effect: 140 },
    { optionCount: 3, effect: 175 },
  ],
};

type DelayedBaneTimingProfile = {
  textPrefix: string;
  resolutionPrefix: string;
  expirationLabel: string;
  durationKind: "battle_count" | "dreamscape_count";
  durationLabel: string;
  durationCount: number;
  timingLabel: string;
  uncertainty: number;
};
const DELAYED_BANE_TIMING_BY_TRIGGER: Partial<
  Record<TriggerEntry["kind"], DelayedBaneTimingProfile>
> = {
  battle: {
    textPrefix: "After next battle",
    resolutionPrefix: "When the next battle ends",
    expirationLabel:
      "If no battle occurs within 2 dreamscapes, discard the Bane obligation.",
    durationKind: "dreamscape_count",
    durationLabel: "within 2 dreamscapes",
    durationCount: 2,
    timingLabel: "after next battle",
    uncertainty: -8,
  },
  victory: {
    textPrefix: "After your next victory",
    resolutionPrefix: "When your next victory is earned",
    expirationLabel:
      "If no victory occurs within 3 battles, discard the Bane obligation.",
    durationKind: "battle_count",
    durationLabel: "next 3 battles",
    durationCount: 3,
    timingLabel: "after your next victory",
    uncertainty: -10,
  },
  dreamscape: {
    textPrefix: "At the next dreamscape",
    resolutionPrefix: "When the next dreamscape begins",
    expirationLabel:
      "If the next dreamscape is skipped, discard the Bane obligation.",
    durationKind: "dreamscape_count",
    durationLabel: "next dreamscape",
    durationCount: 1,
    timingLabel: "at the next dreamscape",
    uncertainty: -8,
  },
};

const DELAYED_BANE_HOOK_MIN_EFFECT = 135;

const SITE_VISIT_HOOK_SITES = SITE_TYPES.filter(
  (siteType) => siteType !== "Battle" && siteType !== "Dream Journey",
);

// ---------- Helpers shared across resolutions ----------

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

function battleWindowText(count: number): string {
  return count === 1 ? "next battle" : `next ${count} battles`;
}

function dreamscapeWindowText(count: number): string {
  return count === 1 ? "next dreamscape" : `within ${count} dreamscapes`;
}

function expirationPolicy(
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

function boundedDurationPayload(
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

function controlledScenePayload(
  sceneKind: "reward" | "cost" | "transformation" | "trade" | "return",
  label: string,
): Record<string, unknown> {
  return { sceneKind, label };
}

function hookVisibilityPayload(
  outcomeVisibility: "visible" | "hidden_until_resolution" | "debug_only",
  disclosure: string,
): Record<string, unknown> {
  return { outcomeVisibility, disclosure };
}

function namedCardGrantPayload(
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

function namedDreamsignGrantPayload(
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

function pickRewardCard(
  context: JourneyContext,
  drawContext: DrawContext,
  index = 0,
): CardContent | undefined {
  const cards = catalogRewardCards(context, drawContext);
  if (cards.length === 0) {
    return context.content.cards[0];
  }
  return cards[index % cards.length] ?? cards[0];
}

function pickRewardCards(
  context: JourneyContext,
  drawContext: DrawContext,
  count: number,
): CardContent[] {
  const cards = catalogRewardCards(context, drawContext);
  if (cards.length === 0) {
    const fallback = context.content.cards[0];
    return fallback ? [fallback] : [];
  }
  const result: CardContent[] = [];
  for (let i = 0; i < count; i += 1) {
    result.push(cards[i % cards.length]!);
  }
  return result;
}

function pickRewardDreamsign(
  context: JourneyContext,
  drawContext: DrawContext,
  label: string,
  index = 0,
): DreamsignContent | undefined {
  const selected = selectedDreamsignTargets(context, drawContext);
  const fallbacks = shuffleDeterministic(
    drawContext,
    `${label}:catalog-dreamsign-fallbacks`,
    context.content.dreamsigns,
  );
  const merged = [...selected, ...fallbacks].filter(
    (dreamsign, idx, entries) =>
      entries.findIndex((entry) => entry.id === dreamsign.id) === idx,
  );
  if (merged.length === 0) {
    return context.content.dreamsigns[0];
  }
  return merged[index % merged.length] ?? merged[0];
}

// ---------- Resolution producers ----------

function delayedBaneArrival(args: ResolutionPayloadArgs): ResolutionPayload | undefined {
  const timing = DELAYED_BANE_TIMING_BY_TRIGGER[args.trigger.kind];
  if (!timing) return undefined;
  const card = pickRewardCard(args.context, args.drawContext, 2);
  if (!card) return undefined;
  const baneName = shuffleDeterministic(
    args.drawContext,
    `${args.label}:delayed-bane-name`,
    BANE_NAMES,
  )[0]!;
  const burden = baneBurden(baneName, 1, { timing: timing.timingLabel });

  return {
    text: `Gain {${card.name}}. ${timing.textPrefix}, add {${baneName}}.`,
    resolutionText: `${timing.resolutionPrefix}, add {${baneName}}.`,
    expiration: expirationPolicy("discard_obligation", timing.expirationLabel),
    duration: boundedDurationPayload(
      timing.durationKind,
      timing.durationLabel,
      timing.durationCount,
    ),
    controlledScene: controlledScenePayload("cost", `add ${baneName}`),
    reward: burden,
    effects: [namedCardGrantPayload(args.context, card)],
    targets: [cardExactTarget(card, "catalog")],
    effect: Math.max(
      DELAYED_BANE_HOOK_MIN_EFFECT,
      cardQualityValue(card) +
        valueBaneBurden({ baneName, count: 1, delayed: true }),
    ),
    uncertainty: timing.uncertainty,
    keySuffix: `delayed-bane:${baneName.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "")}`,
  };
}

function namedDreamsignGrant(args: ResolutionPayloadArgs): ResolutionPayload | undefined {
  if (args.trigger.kind !== "victory") return undefined;
  const dreamsign = pickRewardDreamsign(args.context, args.drawContext, args.label, 0);
  if (!dreamsign) return undefined;
  const triggerCount = 2;

  return {
    text: `After 2 victories, gain {${dreamsign.name}}.`,
    resolutionText: `After the second victory, gain {${dreamsign.name}}.`,
    expiration: expirationPolicy(
      "forfeit_reward",
      "If 2 victories are not earned within 3 battles, discard this hook with no reward.",
    ),
    duration: boundedDurationPayload("battle_count", "next 3 battles", 3),
    controlledScene: controlledScenePayload("reward", `gain ${dreamsign.name}`),
    reward: namedDreamsignGrantPayload(args.context, dreamsign, "after 2 victories"),
    effects: [namedDreamsignGrantPayload(args.context, dreamsign, "after 2 victories")],
    targets: [dreamsignExactTarget(dreamsign, "catalog")],
    effect: valueDreamsignOperation("gain", { tideOverlap: false }) * 1.3,
    uncertainty: -12,
    keySuffix: `${triggerCount}:named-dreamsign`,
    triggerSelector: {
      triggerKind: "victory",
      label: "after 2 victories",
      count: triggerCount,
    },
    trackedCondition: "Track the next 2 victories.",
  };
}

function namedCardGrant(args: ResolutionPayloadArgs): ResolutionPayload | undefined {
  if (args.trigger.kind !== "dreamscape") return undefined;
  const card = pickRewardCard(args.context, args.drawContext, 3);
  if (!card) return undefined;

  return {
    text: `At the next dreamscape, gain {${card.name}}.`,
    resolutionText: `At the next dreamscape, gain {${card.name}}.`,
    expiration: expirationPolicy(
      "forfeit_reward",
      "If the next dreamscape is skipped, discard this hook with no reward.",
    ),
    duration: boundedDurationPayload("dreamscape_count", "next dreamscape", 1),
    controlledScene: controlledScenePayload("reward", `gain ${card.name}`),
    reward: namedCardGrantPayload(args.context, card, "at the next dreamscape"),
    effects: [namedCardGrantPayload(args.context, card, "at the next dreamscape")],
    targets: [cardExactTarget(card, "catalog")],
    effect: cardQualityValue(card) * 1.25,
    uncertainty: -8,
    keySuffix: "next:named-card",
    triggerSelector: {
      triggerKind: "dreamscape",
      label: "at the next dreamscape",
      count: 1,
    },
    trackedCondition: "Track arrival at the next dreamscape.",
  };
}

function cardPurge(args: ResolutionPayloadArgs): ResolutionPayload | undefined {
  if (args.trigger.kind !== "each_battle") return undefined;
  const profile = shuffleDeterministic(
    args.drawContext,
    `${args.label}:random-purge-profile`,
    RANDOM_PURGE_BANDS[args.stage],
  )[0]!;
  const battleText = battleWindowText(profile.battleWindow);
  const purgeWord = profile.purgeCount === 1 ? "" : "s";

  return {
    text: `After each of the ${battleText}, purge ${profile.purgeCount} random card${purgeWord}.`,
    resolutionText: `After each tracked battle, purge ${profile.purgeCount} random card${purgeWord}.`,
    expiration: expirationPolicy(
      "resolve_partial",
      `If fewer than ${profile.battleWindow} battles occur within ${profile.battleWindow} dreamscapes, resolve the completed random purges.`,
    ),
    duration: boundedDurationPayload("battle_count", battleText, profile.battleWindow),
    controlledScene: controlledScenePayload("reward", "purge random cards"),
    reward: {
      kind: "card_purge",
      cardOperationKind: "purge",
      selection: "visible_random",
      source: "deck",
      count: profile.purgeCount,
      repetitions: profile.battleWindow,
      timing: `after each of the ${battleText}`,
    },
    effect: profile.effect,
    uncertainty: -12,
    keySuffix: `${profile.battleWindow}:random-purge-${profile.purgeCount}`,
    triggerSelector: {
      triggerKind: "each_battle",
      label: `after each of the ${battleText}`,
      count: profile.battleWindow,
    },
    trackedCondition: `Track each completed battle in a ${profile.battleWindow}-battle window.`,
  };
}

function siteVisitReward(args: ResolutionPayloadArgs): ResolutionPayload | undefined {
  if (args.trigger.kind !== "site_visit") return undefined;
  const dreamsign = pickRewardDreamsign(args.context, args.drawContext, args.label, 1);
  if (!dreamsign) return undefined;
  const siteType = shuffleDeterministic(
    args.drawContext,
    `${args.label}:site-visit-target`,
    SITE_VISIT_HOOK_SITES,
  )[0] ?? SITE_VISIT_HOOK_SITES[0]!;

  return {
    text: `After you visit a {${siteType}} site, gain {${dreamsign.name}}.`,
    resolutionText: `After visiting a ${siteType} site, gain {${dreamsign.name}}.`,
    expiration: expirationPolicy(
      "forfeit_reward",
      `If no ${siteType} site is visited within 2 dreamscapes, discard this hook.`,
    ),
    duration: boundedDurationPayload("dreamscape_count", "within 2 dreamscapes", 2),
    controlledScene: controlledScenePayload("reward", `gain ${dreamsign.name}`),
    reward: namedDreamsignGrantPayload(
      args.context,
      dreamsign,
      `after ${siteType} site visit`,
    ),
    effects: [
      namedDreamsignGrantPayload(
        args.context,
        dreamsign,
        `after ${siteType} site visit`,
      ),
    ],
    targets: [dreamsignExactTarget(dreamsign, "catalog")],
    effect: valueDreamsignOperation("gain", { tideOverlap: false }) * 1.2,
    uncertainty: -10,
    keySuffix: `${siteType.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "")}:named-dreamsign`,
    triggerSelector: {
      triggerKind: "site_visit",
      label: `after you visit a ${siteType} site`,
      siteType,
    },
    trackedCondition: `Track the next ${siteType} site visit.`,
  };
}

function essenceGain(args: ResolutionPayloadArgs): ResolutionPayload | undefined {
  if (args.trigger.kind !== "named_card_play") return undefined;
  const card = pickRewardCard(args.context, args.drawContext, 0);
  if (!card) return undefined;
  const profile = shuffleDeterministic(
    args.drawContext,
    `${args.label}:named-card-play-essence-profile`,
    NAMED_CARD_PLAY_ESSENCE_BANDS[args.stage],
  )[0]!;
  const battleText = battleWindowText(profile.battleWindow);

  return {
    text: `Once you play {${card.name}} ${profile.triggerCount} times, gain ${profile.essenceAmount} essence.`,
    resolutionText: `After the ${ordinalWord(profile.triggerCount)} {${card.name}} play, gain ${profile.essenceAmount} essence.`,
    expiration: expirationPolicy(
      "forfeit_reward",
      `If it is not played ${profile.triggerCount} times within ${profile.battleWindow} battles, discard this hook.`,
    ),
    duration: boundedDurationPayload("battle_count", battleText, profile.battleWindow),
    controlledScene: controlledScenePayload(
      "reward",
      `gain ${profile.essenceAmount} essence`,
    ),
    reward: gainEssence(profile.essenceAmount),
    effects: [namedCardGrantPayload(args.context, card), gainEssence(profile.essenceAmount)],
    targets: [cardExactTarget(card, "catalog")],
    effect: cardQualityValue(card) + profile.essenceAmount,
    uncertainty: -14,
    keySuffix: `${profile.triggerCount}:essence-${profile.essenceAmount}`,
    triggerSelector: {
      triggerKind: "named_card_play",
      label: `once you play ${card.name} ${profile.triggerCount} times`,
      count: profile.triggerCount,
      cardId: card.id,
      cardName: card.name,
    },
    trackedCondition: `Track playing {${card.name}} ${profile.triggerCount} times.`,
  };
}

function omenGain(args: ResolutionPayloadArgs): ResolutionPayload | undefined {
  if (args.trigger.kind !== "dreamsign_trigger") return undefined;
  const dreamsign = pickRewardDreamsign(args.context, args.drawContext, args.label, 3);
  if (!dreamsign) return undefined;
  const profile = shuffleDeterministic(
    args.drawContext,
    `${args.label}:dreamsign-trigger-omen-profile`,
    DREAMSIGN_TRIGGER_OMEN_BANDS[args.stage],
  )[0]!;
  const battleText = battleWindowText(profile.battleWindow);
  const omenWord = profile.omenAmount === 1 ? "omen" : "omens";

  return {
    text: `Once {${dreamsign.name}} triggers ${profile.triggerCount} times, gain ${profile.omenAmount} ${omenWord}.`,
    resolutionText: `After the ${ordinalWord(profile.triggerCount)} {${dreamsign.name}} trigger, gain ${profile.omenAmount} ${omenWord}.`,
    expiration: expirationPolicy(
      "forfeit_reward",
      `If the Dreamsign does not trigger ${profile.triggerCount} times within ${profile.battleWindow} battles, discard this hook.`,
    ),
    duration: boundedDurationPayload("battle_count", battleText, profile.battleWindow),
    controlledScene: controlledScenePayload(
      "reward",
      `gain ${profile.omenAmount} ${omenWord}`,
    ),
    reward: gainOmen(profile.omenAmount),
    effects: [
      namedDreamsignGrantPayload(args.context, dreamsign),
      gainOmen(profile.omenAmount),
    ],
    targets: [dreamsignExactTarget(dreamsign, "catalog")],
    effect:
      valueDreamsignOperation("gain", { tideOverlap: false }) +
      valueOmenGain(profile.omenAmount),
    uncertainty: -14,
    keySuffix: `${profile.triggerCount}:omens-${profile.omenAmount}`,
    triggerSelector: {
      triggerKind: "dreamsign_trigger",
      label: `once ${dreamsign.name} triggers ${profile.triggerCount} times`,
      count: profile.triggerCount,
      dreamsignId: dreamsign.id,
      dreamsignName: dreamsign.name,
    },
    trackedCondition: `Track {${dreamsign.name}} triggering ${profile.triggerCount} times.`,
  };
}

function cardDuplicate(args: ResolutionPayloadArgs): ResolutionPayload | undefined {
  if (args.trigger.kind !== "named_card_play") return undefined;
  const card = pickRewardCard(args.context, args.drawContext, 1);
  if (!card) return undefined;
  const profile = shuffleDeterministic(
    args.drawContext,
    `${args.label}:named-card-duplicate-profile`,
    NAMED_CARD_DUPLICATE_BANDS[args.stage],
  )[0]!;
  const battleText = battleWindowText(profile.battleWindow);
  const duplicateWord =
    profile.copyCount === 1 ? "" : ` ${profile.copyCount} times`;

  return {
    text: `Once you play {${card.name}} ${profile.triggerCount} times, duplicate it${duplicateWord}.`,
    resolutionText: `After the ${ordinalWord(profile.triggerCount)} {${card.name}} play, duplicate it${duplicateWord}.`,
    expiration: expirationPolicy(
      "forfeit_reward",
      `If it is not played ${profile.triggerCount} times within ${profile.battleWindow} battles, discard this hook.`,
    ),
    duration: boundedDurationPayload("battle_count", battleText, profile.battleWindow),
    controlledScene: controlledScenePayload("reward", `duplicate ${card.name}`),
    reward: namedCardPayload(
      {
        kind: "card_duplicate",
        target: card,
        source: "catalog",
        extra: {
          timing: `after ${profile.triggerCount} named card plays`,
          copyCount: profile.copyCount,
        },
      },
      args.context,
    ),
    targets: [cardExactTarget(card, "catalog")],
    effect: profile.effect,
    uncertainty: -15,
    keySuffix: `${profile.triggerCount}:duplicate-${profile.copyCount}`,
    triggerSelector: {
      triggerKind: "named_card_play",
      label: `once you play ${card.name} ${profile.triggerCount} times`,
      count: profile.triggerCount,
      cardId: card.id,
      cardName: card.name,
    },
    trackedCondition: `Track playing {${card.name}} ${profile.triggerCount} times.`,
  };
}

function cardTransform(args: ResolutionPayloadArgs): ResolutionPayload | undefined {
  if (args.trigger.kind !== "card_added") return undefined;
  const cards = pickRewardCards(args.context, args.drawContext, 5);
  const cardSource = cards[3];
  const cardResult = cards[4] ?? cards[0];
  if (!cardSource || !cardResult) return undefined;

  return {
    text: `When {${cardSource.name}} is added, transform it into {${cardResult.name}}.`,
    resolutionText: `When added, transform it into {${cardResult.name}}.`,
    expiration: expirationPolicy(
      "return_unchanged",
      "If the card is not added before the next Dream Journey, keep it unchanged.",
    ),
    duration: boundedDurationPayload(
      "journey_count",
      "before the next Dream Journey",
      1,
    ),
    controlledScene: controlledScenePayload(
      "transformation",
      `${cardSource.name} becomes ${cardResult.name}`,
    ),
    reward: namedCardPayload(
      {
        kind: "card_transform",
        target: cardSource,
        result: cardResult,
        source: "catalog",
        extra: { timing: "when named card is added" },
      },
      args.context,
    ),
    targets: [
      cardExactTarget(cardSource, "catalog"),
      cardExactTarget(cardResult, "catalog"),
    ],
    effect: 130,
    uncertainty: -12,
    keySuffix: "one:transform-card",
    triggerSelector: {
      triggerKind: "card_added",
      label: `when ${cardSource.name} is added`,
      count: 1,
      cardId: cardSource.id,
      cardName: cardSource.name,
    },
    trackedCondition: `Track adding {${cardSource.name}} to your deck.`,
  };
}

function dreamsignTransform(args: ResolutionPayloadArgs): ResolutionPayload | undefined {
  if (args.trigger.kind !== "essence_payment") return undefined;
  const dreamsignA = pickRewardDreamsign(args.context, args.drawContext, args.label, 1);
  const dreamsignB = pickRewardDreamsign(args.context, args.drawContext, args.label, 2);
  if (!dreamsignA || !dreamsignB) return undefined;
  const profile = shuffleDeterministic(
    args.drawContext,
    `${args.label}:essence-payment-transform-profile`,
    ESSENCE_PAYMENT_DREAMSIGN_TRANSFORM_BANDS[args.stage],
  )[0]!;

  return {
    text: `When you next pay at least ${profile.amount} essence, transform {${dreamsignA.name}} into {${dreamsignB.name}}.`,
    resolutionText: `After paying, transform {${dreamsignA.name}} into {${dreamsignB.name}}.`,
    expiration: expirationPolicy(
      "forfeit_reward",
      `If no qualifying payment happens ${dreamscapeWindowText(profile.dreamscapeWindow)}, discard the transformation.`,
    ),
    duration: boundedDurationPayload(
      "dreamscape_count",
      dreamscapeWindowText(profile.dreamscapeWindow),
      profile.dreamscapeWindow,
    ),
    controlledScene: controlledScenePayload(
      "transformation",
      `${dreamsignA.name} becomes ${dreamsignB.name}`,
    ),
    visibilityPolicy: hookVisibilityPayload(
      "hidden_until_resolution",
      "The named transformation is precommitted in JSON/debug and summarized before choosing.",
    ),
    reward: namedDreamsignPayload(
      {
        kind: "dreamsign_transform",
        dreamsign: dreamsignA,
        source: "catalog",
        result: dreamsignB,
        resultSource: "catalog",
        extra: {
          timing: "after essence payment",
          minimumEssencePayment: profile.amount,
        },
      },
      args.context,
    ),
    targets: [
      dreamsignExactTarget(dreamsignA, "catalog"),
      dreamsignExactTarget(dreamsignB, "catalog"),
    ],
    effect: profile.effect,
    uncertainty: -15,
    keySuffix: `${profile.amount}:transform-dreamsign`,
    triggerSelector: {
      triggerKind: "essence_payment",
      label: `when you next pay at least ${profile.amount} essence`,
      amount: profile.amount,
    },
    trackedCondition: `Track the next payment of at least ${profile.amount} essence.`,
  };
}

function baneTransformToCard(args: ResolutionPayloadArgs): ResolutionPayload | undefined {
  if (args.trigger.kind !== "future_shop" && args.trigger.kind !== "card_added") {
    return undefined;
  }
  const card = pickRewardCard(args.context, args.drawContext, 4);
  if (!card) return undefined;
  const baneName = shuffleDeterministic(
    args.drawContext,
    `${args.label}:bane-to-card-name`,
    BANE_NAMES,
  )[0]!;
  const isShopTrigger = args.trigger.kind === "future_shop";
  const triggerLabel = isShopTrigger
    ? "at the next future shop"
    : "the next card you add";

  return {
    text: isShopTrigger
      ? `At the next future Shop, transform {${baneName}} into {${card.name}}.`
      : `When the next card is added, transform {${baneName}} into {${card.name}}.`,
    resolutionText: isShopTrigger
      ? `At the next future Shop, transform {${baneName}} into {${card.name}}.`
      : `When the next card is added, transform {${baneName}} into {${card.name}}.`,
    expiration: expirationPolicy(
      "discard_obligation",
      isShopTrigger
        ? "If no future Shop appears within 2 dreamscapes, discard this hook."
        : "If no card is added within 2 dreamscapes, discard this hook.",
    ),
    duration: isShopTrigger
      ? boundedDurationPayload("shop_count", "next future shop", 1)
      : boundedDurationPayload("dreamscape_count", "within 2 dreamscapes", 2),
    controlledScene: controlledScenePayload(
      "transformation",
      `${baneName} becomes ${card.name}`,
    ),
    reward: {
      kind: "bane_transform_to_card",
      baneName,
      count: 1,
      baneTargetContext: "manifest_obligation",
      selection: "exact",
      timing: triggerLabel,
      cardId: card.id,
      cardName: card.name,
      source: "catalog",
      delayed: true,
    },
    targets: [
      baneTarget(`${baneName} obligation`, [baneName], "manifest_obligation"),
      cardExactTarget(card, "catalog"),
    ],
    effect: 130,
    uncertainty: -13,
    keySuffix: `bane-${baneName.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "")}-to-card`,
    triggerSelector: {
      triggerKind: args.trigger.kind,
      label: triggerLabel,
      count: 1,
    },
    trackedCondition: isShopTrigger
      ? "Track the next future Shop site."
      : "Track adding the next card.",
  };
}

function futureShopDiscount(args: ResolutionPayloadArgs): ResolutionPayload | undefined {
  if (args.trigger.kind !== "future_shop") return undefined;
  const profile = shuffleDeterministic(
    args.drawContext,
    `${args.label}:future-shop-discount-profile`,
    FUTURE_SHOP_DISCOUNT_BANDS[args.stage],
  )[0]!;

  return {
    text: `At the next future Shop, gain a ${profile.amount} essence discount.`,
    resolutionText: `At that shop, apply a ${profile.amount} essence discount.`,
    expiration: expirationPolicy(
      "discard_obligation",
      "If no future Shop appears within 2 dreamscapes, discard this hook.",
    ),
    duration: boundedDurationPayload("shop_count", "next future shop", 1),
    controlledScene: controlledScenePayload(
      "reward",
      `${profile.amount} essence Shop discount`,
    ),
    reward: shopPayload({
      kind: "future_shop_discount",
      scope: "next_shop",
      duration: "next future shop",
      amount: profile.amount,
    }),
    effect: profile.effect,
    uncertainty: -14,
    keySuffix: `discount-${profile.amount}`,
    triggerSelector: {
      triggerKind: "future_shop",
      label: "at the next future shop",
      count: 1,
    },
    trackedCondition: "Track the next future Shop site.",
  };
}

function futureShopTradeHook(args: ResolutionPayloadArgs): ResolutionPayload | undefined {
  if (args.trigger.kind !== "future_shop") return undefined;
  const profile = shuffleDeterministic(
    args.drawContext,
    `${args.label}:future-shop-trade-profile`,
    FUTURE_SHOP_DISCOUNT_BANDS[args.stage],
  )[0]!;

  return {
    text: `At the next future Shop, trade this hook for a ${profile.amount} essence discount.`,
    resolutionText: `At that shop, trade this hook for a ${profile.amount} essence discount.`,
    expiration: expirationPolicy(
      "discard_obligation",
      "If no future Shop appears within 2 dreamscapes, discard this hook.",
    ),
    duration: boundedDurationPayload("shop_count", "next future shop", 1),
    controlledScene: controlledScenePayload(
      "trade",
      `${profile.amount} essence Shop discount`,
    ),
    reward: shopPayload({
      kind: "future_shop_trade_hook",
      scope: "future_shops",
      duration: "next future shop",
      amount: profile.amount,
      count: 1,
      siteType: "Shop",
      hook: `spend this hook for a ${profile.amount} essence discount`,
    }),
    effect: profile.effect,
    uncertainty: -14,
    keySuffix: `trade-${profile.amount}`,
    triggerSelector: {
      triggerKind: "future_shop",
      label: "at the next future shop",
      count: 1,
    },
    trackedCondition: "Track the next future Shop site.",
  };
}

function futureJourneyOption(args: ResolutionPayloadArgs): ResolutionPayload | undefined {
  if (args.trigger.kind !== "future_dream_journey") return undefined;
  const profile = shuffleDeterministic(
    args.drawContext,
    `${args.label}:future-journey-option-profile`,
    FUTURE_JOURNEY_OPTION_BANDS[args.stage],
  )[0]!;
  const optionWord = profile.optionCount === 1 ? "" : "s";

  return {
    text: `At the next Dream Journey site, start with ${profile.optionCount} extra option${optionWord}.`,
    resolutionText: `The next Dream Journey starts with ${profile.optionCount} extra option${optionWord}.`,
    expiration: expirationPolicy(
      "discard_obligation",
      "If no Dream Journey site appears within 2 dreamscapes, discard this hook.",
    ),
    duration: boundedDurationPayload("journey_count", "next Dream Journey site", 1),
    controlledScene: controlledScenePayload(
      "reward",
      `next Dream Journey has ${profile.optionCount} extra option${optionWord}`,
    ),
    reward: statusPayload({
      kind: "status_reward_replacement",
      statusName: "Widened Journey",
      statusScope: "quest",
      duration: "one_time",
      ruleMutationKind: "reward_replacement",
      replacement: `${profile.optionCount} extra Dream Journey option${optionWord}`,
      amount: profile.optionCount,
    }),
    effect: profile.effect,
    uncertainty: -12,
    keySuffix: `extra-options-${profile.optionCount}`,
    triggerSelector: {
      triggerKind: "future_dream_journey",
      label: "at the next Dream Journey site",
      count: 1,
    },
    trackedCondition: "Track the next Dream Journey site you enter.",
  };
}

function statusRewardReplacement(args: ResolutionPayloadArgs): ResolutionPayload | undefined {
  // Reuse the future-journey-option resolution as the canonical
  // status_reward_replacement, but expose it under a distinct kind so consumers
  // can target the rule-mutation surface directly.
  return futureJourneyOption(args);
}

function futureJourneyRouteEdit(args: ResolutionPayloadArgs): ResolutionPayload | undefined {
  if (args.trigger.kind !== "future_dream_journey") return undefined;
  const routeReward = routeEditRewards({
    drawContext: args.drawContext,
    label: `${args.label}:future-dream-journey-route`,
    count: 1,
    operationKinds: ["add_site"],
    scopes: ["current_dreamscape"],
    polarities: ["positive"],
  })[0];
  if (!routeReward) return undefined;

  return {
    text: `At the next Dream Journey site, ${lowerFirst(routeReward.text)}`,
    resolutionText: `At the next Dream Journey site, ${lowerFirst(routeReward.text)}`,
    expiration: expirationPolicy(
      "discard_obligation",
      "If no Dream Journey site appears within 2 dreamscapes, discard this hook.",
    ),
    duration: boundedDurationPayload("journey_count", "next Dream Journey site", 1),
    controlledScene: controlledScenePayload(
      "reward",
      lowerFirst(routeReward.text).replace(/\.$/u, ""),
    ),
    reward: routeReward.payload,
    effect: routeReward.effect,
    uncertainty: -12,
    keySuffix: routeReward.key,
    triggerSelector: {
      triggerKind: "future_dream_journey",
      label: "at the next Dream Journey site",
      count: 1,
    },
    trackedCondition: "Track the next Dream Journey site you enter.",
  };
}

function cardDraft(args: ResolutionPayloadArgs): ResolutionPayload | undefined {
  // Generic card-draft resolution available off any "observable" trigger.
  // Drafts a small bundle from the catalog; no content lookup required.
  if (!args.trigger.producesObservableEvent) return undefined;
  const takeCount = 1;
  const choiceCount = 4;

  return {
    text: `${args.trigger.defaultLabel.replace(/^./u, (c) => c.toUpperCase())}, draft ${takeCount} of ${choiceCount} cards.`,
    resolutionText: `Draft ${takeCount} of ${choiceCount} cards.`,
    expiration: expirationPolicy(
      "forfeit_reward",
      "If the trigger does not occur within 2 dreamscapes, discard the draft.",
    ),
    duration: boundedDurationPayload("dreamscape_count", "within 2 dreamscapes", 2),
    controlledScene: controlledScenePayload(
      "reward",
      `draft ${takeCount} of ${choiceCount} cards`,
    ),
    reward: {
      kind: "card_draft",
      cardOperationKind: "draft",
      takeCount,
      choiceCount,
      source: "catalog",
      timing: args.trigger.defaultLabel,
    },
    effect: 110,
    uncertainty: -12,
  };
}

// ---------- The registry ----------

export const RESOLUTION_REGISTRY: readonly ResolutionEntry[] = [
  {
    kind: "card_draft",
    producesPayload: cardDraft,
    requiresResource: "none",
    compatibleStages: ALL_STAGES,
    weight: 1,
  },
  {
    kind: "card_purge",
    producesPayload: cardPurge,
    requiresResource: "none",
    compatibleStages: ALL_STAGES,
    weight: 1,
  },
  {
    kind: "essence_gain",
    producesPayload: essenceGain,
    requiresResource: "none",
    compatibleStages: ALL_STAGES,
    weight: 1,
  },
  {
    kind: "omen_gain",
    producesPayload: omenGain,
    requiresResource: "none",
    compatibleStages: ALL_STAGES,
    weight: 1,
  },
  {
    kind: "named_card_grant",
    producesPayload: namedCardGrant,
    requiresResource: "none",
    compatibleStages: ALL_STAGES,
    weight: 1,
  },
  {
    kind: "named_dreamsign_grant",
    producesPayload: namedDreamsignGrant,
    requiresResource: "none",
    compatibleStages: ALL_STAGES,
    weight: 1,
  },
  {
    kind: "card_duplicate",
    producesPayload: cardDuplicate,
    requiresResource: "card",
    compatibleStages: ALL_STAGES,
    weight: 1,
  },
  {
    kind: "card_transform",
    producesPayload: cardTransform,
    requiresResource: "card",
    compatibleStages: ALL_STAGES,
    weight: 1,
  },
  {
    kind: "dreamsign_transform",
    producesPayload: dreamsignTransform,
    requiresResource: "essence",
    compatibleStages: ALL_STAGES,
    weight: 1,
  },
  {
    kind: "bane_transform_to_card",
    producesPayload: baneTransformToCard,
    requiresResource: "none",
    compatibleStages: ALL_STAGES,
    weight: 1,
  },
  {
    kind: "future_shop_discount",
    producesPayload: futureShopDiscount,
    requiresResource: "essence",
    compatibleStages: ALL_STAGES,
    weight: 1,
  },
  {
    kind: "future_shop_trade_hook",
    producesPayload: futureShopTradeHook,
    requiresResource: "essence",
    compatibleStages: ALL_STAGES,
    weight: 1,
  },
  {
    kind: "delayed_bane_arrival",
    producesPayload: delayedBaneArrival,
    requiresResource: "none",
    compatibleStages: ALL_STAGES,
    weight: 1,
  },
  {
    kind: "status_reward_replacement",
    producesPayload: statusRewardReplacement,
    requiresResource: "none",
    compatibleStages: ALL_STAGES,
    weight: 1,
  },
  {
    kind: "future_journey_option",
    producesPayload: futureJourneyOption,
    requiresResource: "none",
    compatibleStages: ALL_STAGES,
    weight: 1,
  },
  {
    kind: "future_journey_route_edit",
    producesPayload: futureJourneyRouteEdit,
    requiresResource: "none",
    compatibleStages: ALL_STAGES,
    weight: 1,
  },
  {
    kind: "site_visit_reward",
    producesPayload: siteVisitReward,
    requiresResource: "none",
    compatibleStages: ALL_STAGES,
    weight: 1,
  },
];
