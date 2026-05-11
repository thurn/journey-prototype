import type { ContentBundle } from "../content/model.js";
import { BANE_NAMES } from "../journey/effects.js";
import type { JourneyStage } from "../journey/manifest.js";
import type { JourneyState, QuestState } from "../state/schema.js";
import { type DrawContext, shuffleDeterministic } from "../util/rng.js";
import {
  resolvePackageForDreamcaller,
  selectDreamcallerForSeed,
} from "./packageResolution.js";

export type CreateInitialStateArgs = {
  seed: string;
  content: ContentBundle;
  contentVersion: string;
};

export const QUEST_INITIALIZATION_VERSION = "quest-init:v1";

function buildStarterDeck(content: ContentBundle): QuestState["deck"] {
  const entries = content.cards
    .filter((card) => card.rarity === "Starter")
    .sort((left, right) => {
      const cardNumberComparison = left.cardNumber - right.cardNumber;

      if (cardNumberComparison !== 0) {
        return cardNumberComparison;
      }

      return left.id.localeCompare(right.id, "en-US");
    })
    .map((card) => ({ cardId: card.id, copies: 1 }));

  if (entries.length === 0) {
    throw new Error("No Starter-rarity cards are available for the starter deck");
  }

  return {
    entries,
    summary: {
      totalCards: entries.reduce((total, entry) => total + entry.copies, 0),
      starterCards: entries.length,
      uniqueCards: entries.length,
    },
  };
}

type StageProgress = {
  essence: number;
  starterCardsKept: number;
  additionalCards: number;
  additionalDreamsigns: number;
  banes: number;
};

const STAGE_PROGRESS: Record<JourneyStage, StageProgress> = {
  early: {
    essence: 120,
    starterCardsKept: 10,
    additionalCards: 10,
    additionalDreamsigns: 1,
    banes: 0,
  },
  mid: {
    essence: 400,
    starterCardsKept: 5,
    additionalCards: 25,
    additionalDreamsigns: 3,
    banes: 0,
  },
  late: {
    essence: 400,
    starterCardsKept: 0,
    additionalCards: 35,
    additionalDreamsigns: 5,
    banes: 2,
  },
};

function recomputeDeckSummary(deck: QuestState["deck"], starterUnique: number): void {
  deck.summary = {
    totalCards: deck.entries.reduce((total, entry) => total + entry.copies, 0),
    starterCards: starterUnique,
    uniqueCards: deck.entries.length,
  };
}

function purgeStarterCardsTo(
  state: JourneyState,
  drawContext: DrawContext,
  starterCardsKept: number,
): void {
  const entries = state.quest.deck.entries;
  const currentStarters = state.quest.deck.summary.starterCards;

  if (starterCardsKept >= currentStarters) {
    return;
  }

  const starterIndices = Array.from({ length: currentStarters }, (_, index) => index);
  const shuffled = shuffleDeterministic(
    drawContext,
    "stage-simulation:starter-purge",
    starterIndices,
  );
  const keepSet = new Set(shuffled.slice(0, Math.max(starterCardsKept, 0)));

  state.quest.deck.entries = entries.filter(
    (_, index) => index >= currentStarters || keepSet.has(index),
  );
  recomputeDeckSummary(state.quest.deck, Math.max(starterCardsKept, 0));
}

function appendDeterministicDraftPicks(
  state: JourneyState,
  drawContext: DrawContext,
  count: number,
): void {
  const draftPool = state.quest.draftPool;

  if (count <= 0 || draftPool.length === 0) {
    return;
  }

  const indices = Array.from({ length: draftPool.length }, (_, index) => index);
  const shuffledIndices = shuffleDeterministic(
    drawContext,
    "stage-simulation:deck-additions",
    indices,
  );
  const picked = shuffledIndices
    .slice(0, Math.min(count, draftPool.length))
    .sort((left, right) => left - right);
  const starterUnique = state.quest.deck.summary.starterCards;

  for (const index of picked) {
    const entry = draftPool[index]!;

    state.quest.deck.entries.push({ cardId: entry.cardId, copies: 1 });
  }

  recomputeDeckSummary(state.quest.deck, starterUnique);
}

function appendDeterministicDreamsigns(
  state: JourneyState,
  drawContext: DrawContext,
  count: number,
): void {
  const pool = state.quest.dreamsignPoolIds;

  if (count <= 0 || pool.length === 0) {
    return;
  }

  const shuffled = shuffleDeterministic(
    drawContext,
    "stage-simulation:dreamsign-additions",
    pool,
  );

  for (const dreamsignId of shuffled.slice(0, Math.min(count, pool.length))) {
    state.quest.activeDreamsigns.push({ dreamsignId });
  }
}

function appendDeterministicBanes(
  state: JourneyState,
  drawContext: DrawContext,
  count: number,
): void {
  if (count <= 0) {
    return;
  }

  const shuffled = shuffleDeterministic(
    drawContext,
    "stage-simulation:bane-additions",
    BANE_NAMES,
  );

  for (let index = 0; index < count; index += 1) {
    const baneName = shuffled[index % shuffled.length]!;

    state.quest.banes.push({ baneName });
  }
}

export function simulateQuestStateForStage(args: {
  state: JourneyState;
  stage: JourneyStage;
  drawContext: DrawContext;
}): void {
  const progress = STAGE_PROGRESS[args.stage];

  args.state.quest.resources.essence = Math.min(
    progress.essence,
    args.state.quest.resources.maxEssence,
  );
  purgeStarterCardsTo(args.state, args.drawContext, progress.starterCardsKept);
  appendDeterministicDraftPicks(args.state, args.drawContext, progress.additionalCards);
  appendDeterministicDreamsigns(args.state, args.drawContext, progress.additionalDreamsigns);
  appendDeterministicBanes(args.state, args.drawContext, progress.banes);
}

export function createInitialJourneyState(
  args: CreateInitialStateArgs,
): JourneyState {
  const dreamcaller = selectDreamcallerForSeed(args.seed, args.content);
  const packageResolution = resolvePackageForDreamcaller(dreamcaller, args.content);

  return {
    schemaVersion: 1,
    contentVersion: args.contentVersion,
    quest: {
      seed: args.seed,
      dreamcaller: {
        id: dreamcaller.id,
        name: dreamcaller.name,
        title: dreamcaller.title,
        awakening: dreamcaller.awakening,
      },
      resources: {
        essence: 120,
        maxEssence: 500,
        omens: 1,
        dreamscape: 0,
      },
      selectedTides: packageResolution.selectedTides,
      mandatoryTides: packageResolution.mandatoryTides,
      optionalSubset: packageResolution.optionalSubset,
      deck: buildStarterDeck(args.content),
      activeDreamsigns: [],
      banes: [],
      dreamsignPoolIds: packageResolution.dreamsignPoolIds,
      dreamsignPoolSummary: packageResolution.dreamsignPoolSummary,
      draftPool: packageResolution.draftPool,
      draftPoolSummary: packageResolution.draftPoolSummary,
      route: {
        pacingLedger: {},
        unresolvedHooks: [],
      },
    },
    generator: {
      rootJourneyIndex: 1,
      lastJourneyId: null,
      cursors: {},
    },
    pendingJourney: null,
    history: [],
  };
}
