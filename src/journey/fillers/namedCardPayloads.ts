import type { CardContent } from "../../content/model.js";
import type { JourneyContext } from "../../quest/context.js";
import { shuffleDeterministic, type DrawContext } from "../../util/rng.js";
import { resolveCardTargets } from "../effects.js";
import { CARD_VALUE_CONSTANTS, PURGE_VALUE_CONSTANTS } from "../value.js";
import { selectedCardTargets } from "./shared.js";

export function cardQualityValue(card: CardContent): number {
  const rarityValue =
    card.rarity === "Rare"
      ? CARD_VALUE_CONSTANTS.namedVisibleByRarity.rare
      : card.rarity === "Uncommon"
        ? CARD_VALUE_CONSTANTS.namedVisibleByRarity.uncommon
        : card.rarity === "Starter"
          ? PURGE_VALUE_CONSTANTS.chosenStarter
          : CARD_VALUE_CONSTANTS.namedVisibleByRarity.common;
  const fastBonus =
    card.raw["is-fast"] === true || card.raw.isFast === true ? 10 : 0;
  const sparkBonus =
    typeof card.spark === "number" ? Math.min(20, card.spark * 3) : 0;

  return rarityValue + fastBonus + sparkBonus;
}

export function sourcePoolSizeForCardSource(
  context: JourneyContext,
  source: "catalog" | "deck" | "draftPool",
): number {
  switch (source) {
    case "deck":
      return context.state.quest.deck.summary.uniqueCards;
    case "draftPool":
      return context.state.quest.draftPoolSummary.uniqueCards;
    case "catalog":
      return context.content.cards.length;
  }
}

export function starterDeckCards(context: JourneyContext): CardContent[] {
  return resolveCardTargets(context.content, context.state.quest, {
    source: "deck",
    starter: true,
  });
}

export function catalogRewardCards(
  context: JourneyContext,
  drawContext: DrawContext,
): CardContent[] {
  const selectedDraftCards = selectedCardTargets(context, drawContext);
  const fallback = shuffleDeterministic(
    drawContext,
    "named-card-operation-menu:catalog-fallback",
    context.content.cards.filter((card) => card.rarity !== "Starter"),
  );

  return [...selectedDraftCards, ...fallback].filter(
    (card, index, cards) =>
      cards.findIndex((entry) => entry.id === card.id) === index,
  );
}

export function namedCardPayload(
  args: {
    kind: string;
    target?: CardContent;
    result?: CardContent;
    secondTarget?: CardContent;
    source?: "catalog" | "deck" | "draftPool";
    extra?: Record<string, unknown>;
  },
  context: JourneyContext,
): Record<string, unknown> {
  const source = args.source ?? (args.target ? "deck" : "catalog");

  return {
    kind: args.kind,
    cardOperationKind: args.kind.replace(/^card_/u, ""),
    source,
    sourcePoolSize: sourcePoolSizeForCardSource(context, source),
    timing: "immediate",
    ...(args.target
      ? {
          targetCardId: args.target.id,
          targetCardName: args.target.name,
        }
      : {}),
    ...(args.result
      ? {
          resultCardId: args.result.id,
          resultCardName: args.result.name,
          ...(!args.target
            ? {
                cardId: args.result.id,
                cardName: args.result.name,
              }
            : {}),
        }
      : {}),
    ...(args.secondTarget
      ? {
          secondTargetCardId: args.secondTarget.id,
          secondTargetCardName: args.secondTarget.name,
        }
      : {}),
    ...(args.extra ?? {}),
  };
}
