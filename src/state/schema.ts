import type { JourneyManifest } from "../journey/manifest.js";
import type { JourneyShapeId } from "../journey/shapes.js";

export const STATE_SCHEMA_VERSION: 1 = 1;

export type QuestState = {
  seed: string;
  dreamcaller: {
    id: string;
    name: string;
    title: string;
    awakening: string;
  };
  resources: {
    essence: number;
    maxEssence: number;
    omens: number;
    dreamscape: number;
  };
  selectedTides: string[];
  mandatoryTides: string[];
  optionalSubset: string[];
  deck: {
    entries: { cardId: string; copies: number }[];
    summary: {
      totalCards: number;
      starterCards: number;
      uniqueCards: number;
    };
  };
  activeDreamsigns: { dreamsignId: string }[];
  dreamsignPoolIds: string[];
  dreamsignPoolSummary: {
    tidalPoolCount: number;
    neutralCatalogCount: number;
  };
  draftPool: { cardId: string; copies: number }[];
  draftPoolSummary: {
    totalCopies: number;
    uniqueCards: number;
    oneCopyCards: number;
    twoCopyCards: number;
  };
  route: {
    pacingLedger: Record<string, unknown>;
    unresolvedHooks: unknown[];
  };
};

export type GeneratorState = {
  rootJourneyIndex: number;
  lastJourneyId: string | null;
  cursors: Record<string, number>;
};

export type PickHistoryEntry = {
  journeyId: string;
  shapeId: JourneyShapeId;
  sequenceStep?: number;
  selectedOptionNumber: number;
  selectedOptionText: string;
  effectSimulation: "not_applied";
};

export type JourneyState = {
  schemaVersion: 1;
  contentVersion: string;
  quest: QuestState;
  generator: GeneratorState;
  pendingJourney: JourneyManifest | null;
  history: PickHistoryEntry[];
};
