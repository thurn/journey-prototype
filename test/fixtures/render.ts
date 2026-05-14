import {
  MANIFEST_CONTRACT_VERSION,
  MANIFEST_SCHEMA_VERSION,
  type JourneyManifest,
} from "../../src/journey/manifest.js";
import { buildJourneyOptionOperations } from "../../src/journey/operationBuilders.js";
import type { JourneyState } from "../../src/state/schema.js";

export function fixtureState(): JourneyState {
  return {
    schemaVersion: 1,
    contentVersion: "test-content",
    quest: {
      seed: "seed-a",
      dreamcaller: {
        id: "dc-1",
        name: "Mira",
        title: "Lantern Keeper",
        awakening: "wake",
      },
      resources: {
        essence: 5,
        maxEssence: 10,
        omens: 1,
        dreamscape: 2,
      },
      selectedTides: ["ember"],
      mandatoryTides: [],
      optionalSubset: [],
      deck: {
        entries: [],
        summary: {
          totalCards: 0,
          starterCards: 0,
          uniqueCards: 0,
        },
      },
      activeDreamsigns: [],
      banes: [],
      dreamsignPoolIds: [],
      dreamsignPoolSummary: {
        tidalPoolCount: 0,
        neutralCatalogCount: 0,
      },
      draftPool: [],
      draftPoolSummary: {
        totalCopies: 0,
        uniqueCards: 0,
        oneCopyCards: 0,
        twoCopyCards: 0,
      },
      route: {
        pacingLedger: {},
        unresolvedHooks: [],
      },
    },
    generator: {
      rootJourneyIndex: 1,
      lastJourneyId: "J-000001",
      cursors: {},
    },
    pendingJourney: null,
    history: [],
  };
}

export function fixtureManifest(): JourneyManifest {
  const option = {
    number: 1,
    symbols: ["cost"],
    text: "Spend a spark.",
    costs: [{ kind: "essence", amount: 1 }],
    effects: [{ kind: "gain_essence", amount: 2 }],
    burdens: [{ kind: "bane_gain", count: 1, baneName: "Fatigue" }],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 999,
    effectConvertedEssence: 999,
    burdenConvertedEssence: 999,
    uncertaintyConvertedEssence: 999,
    netConvertedEssence: 999,
    pickBehavior: "record_and_generate_next" as const,
  };

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    versions: {
      contentVersion: "test-content",
      shapeCatalogVersion: "journey-shapes:v26",
      effectCatalogVersion: "effects:v6",
      valueModelVersion: "value:v8",
      rendererVersion: "renderer:v1",
      manifestContractVersion: MANIFEST_CONTRACT_VERSION,
    },
    journeyId: "J-000001",
    seed: "seed-a",
    rootJourneyIndex: 1,
    shapeId: "single_offer",
    stage: "early",
    dreamscape: 2,
    selectedTags: ["ember"],
    generatedObjects: [],
    options: [
      {
        ...option,
        operations: buildJourneyOptionOperations(option),
      },
    ],
    precommitted: {},
    debug: {
      shapeScores: [{ shapeId: "single_offer", score: 7 }],
      selectedShapeId: "single_offer",
      selectedTags: ["ember"],
      optionValues: [
        {
          optionNumber: 1,
          cost: 11,
          effect: 22,
          burden: -3,
          uncertainty: -4,
          net: 4,
          detail: [
            "Cost: canonical cost detail.",
            "Effect: canonical effect detail.",
            "Burden: canonical burden detail.",
            "Uncertainty: canonical uncertainty detail.",
            "Net: canonical net detail.",
          ],
        },
      ],
    },
    references: {
      cardIds: [],
      dreamsignIds: [],
      dreamcallerIds: [],
      baneNames: [],
    },
  };
}
