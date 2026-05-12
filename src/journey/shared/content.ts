import {
  ALLOWED_TRANSFIGURATIONS,
  BANE_NAMES,
  SITE_TYPES,
  isCardEligibleForTransfiguration,
  resolveCardTargets,
  resolveDreamsignTargets,
  type CardTargetPredicate,
  type DreamsignTargetPredicate,
} from "../effects.js";
import type { CardContent, DreamsignContent } from "../../content/model.js";
import type { JourneyContext } from "../../quest/context.js";
import { drawInt, type DrawContext } from "../../util/rng.js";

export { ALLOWED_TRANSFIGURATIONS, BANE_NAMES, SITE_TYPES, isCardEligibleForTransfiguration };

export function transfigurationsEligibleForPredicate(
  ctx: JourneyContext,
  predicate: CardTargetPredicate,
): readonly string[] {
  // A named transfiguration may be paired with a predicate-keyed reward only
  // if every card in the predicate's match set is eligible for that
  // transfiguration. Using the subset criterion (rather than overlap) means
  // a reward like "Apply Bronze to 3 chosen cards with a 'discard' ability"
  // is rejected, because the discard predicate matches both events and
  // characters and the player could pick a character — for which Bronze
  // cannot be applied. The events predicate is the only predicate whose
  // match set is strictly a subset of the Bronze/Azure eligibility set.
  const matches = cardMatches(ctx, predicate);
  if (matches.length === 0) {
    return ALLOWED_TRANSFIGURATIONS;
  }
  return ALLOWED_TRANSFIGURATIONS.filter((transfiguration) =>
    matches.every((card) => isCardEligibleForTransfiguration(transfiguration, card)),
  );
}

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

export function baneCount(ctx: JourneyContext): number {
  return ctx.state.quest.banes.length;
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
