import type { ContentBundle } from "../content/model.js";
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
  additionalCards: number;
  additionalDreamsigns: number;
};

const STAGE_PROGRESS: Record<JourneyStage, StageProgress> = {
  early: { additionalCards: 10, additionalDreamsigns: 1 },
  mid: { additionalCards: 0, additionalDreamsigns: 0 },
  late: { additionalCards: 0, additionalDreamsigns: 0 },
};

function recomputeDeckSummary(deck: QuestState["deck"], starterUnique: number): void {
  deck.summary = {
    totalCards: deck.entries.reduce((total, entry) => total + entry.copies, 0),
    starterCards: starterUnique,
    uniqueCards: deck.entries.length,
  };
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

export function simulateQuestStateForStage(args: {
  state: JourneyState;
  stage: JourneyStage;
  drawContext: DrawContext;
}): void {
  const progress = STAGE_PROGRESS[args.stage];

  appendDeterministicDraftPicks(args.state, args.drawContext, progress.additionalCards);
  appendDeterministicDreamsigns(args.state, args.drawContext, progress.additionalDreamsigns);
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
