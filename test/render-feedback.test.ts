import { describe, expect, it } from "vitest";
import { buildCommonOptions } from "../src/cli.js";
import type { JourneyManifest } from "../src/journey/manifest.js";
import { createJourneyError, renderError } from "../src/render/errors.js";
import { renderJourneyHuman } from "../src/render/human.js";
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
  return {
    schemaVersion: 1,
    journeyId: "J-000001",
    seed: "seed-a",
    rootJourneyIndex: 1,
    shapeId: "single_offer",
    stage: "early",
    dreamscape: 2,
    selectedTags: ["ember"],
    options: [
      {
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
        pickBehavior: "record_and_generate_next",
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
});
