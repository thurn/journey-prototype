import {
  ALLOWED_TRANSFIGURATIONS,
  BANE_NAMES,
  SITE_TYPES,
  resolveCardTargets,
  resolveDreamsignTargets,
  type CardTargetPredicate,
  type DreamsignTargetPredicate,
} from "../effects.js";
import type { CardContent, DreamsignContent } from "../../content/model.js";
import type { JourneyContext } from "../../quest/context.js";
import { drawInt, type DrawContext } from "../../util/rng.js";

export { ALLOWED_TRANSFIGURATIONS, BANE_NAMES, SITE_TYPES };

export const POSITIVE_DREAMWELL_CARDS: readonly string[] = Object.freeze([
  "Wellspring", "Harmony", "Insight", "Refrain", "Lantern", "Echo of Dawn",
]);

export const NEGATIVE_DREAMWELL_CARDS: readonly string[] = Object.freeze([
  "Stillborn Tide", "Hollow Refrain", "Choking Ash",
  "Bitter Echo", "Sunken Lantern", "Frostbite",
]);

export function cardMatches(
  ctx: JourneyContext,
  predicate: CardTargetPredicate,
): readonly CardContent[] {
  return resolveCardTargets(ctx.content, ctx.state.quest, predicate);
}

export function dreamsignMatches(
  ctx: JourneyContext,
  predicate: DreamsignTargetPredicate = {},
): readonly DreamsignContent[] {
  return resolveDreamsignTargets(ctx.content, ctx.state.quest, predicate);
}

export function activeDreamsignCount(ctx: JourneyContext): number {
  return ctx.state.quest.activeDreamsigns.length;
}

export function starterCardCount(ctx: JourneyContext): number {
  return ctx.state.quest.deck.summary.starterCards;
}

export function essenceAmount(ctx: JourneyContext): number {
  return ctx.state.quest.resources.essence;
}

export function omenAmount(ctx: JourneyContext): number {
  return ctx.state.quest.resources.omens;
}

export function maxEssence(ctx: JourneyContext): number {
  return ctx.state.quest.resources.maxEssence;
}

// Bane state isn't currently tracked on QuestState; treat as 0 so
// bane-purging templates are never viable in v1. Documented stop-gap.
export function baneCount(_ctx: JourneyContext): number {
  return 0;
}

export function pickFromList<T>(
  draw: DrawContext,
  label: string,
  list: readonly T[],
): T {
  if (list.length === 0) {
    throw new Error(`pickFromList: empty list for label ${label}`);
  }
  const index = drawInt(draw, label, 0, list.length - 1);
  return list[index]!;
}
