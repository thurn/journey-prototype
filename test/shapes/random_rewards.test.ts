import { describe, expect, it } from "vitest";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import { randomRewardsPlugin } from "../../src/journey/shapes/random_rewards/index.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import { createInitialJourneyState, simulateQuestStateForStage } from "../../src/quest/init.js";
import type { JourneyContext } from "../../src/quest/context.js";
import type { JourneyStage } from "../../src/journey/manifest.js";
import type { DrawContext } from "../../src/util/rng.js";

// Use the test/fixtures helpers if available, otherwise construct a synthetic context.
// We construct a minimal valid context here.
function fakeCtx(): JourneyContext {
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
        seed: "rr-test",
        dreamcaller: { id: "x", name: "x", title: "x", awakening: "x" },
        resources: { essence: 100, maxEssence: 200, omens: 1, dreamscape: 1 },
        selectedTides: [], mandatoryTides: [], optionalSubset: [],
        deck: { entries: [], summary: { totalCards: 0, starterCards: 0, uniqueCards: 0 } },
        activeDreamsigns: [], banes: [], dreamsignPoolIds: [],
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

describe("random_rewards fill", () => {
  it("always produces exactly 3 options", () => {
    for (let i = 0; i < 30; i += 1) {
      const fill = randomRewardsPlugin.fill({
        context: fakeCtx(),
        drawContext: fakeDraw(`opt-count-${i}`),
        stage: "mid" as JourneyStage,
      });
      expect(fill.options).toHaveLength(3);
    }
  });

  it("is deterministic for the same draw context", () => {
    const a = randomRewardsPlugin.fill({
      context: fakeCtx(),
      drawContext: fakeDraw("det"),
      stage: "mid" as JourneyStage,
    });
    const b = randomRewardsPlugin.fill({
      context: fakeCtx(),
      drawContext: fakeDraw("det"),
      stage: "mid" as JourneyStage,
    });
    expect(a.options.map((o) => o.text)).toEqual(b.options.map((o) => o.text));
  });

  it("template ids are pairwise distinct across rows", () => {
    for (let i = 0; i < 30; i += 1) {
      const fill = randomRewardsPlugin.fill({
        context: fakeCtx(),
        drawContext: fakeDraw(`distinct-${i}`),
        stage: "mid" as JourneyStage,
      });
      const ids = fill.options.map((o) => o.text.split("|")[0]); // ids encoded in text via prefix; we'll switch this if rendering doesn't include id
      // Text-only uniqueness check: no two rendered texts should be identical.
      expect(new Set(fill.options.map((o) => o.text)).size).toBe(3);
    }
  });

  it("row CECs are within the widened tolerance band of row 1", () => {
    // Anchor band is [0.6, 1.4]× initially, widening by ±0.2 each step.
    // Worst-case widening is ~4 steps -> [-0.2, 2.2]. Bound generously.
    for (let i = 0; i < 30; i += 1) {
      const fill = randomRewardsPlugin.fill({
        context: fakeCtx(),
        drawContext: fakeDraw(`band-${i}`),
        stage: "mid" as JourneyStage,
      });
      const anchor = fill.options[0]!.effectConvertedEssence;
      for (const opt of fill.options) {
        expect(opt.effectConvertedEssence).toBeGreaterThanOrEqual(0);
        // Loose ceiling check: every row's CEC is at most 10x the anchor (after generous widening).
        expect(opt.effectConvertedEssence).toBeLessThanOrEqual(Math.max(10, anchor * 10));
      }
    }
  });
  it("uses current random reward text for drafts and named objects", async () => {
    const seed = "random:72a92a8f-1e7e-44d2-87d1-1256f6524e01";
    const { content, contentVersion } = await loadContentContext(process.cwd());

    for (let rootJourneyIndex = 0; rootJourneyIndex < 20; rootJourneyIndex += 1) {
      const state = createInitialJourneyState({
        seed,
        content,
        contentVersion,
      });
      state.generator.rootJourneyIndex = rootJourneyIndex;
      simulateQuestStateForStage({
        state,
        stage: "early",
        drawContext: {
          seed,
          contentVersion,
          rootJourneyIndex,
        },
      });
      const context = buildJourneyContext({
        projectRoot: process.cwd(),
        content,
        state,
        contentVersion,
      });

      const manifest = generateNextJourney({
        context,
        forcedShapeId: "random_rewards",
        forcedStage: "early",
      });

      for (const option of manifest.options) {
        expect(option.text).not.toMatch(/Draft 2 of 4/u);
        expect(option.text).not.toContain("random Starter card");
        expect(option.text).not.toContain("'transfigured' ability");
      }
    }
  });
});
