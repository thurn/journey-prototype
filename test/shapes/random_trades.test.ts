import { describe, expect, it } from "vitest";
// Import the validate barrel first so the shapes registry finishes loading
// before our shape plugin module is evaluated. This avoids a known circular
// import (shared.ts -> validate/tree.ts -> shapes.ts -> registry -> shapes/*/index.ts -> shared.ts).
import "../../src/journey/validate/index.js";
import { randomTradesPlugin } from "../../src/journey/shapes/random_trades/index.js";
import type { JourneyContext } from "../../src/quest/context.js";
import type { JourneyStage } from "../../src/journey/manifest.js";
import type { DrawContext } from "../../src/util/rng.js";

function fakeCtx(essence = 100): JourneyContext {
  return {
    projectRoot: "",
    contentVersion: "v1",
    content: { cards: [], dreamcallers: [], dreamsigns: [], rawBytes: {} as never },
    state: {
      schemaVersion: 1,
      contentVersion: "v1",
      generator: { rootJourneyIndex: 0, lastJourneyId: null, cursors: {} },
      pendingJourney: null,
      history: [],
      quest: {
        seed: "rt-test",
        dreamcaller: { id: "x", name: "x", title: "x", awakening: "x" },
        resources: { essence, maxEssence: 200, omens: 1, dreamscape: 1 },
        selectedTides: [], mandatoryTides: [], optionalSubset: [],
        deck: { entries: [], summary: { totalCards: 0, starterCards: 0, uniqueCards: 0 } },
        activeDreamsigns: [], dreamsignPoolIds: [],
        dreamsignPoolSummary: { tidalPoolCount: 0, neutralCatalogCount: 0 },
        draftPool: [],
        draftPoolSummary: { totalCopies: 0, uniqueCards: 0, oneCopyCards: 0, twoCopyCards: 0 },
        route: { pacingLedger: {}, unresolvedHooks: [] },
      },
    },
  } as JourneyContext;
}

function fakeDraw(seed: string): DrawContext {
  return { seed, contentVersion: "v1", rootJourneyIndex: 0 };
}

describe("random_trades fill", () => {
  it("always produces exactly 3 options", () => {
    for (let i = 0; i < 30; i += 1) {
      const fill = randomTradesPlugin.fill({
        context: fakeCtx(),
        drawContext: fakeDraw(`rt-opt-${i}`),
        stage: "mid" as JourneyStage,
      });
      expect(fill.options).toHaveLength(3);
    }
  });

  it("is deterministic", () => {
    const a = randomTradesPlugin.fill({
      context: fakeCtx(),
      drawContext: fakeDraw("rt-det"),
      stage: "mid" as JourneyStage,
    });
    const b = randomTradesPlugin.fill({
      context: fakeCtx(),
      drawContext: fakeDraw("rt-det"),
      stage: "mid" as JourneyStage,
    });
    expect(a.options.map((o) => o.text)).toEqual(b.options.map((o) => o.text));
  });

  it("net CECs cluster around row 1's net CEC", () => {
    for (let i = 0; i < 30; i += 1) {
      const fill = randomTradesPlugin.fill({
        context: fakeCtx(),
        drawContext: fakeDraw(`rt-net-${i}`),
        stage: "mid" as JourneyStage,
      });
      const nets = fill.options.map((o) => o.netConvertedEssence);
      const spread = Math.max(...nets) - Math.min(...nets);
      // Initial tolerance is +/-15, widening by +/-10 each step. Very generous ceiling.
      expect(spread).toBeLessThanOrEqual(500);
    }
  });

  it("[LOCKED] appears for unaffordable pay_essence rolls", () => {
    let saw = false;
    for (let i = 0; i < 80 && !saw; i += 1) {
      const fill = randomTradesPlugin.fill({
        context: fakeCtx(0),
        drawContext: fakeDraw(`rt-lock-${i}`),
        stage: "mid" as JourneyStage,
      });
      if (fill.options.some((o) => o.text.includes("[LOCKED]"))) saw = true;
    }
    expect(saw).toBe(true);
  });
});
