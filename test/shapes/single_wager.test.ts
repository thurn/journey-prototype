import { describe, expect, it } from "vitest";
// Import the validate barrel first so the shapes registry finishes loading
// before this shape plugin module is evaluated.
import "../../src/journey/validate/index.js";
import { singleWagerPlugin } from "../../src/journey/shapes/single_wager/index.js";
import type { JourneyContext } from "../../src/quest/context.js";
import type { DrawContext } from "../../src/util/rng.js";
import type { JourneyStage } from "../../src/journey/manifest.js";

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
        seed: "single-wager-test",
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

describe("single_wager fill", () => {
  it("produces two visible wagers with precommitted rolls", () => {
    const fill = singleWagerPlugin.fill({
      context: fakeContext(),
      drawContext: fakeDraw("visible-wagers"),
      stage: "early" as JourneyStage,
    });

    expect(fill.options).toHaveLength(2);
    expect(fill.precommitted.random).toHaveLength(2);

    for (const option of fill.options) {
      expect(option.operations).toEqual([]);
      expect(option.text).toMatch(
        /^Pay \d+ essence\. \d+% chance to .+; otherwise gain nothing\.$/u,
      );
      expect(option.costs[0]).toMatchObject({
        kind: "shared_cost_template",
        templateId: "pay_essence",
      });
    }

    for (const wager of fill.precommitted.random ?? []) {
      expect(wager).toMatchObject({
        kind: "wager",
        stake: { kind: "shared_cost_template", templateId: "pay_essence" },
        success: { kind: "shared_reward_template" },
        failure: { kind: "no_reward" },
        presentation: "visible_odds_debug_roll",
      });
      expect(typeof wager.roll).toBe("number");
      expect(["success", "failure"]).toContain(wager.committedResult);
    }
  });

  it("is deterministic for the same draw context", () => {
    const args = {
      context: fakeContext(),
      drawContext: fakeDraw("deterministic"),
      stage: "mid" as JourneyStage,
    };

    const first = singleWagerPlugin.fill(args);
    const second = singleWagerPlugin.fill(args);

    expect(first.options).toEqual(second.options);
    expect(first.precommitted).toEqual(second.precommitted);
  });
});
