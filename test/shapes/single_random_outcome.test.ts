import { describe, expect, it } from "vitest";
// Import the validate barrel first so the shapes registry finishes loading
// before this shape plugin module is evaluated.
import "../../src/journey/validate/index.js";
import type {
  JourneyStage,
  RandomPrecommittedOutcome,
} from "../../src/journey/manifest.js";
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

function fillFor(seed: string, stage: JourneyStage) {
  return singleRandomOutcomePlugin.fill({
    context: fakeContext(),
    drawContext: fakeDraw(seed),
    stage,
  });
}

function randomEntry(
  entries: readonly RandomPrecommittedOutcome[] | undefined,
  kind: RandomPrecommittedOutcome["kind"],
  optionNumber: number,
) {
  return entries?.find(
    (entry) => entry.kind === kind && entry.optionNumber === optionNumber,
  );
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

  it("keeps storage labels out of player-facing random copy", () => {
    const fills = [
      fillFor("audit:single_random_outcome:early:02", "early"),
      fillFor("audit:single_random_outcome:early:03", "early"),
      fillFor("audit:single_random_outcome:late:10", "late"),
    ];

    for (const fill of fills) {
      for (const option of fill.options) {
        expect(option.text).not.toMatch(/\bprecommitted\b/i);
        expect(option.text).not.toMatch(/\bcommitted outcome\b/i);
      }
    }
  });

  it("gives the random reveal row extra pool draws to compete with selection", () => {
    const fill = fillFor("audit:single_random_outcome:early:02", "early");
    const [selectedRow, randomRow] = fill.options;

    expect(selectedRow!.costConvertedEssence).toBeGreaterThan(0);
    expect(randomRow!.text).toContain("Then gain 3 random rewards from the visible pool.");
    expect(randomRow!.netConvertedEssence).toBeGreaterThan(selectedRow!.netConvertedEssence);

    const bonusDraws = randomEntry(fill.precommitted.random, "repeated_pool_draws", 2);
    expect(bonusDraws).toMatchObject({
      kind: "repeated_pool_draws",
      drawCount: 3,
      replacement: "with_replacement",
    });
  });

  it("balances wheel rows with visible wheel benefits and tied essence rolls", () => {
    const fill = fillFor("audit:single_random_outcome:early:03", "early");
    const [wheelRow, essenceRow] = fill.options;

    expect(wheelRow!.text).toContain("Spin the visible wheel twice; gain both shown results:");
    expect(wheelRow!.costConvertedEssence).toBeGreaterThan(0);
    expect(wheelRow!.netConvertedEssence).toBeGreaterThan(0);

    expect(essenceRow!.text).toMatch(
      /^Lose \d+ essence\. Gain the better of two essence rolls: \d+ essence/,
    );
    expect(essenceRow!.text).not.toContain("random essence");
    expect(essenceRow!.costConvertedEssence).toBeGreaterThan(0);

    const range = randomEntry(fill.precommitted.random, "random_range", 2);
    expect(range).toMatchObject({
      kind: "random_range",
      committedAmount: essenceRow!.effectConvertedEssence,
    });
  });
});
