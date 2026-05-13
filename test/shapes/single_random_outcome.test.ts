import { describe, expect, it } from "vitest";
// Import the validate barrel first so the shapes registry finishes loading
// before this shape plugin module is evaluated.
import "../../src/journey/validate/index.js";
import type { JourneyStage } from "../../src/journey/manifest.js";
import { singleRandomOutcomePlugin } from "../../src/journey/shapes/single_random_outcome/index.js";
import type { JourneyContext } from "../../src/quest/context.js";
import type { DrawContext } from "../../src/util/rng.js";

function fakeContext(): JourneyContext {
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
        seed: "single-random-outcome-test",
        dreamcaller: { id: "x", name: "x", title: "x", awakening: "x" },
        resources: { essence: 100, maxEssence: 200, omens: 1, dreamscape: 1 },
        selectedTides: [],
        mandatoryTides: [],
        optionalSubset: [],
        deck: { entries: [], summary: { totalCards: 0, starterCards: 0, uniqueCards: 0 } },
        activeDreamsigns: [],
        banes: [],
        dreamsignPoolIds: [],
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

describe("single_random_outcome fill", () => {
  it("builds two choices backed by shared reward random metadata", () => {
    const fill = singleRandomOutcomePlugin.fill({
      context: fakeContext(),
      drawContext: fakeDraw("shared-reward-random"),
      stage: "mid" as JourneyStage,
    });

    expect(fill.options).toHaveLength(2);
    expect(fill.precommitted.random?.length).toBeGreaterThanOrEqual(2);

    for (const option of fill.options) {
      expect(option.operations).toEqual([]);
      expect(option.effects).toEqual([]);
      expect(option.pickBehavior).toBe("record_and_generate_next");
    }

    const serializedRandom = JSON.stringify(fill.precommitted.random);
    expect(serializedRandom).toContain("shared_reward_template");
    expect(serializedRandom).not.toContain("wheel-resource");
  });

  it("is deterministic for the same draw context", () => {
    const args = {
      context: fakeContext(),
      drawContext: fakeDraw("deterministic"),
      stage: "late" as JourneyStage,
    };

    const first = singleRandomOutcomePlugin.fill(args);
    const second = singleRandomOutcomePlugin.fill(args);

    expect(first.options).toEqual(second.options);
    expect(first.precommitted).toEqual(second.precommitted);
    expect(first.rewardPool).toEqual(second.rewardPool);
  });
});
