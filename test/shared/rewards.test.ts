import { describe, expect, it } from "vitest";
import {
  REWARDS,
  getReward,
} from "../../src/journey/shared/rewards.js";
import type { JourneyContext } from "../../src/quest/context.js";
import type { DrawContext } from "../../src/util/rng.js";

const draw: DrawContext = {
  seed: "rewards-test", contentVersion: "v1", rootJourneyIndex: 0,
};

function fakeCtx(overrides: Partial<JourneyContext["state"]["quest"]["resources"]> = {}): JourneyContext {
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
        seed: "rewards-test",
        dreamcaller: { id: "x", name: "x", title: "x", awakening: "x" },
        resources: { essence: 100, maxEssence: 200, omens: 0, dreamscape: 1, ...overrides },
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

describe("rewards table (resource family)", () => {
  it("registers gain_essence with positive CEC", () => {
    const t = getReward("gain_essence");
    const p = t.rollParams(fakeCtx(), draw);
    expect(t.viable(p, fakeCtx())).toBe(true);
    expect(t.cec(p, fakeCtx())).toBeGreaterThan(0);
    expect(t.render(p, fakeCtx())).toMatch(/Gain \d+ essence/);
  });

  it("gain_essence rolls X in {50,55,...,200}", () => {
    const t = getReward("gain_essence");
    for (let i = 0; i < 50; i += 1) {
      const p = t.rollParams(fakeCtx(), { ...draw, sequenceStep: i });
      const text = t.render(p, fakeCtx());
      const match = text.match(/Gain (\d+) essence/);
      expect(match).not.toBeNull();
      const x = Number(match![1]);
      expect(x).toBeGreaterThanOrEqual(50);
      expect(x).toBeLessThanOrEqual(200);
      expect(x % 5).toBe(0);
    }
  });

  it("registers gain_omens, gain_max_essence, set_essence_to_percent_of_max, gain_essence_random_range, gain_essence_to_max", () => {
    for (const id of [
      "gain_omens", "gain_max_essence", "set_essence_to_percent_of_max",
      "gain_essence_random_range", "gain_essence_to_max",
    ]) {
      const t = getReward(id);
      const p = t.rollParams(fakeCtx(), draw);
      expect(t.viable(p, fakeCtx())).toBe(true);
      expect(t.cec(p, fakeCtx())).toBeGreaterThanOrEqual(0);
      expect(t.render(p, fakeCtx())).not.toBe("");
    }
  });

  it("REWARDS is frozen and unique by id", () => {
    expect(Object.isFrozen(REWARDS)).toBe(true);
    const ids = REWARDS.map((r) => r.id);
    expect(ids.length).toBe(new Set(ids).size);
  });
});
