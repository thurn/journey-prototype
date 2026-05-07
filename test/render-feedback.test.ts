import { describe, expect, it } from "vitest";
import { buildCommonOptions } from "../src/cli.js";
import {
  MANIFEST_CONTRACT_VERSION,
  MANIFEST_SCHEMA_VERSION,
  type JourneyManifest,
} from "../src/journey/manifest.js";
import {
  adaptJourneyOptionOperations,
  adaptPrecommittedOperations,
} from "../src/journey/operationAdapters.js";
import { createJourneyError, renderError } from "../src/render/errors.js";
import { renderJourneyHuman, renderStateHuman } from "../src/render/human.js";
import type { JourneyState } from "../src/state/schema.js";
import { ExitCode } from "../src/util/exitCodes.js";

function withStreamTty<T>(
  stream: NodeJS.WriteStream,
  isTTY: boolean,
  run: () => T,
): T {
  const descriptor = Object.getOwnPropertyDescriptor(stream, "isTTY");

  Object.defineProperty(stream, "isTTY", {
    configurable: true,
    value: isTTY,
  });

  try {
    return run();
  } finally {
    if (descriptor) {
      Object.defineProperty(stream, "isTTY", descriptor);
    } else {
      delete (stream as NodeJS.WriteStream & { isTTY?: boolean }).isTTY;
    }
  }
}

function withoutNoColor<T>(run: () => T): T {
  const previous = process.env.NO_COLOR;

  delete process.env.NO_COLOR;

  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = previous;
    }
  }
}

function fixtureState(): JourneyState {
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

function fixtureManifest(): JourneyManifest {
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
      shapeCatalogVersion: "journey-shapes:v9",
      effectCatalogVersion: "effects:v3",
      valueModelVersion: "value:v6",
      rendererVersion: "renderer:v1",
      manifestContractVersion: MANIFEST_CONTRACT_VERSION,
      validationContractVersion: "validation:v1",
    },
    journeyId: "J-000001",
    seed: "seed-a",
    rootJourneyIndex: 1,
    shapeId: "single_offer",
    stage: "early",
    dreamscape: 2,
    selectedTags: ["ember"],
    options: [
      {
        ...option,
        operations: adaptJourneyOptionOperations(option),
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
      repairs: [],
      semanticFingerprint: {
        algorithm: "semantic-fingerprint:v1",
        value: "fixture",
        components: ["shape:single_offer"],
      },
    },
    references: {
      cardIds: [],
      dreamsignIds: [],
      dreamcallerIds: [],
      baneNames: [],
    },
  };
}

describe("review feedback regressions", () => {
  it("gates error color with stderr TTY, not stdout TTY", () => {
    const options = withoutNoColor(() =>
      withStreamTty(process.stdout, true, () =>
        withStreamTty(process.stderr, false, () => buildCommonOptions({})),
      ),
    );

    expect(options.color).toBe(true);
    expect(options.stderrColor).toBe(false);

    const rendered = renderError(
      createJourneyError("boom", ExitCode.UsageOrInput),
      options,
    );

    expect(rendered.stderr).toBe("Error: boom\n");
    expect(rendered.stderr).not.toMatch(/\u001b\[/u);
  });

  it("renders human debug option values from manifest debug details", () => {
    const output = renderJourneyHuman(fixtureState(), fixtureManifest(), {
      json: false,
      debug: true,
      color: false,
    });

    expect(output).toContain("1. Cost: canonical cost detail.");
    expect(output).toContain("   Effect: canonical effect detail.");
    expect(output).toContain("   Net: canonical net detail.");
    expect(output).not.toContain("Pay 1 essence");
    expect(output).not.toContain("999 converted essence");
  });

  it("renders precommitted outcomes in human debug output", () => {
    const precommitted = {
      random: [
        { kind: "gain_essence", amount: 110 },
        {
          kind: "wager_roll",
          odds: { numerator: 50, denominator: 100, percent: 50 },
          success: { kind: "gain_essence", amount: 160 },
          failure: { kind: "no_reward" },
          roll: 73,
          committedResult: "failure",
          presentation: "visible_odds_debug_roll",
        },
        {
          kind: "card_draft",
          takeCount: 1,
          choiceCount: 4,
          predicate: { source: "draftPool", subtype: "Character" },
        },
      ],
      delayed: [
        {
          trigger: "after next victory",
          reward: { kind: "gain_omens", amount: 1 },
        },
        {
          trigger: "after next battle",
          reward: [
            {
              kind: "card_draft",
              takeCount: 1,
              choiceCount: 4,
              predicate: { source: "draftPool", cardType: "Character" },
            },
            { kind: "gain_omens", amount: 1 },
          ],
        },
      ],
    };
    const manifest: JourneyManifest = {
      ...fixtureManifest(),
      precommitted: {
        ...precommitted,
        operations: adaptPrecommittedOperations(precommitted),
      },
    };

    const output = renderJourneyHuman(fixtureState(), manifest, {
      json: false,
      debug: true,
      color: false,
    });

    expect(output).toContain("Precommitted outcomes:");
    expect(output).toContain("1. Gain 110 essence.");
    expect(output).toContain("2. 50% wager: success: Gain 160 essence. failure: Gain nothing. committed roll: failure (roll 73).");
    expect(output).toContain("3. Draft 1 of 4 cards (subtype Character; source draftPool).");
    expect(output).toContain("after next victory: Gain 1 omen.");
    expect(output).toContain("after next battle: Draft 1 of 4 cards (card type Character; source draftPool). Gain 1 omen.");
  });

  it("keeps precommitted outcomes out of normal human output unless option copy reveals them", () => {
    const precommitted = {
      random: [{ kind: "gain_essence", amount: 110 }],
    };
    const manifest: JourneyManifest = {
      ...fixtureManifest(),
      precommitted: {
        ...precommitted,
        operations: adaptPrecommittedOperations(precommitted),
      },
    };

    const output = renderJourneyHuman(fixtureState(), manifest, {
      json: false,
      debug: false,
      color: false,
    });

    expect(output).not.toContain("Precommitted outcomes:");
  });

  it("renders state history effect simulation in human-readable text", () => {
    const state = fixtureState();

    state.history.push({
      journeyId: "J-000001",
      shapeId: "single_offer",
      selectedOptionNumber: 1,
      selectedOptionText: "Spend a spark.",
      effectSimulation: "not_applied",
    });

    const output = renderStateHuman(state, {
      json: false,
      debug: true,
      color: false,
    });

    expect(output).toContain("J-000001 option 1: Spend a spark.");
    expect(output).toContain("Effect simulation: not applied");
    expect(output).not.toContain("not_applied");
  });

  it("does not expose tide terminology in human state labels", () => {
    const output = renderStateHuman(fixtureState(), {
      json: false,
      debug: true,
      color: false,
    });

    expect(output).toContain("Package selection");
    expect(output).not.toContain("Selected tides");
    expect(output).not.toContain("tidal in pool");
  });
});
