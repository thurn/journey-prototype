import type { JourneyContext } from "../../src/quest/context.js";
import type {
  JourneyManifest,
  JourneyStage,
} from "../../src/journey/manifest.js";
import type { ContentBundle } from "../../src/content/model.js";
import type { JourneyState } from "../../src/state/schema.js";
import { getShapePlugin } from "../../src/journey/shapes.js";
import type {
  JourneyShapeId,
  ShapeValidatorArgs,
} from "../../src/journey/shapes/types.js";
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
      banes: [],
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
  content?: ContentBundle;
  stateOverrides?: Partial<JourneyState["quest"]>;
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
  const baseState = makeStubState(options.seed);
  const state: JourneyState = options.stateOverrides
    ? {
        ...baseState,
        quest: { ...baseState.quest, ...options.stateOverrides },
      }
    : baseState;
  const context: JourneyContext = {
    projectRoot: process.cwd(),
    content: options.content ?? EMPTY_CONTENT_BUNDLE,
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

export type ShapeValidatorFailure = {
  ruleId: string;
  message: string;
};

export type ShapeValidatorRunResult = {
  failures: ShapeValidatorFailure[];
};

/**
 * Runs a shape plugin's `validators` against the given manifest, returning the
 * `(ruleId, message)` of every validator that returned a failure result. The
 * helper deliberately bypasses the full validation pipeline so tests can
 * exercise a single shape's bespoke rules in isolation.
 */
export function runShapeValidators(
  shapeId: JourneyShapeId,
  manifest: JourneyManifest,
): ShapeValidatorRunResult {
  const plugin = getShapePlugin(shapeId);
  const { context } = makeTestContext({ seed: `validators:${shapeId}` });
  const args: ShapeValidatorArgs = {
    manifest,
    context,
    definition: plugin.definition,
    generatedObjects: [],
  };
  const failures: ShapeValidatorFailure[] = [];

  for (const validator of plugin.validators ?? []) {
    const result = validator.validate(args);

    if (!result.ok) {
      failures.push({ ruleId: result.rule, message: result.message });
    }
  }

  return { failures };
}

/**
 * Builds a minimal `random_trades` manifest claiming the
 * `distinct_everything_trio` contract while embedding duplicate axis values.
 * The manifest is intended for validator-isolation tests of the
 * pairwise uniqueness rule and is not a fully valid
 * manifest in any other respect.
 */
export function synthesizeDistinctEverythingTrioWithDuplicates(): JourneyManifest {
  const sharedCost = { kind: "essence", amount: 80, timing: "immediate" };
  const sharedEffect = {
    kind: "card_draft",
    takeCount: 1,
    choiceCount: 4,
    predicate: { source: "draftPool" },
  };
  const sharedOption = {
    symbols: [],
    text: "Pay 80 essence. Draft a card.",
    operations: [],
    costs: [sharedCost],
    effects: [sharedEffect],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 80,
    effectConvertedEssence: 400,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: 320,
    pickBehavior: "record_and_generate_next" as const,
  };

  const duplicateKey = `essence_cost=${JSON.stringify({ amount: 80 })}`;

  return {
    schemaVersion: 2,
    versions: {
      contentVersion: TEST_CONTENT_VERSION,
      shapeCatalogVersion: "journey-shapes:test",
      effectCatalogVersion: "effects:test",
      valueModelVersion: "value:test",
      rendererVersion: "renderer:test",
      manifestContractVersion: "manifest:test",
    },
    journeyId: "J-000002",
    seed: "synth-distinct-everything-dups",
    rootJourneyIndex: 1,
    shapeId: "random_trades",
    stage: "mid",
    dreamscape: 0,
    selectedTags: [],
    options: [
      { ...sharedOption, number: 1 },
      { ...sharedOption, number: 2 },
    ],
    generatedObjects: [],
    precommitted: {},
    debug: {
      shapeScores: [],
      selectedShapeId: "random_trades",
      selectedTags: [],
      optionValues: [],
      symmetryContracts: [
        {
          contractKind: "distinct_everything_trio",
          sharedProperty: "none",
          variedProperty: "cost+reward",
          sharedFirst: false,
          optionNumbers: [1, 2],
          variedPayloadKeys: [duplicateKey, duplicateKey],
        },
      ],
      repairs: [],
      repair: {
        status: "accepted_immediately",
        forcedShape: false,
        finalShapeId: "random_trades",
      },
    },
    references: {
      cardIds: [],
      dreamsignIds: [],
      dreamcallerIds: [],
      baneNames: [],
    },
  } as unknown as JourneyManifest;
}

/**
 * Builds a minimal `random_trades` manifest where every option has
 * identical `(cost, reward)` payloads. The manifest only fills the fields
 * that the shape's validators inspect; other manifest invariants are not
 * enforced because the helper is intended for validator-isolation tests.
 */
export function synthesizeIdenticalRowsManifest(): JourneyManifest {
  const sharedCost = { kind: "essence", amount: 80, timing: "immediate" };
  const sharedEffect = {
    kind: "card_draft",
    takeCount: 1,
    choiceCount: 4,
    predicate: { source: "draftPool" },
  };
  const sharedOption = {
    symbols: [],
    text: "Pay 80 essence. Draft a card.",
    operations: [],
    costs: [sharedCost],
    effects: [sharedEffect],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 80,
    effectConvertedEssence: 400,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: 320,
    pickBehavior: "record_and_generate_next" as const,
  };

  return {
    schemaVersion: 2,
    versions: {
      contentVersion: TEST_CONTENT_VERSION,
      shapeCatalogVersion: "journey-shapes:test",
      effectCatalogVersion: "effects:test",
      valueModelVersion: "value:test",
      rendererVersion: "renderer:test",
      manifestContractVersion: "manifest:test",
    },
    journeyId: "J-000001",
    seed: "synth-identical-rows",
    rootJourneyIndex: 1,
    shapeId: "random_trades",
    stage: "mid",
    dreamscape: 0,
    selectedTags: [],
    options: [
      { ...sharedOption, number: 1 },
      { ...sharedOption, number: 2 },
    ],
    generatedObjects: [],
    precommitted: {},
    debug: {
      shapeScores: [],
      selectedShapeId: "random_trades",
      selectedTags: [],
      optionValues: [],
      repairs: [],
      repair: {
        status: "accepted_immediately",
        forcedShape: false,
        finalShapeId: "random_trades",
      },
    },
    references: {
      cardIds: [],
      dreamsignIds: [],
      dreamcallerIds: [],
      baneNames: [],
    },
  } as unknown as JourneyManifest;
}
