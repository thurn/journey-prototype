import type { JourneyState } from "../../src/state/schema.js";

export function minimalState(
  overrides: Partial<JourneyState> = {},
): JourneyState {
  return {
    schemaVersion: 1,
    contentVersion: "content-version",
    quest: {
      seed: "default",
      dreamcaller: {
        id: "dreamcaller-1",
        name: "Dreamcaller",
        title: "Title",
        awakening: "5",
      },
      resources: {
        essence: 120,
        maxEssence: 500,
        omens: 1,
        dreamscape: 0,
      },
      selectedTides: ["tide-a"],
      mandatoryTides: ["tide-a"],
      optionalSubset: [],
      deck: {
        entries: [{ cardId: "starter-1", copies: 1 }],
        summary: {
          totalCards: 1,
          starterCards: 1,
          uniqueCards: 1,
        },
      },
      activeDreamsigns: [],
      banes: [],
      dreamsignPoolIds: ["dreamsign-1"],
      dreamsignPoolSummary: {
        tidalPoolCount: 1,
        neutralCatalogCount: 0,
      },
      draftPool: [{ cardId: "card-1", copies: 2 }],
      draftPoolSummary: {
        totalCopies: 2,
        uniqueCards: 1,
        oneCopyCards: 0,
        twoCopyCards: 1,
      },
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
    ...overrides,
  };
}
