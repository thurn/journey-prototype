import type { JourneyContext } from "../../src/quest/context.js";
import type { JourneyStage } from "../../src/journey/manifest.js";
import type { ContentBundle } from "../../src/content/model.js";
import type { JourneyState } from "../../src/state/schema.js";
import type { DrawContext } from "../../src/util/rng.js";

const TEST_CONTENT_VERSION = "test-content-version";

const EMPTY_RAW_BYTES = {
  cardsToml: new Uint8Array(),
  dreamcallersToml: new Uint8Array(),
  dreamsignsToml: new Uint8Array(),
};

const EMPTY_CONTENT_BUNDLE: ContentBundle = {
  cards: [],
  dreamcallers: [],
  dreamsigns: [],
  rawBytes: EMPTY_RAW_BYTES,
};

function makeStubState(seed: string): JourneyState {
  return {
    schemaVersion: 1,
    contentVersion: TEST_CONTENT_VERSION,
    quest: {
      seed,
      dreamcaller: {
        id: "stub-dreamcaller",
        name: "Stub Dreamcaller",
        title: "the Stub",
        awakening: "Stubbed awakening text.",
      },
      resources: {
        essence: 120,
        maxEssence: 500,
        omens: 1,
        dreamscape: 0,
      },
      selectedTides: [],
      mandatoryTides: [],
      optionalSubset: [],
      deck: {
        entries: [],
        summary: { totalCards: 0, starterCards: 0, uniqueCards: 0 },
      },
      activeDreamsigns: [],
      dreamsignPoolIds: [],
      dreamsignPoolSummary: { tidalPoolCount: 0, neutralCatalogCount: 0 },
      draftPool: [],
      draftPoolSummary: {
        totalCopies: 0,
        uniqueCards: 0,
        oneCopyCards: 0,
        twoCopyCards: 0,
      },
      route: { pacingLedger: {}, unresolvedHooks: [] },
    },
    generator: {
      rootJourneyIndex: 0,
      lastJourneyId: null,
      cursors: {},
    },
    pendingJourney: null,
    history: [],
  };
}

export type TestContextOptions = {
  seed: string;
  stage?: JourneyStage;
  rootJourneyIndex?: number;
};

export type TestContextBundle = {
  context: JourneyContext;
  drawContext: DrawContext;
  stage: JourneyStage;
};

/**
 * Builds a minimal `JourneyContext` and `DrawContext` for unit tests that
 * exercise composer-level helpers without a real loaded content bundle.
 *
 * The returned context uses stub state and an empty content bundle. It is
 * suitable for tests that do not introspect the content or state. Tests that
 * need real content should construct a context via `loadContent` and
 * `buildJourneyContext` directly.
 */
export function makeTestContext(options: TestContextOptions): TestContextBundle {
  const stage: JourneyStage = options.stage ?? "mid";
  const state = makeStubState(options.seed);
  const context: JourneyContext = {
    projectRoot: process.cwd(),
    content: EMPTY_CONTENT_BUNDLE,
    state,
    contentVersion: TEST_CONTENT_VERSION,
  };
  const drawContext: DrawContext = {
    seed: options.seed,
    contentVersion: TEST_CONTENT_VERSION,
    rootJourneyIndex: options.rootJourneyIndex ?? 1,
  };

  return { context, drawContext, stage };
}
