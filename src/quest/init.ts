import type { ContentBundle } from "../content/model.js";
import type { JourneyState, QuestState } from "../state/schema.js";
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
