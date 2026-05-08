import type { CardContent } from "../../content/model.js";
import type { JourneyContext } from "../../quest/context.js";
import { shuffleDeterministic, weightedChoice, type DrawContext } from "../../util/rng.js";
import { resolveCardTargets, type CardTargetPredicate } from "../effects.js";
import type { JourneyStage, TargetResolutionOrigin } from "../manifest.js";
import { CARD_VALUE_CONSTANTS, PURGE_VALUE_CONSTANTS } from "../value.js";

export type CardSelectionSource = "catalog" | "deck" | "draftPool";

export type CardSelectionWeightHooks = {
  rarity: number;
  tideOverlap: number;
  starterStatus: number;
  currentDeckAvailability: number;
  stage: number;
};

export type ContentBackedCardSelection = {
  card: CardContent;
  source: CardSelectionSource;
  targetOrigin: TargetResolutionOrigin;
  weight: number;
  weightHooks: CardSelectionWeightHooks;
};

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

function selectedTides(context: JourneyContext): Set<string> {
  return new Set(
    context.state.quest.selectedTides.map((tide) =>
      tide.toLocaleLowerCase("en-US"),
    ),
  );
}

function cardTideOverlap(card: CardContent, context: JourneyContext): boolean {
  const tides = selectedTides(context);

  return card.tides.some((tide) => tides.has(tide.toLocaleLowerCase("en-US")));
}

function cardInCurrentDeck(card: CardContent, context: JourneyContext): boolean {
  return context.state.quest.deck.entries.some((entry) => entry.cardId === card.id);
}

function targetOriginForCardSource(source: CardSelectionSource): TargetResolutionOrigin {
  switch (source) {
    case "deck":
      return "current_object";
    case "draftPool":
      return "draft_pool_candidate";
    case "catalog":
      return "catalog_reward";
  }
}

function rarityWeight(card: CardContent, stage: JourneyStage): number {
  if (card.rarity === "Rare") {
    return stage === "late" ? 7 : stage === "mid" ? 5 : 3;
  }

  if (card.rarity === "Uncommon") {
    return stage === "early" ? 4 : 5;
  }

  if (card.rarity === "Starter") {
    return stage === "early" ? 2 : 1;
  }

  return stage === "early" ? 4 : 3;
}

function stageWeight(card: CardContent, stage: JourneyStage): number {
  if (stage === "early") {
    return card.energyCost === "*" ? 1 : Math.max(1, 4 - card.energyCost);
  }

  if (stage === "late") {
    return card.rarity === "Rare" ? 4 : card.rarity === "Uncommon" ? 2 : 1;
  }

  return card.rarity === "Starter" ? 0 : 2;
}

export function cardSelectionWeightHooks(
  card: CardContent,
  context: JourneyContext,
  stage: JourneyStage,
  source: CardSelectionSource,
): CardSelectionWeightHooks {
  return {
    rarity: rarityWeight(card, stage),
    tideOverlap: cardTideOverlap(card, context) ? 4 : 0,
    starterStatus: card.rarity === "Starter" ? (source === "deck" ? 2 : -4) : 1,
    currentDeckAvailability: cardInCurrentDeck(card, context) ? 4 : 0,
    stage: stageWeight(card, stage),
  };
}

function cardCandidateWeight(hooks: CardSelectionWeightHooks): number {
  return Math.max(
    1,
    hooks.rarity +
      hooks.tideOverlap +
      hooks.starterStatus +
      hooks.currentDeckAvailability +
      hooks.stage,
  );
}

export function cardExactTarget(
  card: CardContent,
  source: CardSelectionSource,
  description = `${card.name} in ${source}`,
) {
  return {
    kind: "card",
    description,
    predicate: {
      source,
      ids: [card.id],
      names: [card.name],
    },
    source,
    ids: [card.id],
    names: [card.name],
    selection: "exact",
    required: true,
  };
}

export function contentBackedCardCandidates(args: {
  context: JourneyContext;
  stage: JourneyStage;
  sources: readonly CardSelectionSource[];
  predicate?: Omit<CardTargetPredicate, "source">;
  includeStarters?: boolean;
}): ContentBackedCardSelection[] {
  const seen = new Set<string>();

  return args.sources.flatMap((source) => {
    const cards = resolveCardTargets(args.context.content, args.context.state.quest, {
      source,
      ...(args.predicate ?? {}),
    }).filter((card) => args.includeStarters === true || card.rarity !== "Starter");

    return cards.flatMap((card) => {
      const key = `${source}:${card.id}`;

      if (seen.has(key)) {
        return [];
      }

      seen.add(key);

      const weightHooks = cardSelectionWeightHooks(
        card,
        args.context,
        args.stage,
        source,
      );

      return [{
        card,
        source,
        targetOrigin: targetOriginForCardSource(source),
        weight: cardCandidateWeight(weightHooks),
        weightHooks,
      }];
    });
  });
}

export function selectContentBackedCard(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage: JourneyStage;
  sources: readonly CardSelectionSource[];
  predicate?: Omit<CardTargetPredicate, "source">;
  includeStarters?: boolean;
}): ContentBackedCardSelection | undefined {
  const candidates = contentBackedCardCandidates(args);

  if (candidates.length === 0) {
    return undefined;
  }

  return weightedChoice(
    args.drawContext,
    `${args.label}:content-backed-card`,
    candidates.map((candidate) => ({
      item: candidate,
      weight: candidate.weight,
    })),
  );
}

function selectedDraftPoolCards(
  context: JourneyContext,
  drawContext: DrawContext,
): CardContent[] {
  const selected = resolveCardTargets(context.content, context.state.quest, {
    source: "draftPool",
    tideOverlap: "selected",
  });
  const fallback = resolveCardTargets(context.content, context.state.quest, {
    source: "draftPool",
  });

  return shuffleDeterministic(
    drawContext,
    "targets:cards",
    selected.length > 0 ? selected : fallback,
  );
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
  const selectedDraftCards = selectedDraftPoolCards(context, drawContext);
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
