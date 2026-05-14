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
) {
  return entries?.find((entry) => entry.kind === kind);
}

function visibleRewardLines(text: string): string[] {
  const lines = text.split("\n");

  expect(lines[0]).toMatch(/^Lose \d+ essence\. Gain one of the following at random:$/u);
  return lines.slice(1);
}

describe("single_random_outcome fill", () => {
  it("declares one meaningful root option before automatic leave is applied", () => {
    expect(singleRandomOutcomePlugin.definition).toMatchObject({
      topology: "random_commit",
      rootOptionCount: { min: 1, max: 1 },
    });
  });

  it("builds one costed random reward option with three visible rewards", () => {
    const fill = singleRandomOutcomePlugin.fill({
      context: fakeContext(),
      drawContext: fakeDraw("shared-reward-random"),
      stage: "mid" as JourneyStage,
    });

    expect(fill.options).toHaveLength(1);
    expect(fill.rewardPool).toBeUndefined();
    expect(fill.precommitted.random?.length).toBe(2);

    const [option] = fill.options;
    expect(option).toMatchObject({
      number: 1,
      symbols: ["cost", "random", "reward"],
      operations: [],
      effects: [],
      pickBehavior: "record_and_generate_next",
    });
    expect(option!.costs).toHaveLength(1);
    expect(option!.costConvertedEssence).toBeGreaterThan(0);
    expect(option!.effectConvertedEssence).toBeGreaterThan(0);
    expect(option!.uncertaintyConvertedEssence).toBeLessThan(0);

    const rewardLines = visibleRewardLines(option!.text);
    expect(rewardLines).toHaveLength(3);
    expect(rewardLines.every((line) => /^- .+/u.test(line))).toBe(true);

    const visiblePool = randomEntry(fill.precommitted.random, "visible_pool");
    expect(visiblePool).toMatchObject({
      kind: "visible_pool",
      rewards: expect.any(Array),
    });
    expect(visiblePool?.rewards).toHaveLength(3);

    const randomReward = randomEntry(fill.precommitted.random, "gain_one_random_reward");
    expect(randomReward).toMatchObject({
      kind: "gain_one_random_reward",
      optionNumber: 1,
      rewards: visiblePool?.rewards,
      committedReward: expect.any(Array),
      presentation: "single_random_outcome_gain_one_random_reward",
    });
  });

  it("is deterministic for the same draw context", () => {
    const args = {
      context: fakeContext(),
      drawContext: fakeDraw("deterministic"),
      stage: "late" as JourneyStage,
    };

    const first = singleRandomOutcomePlugin.fill(args);
    const second = singleRandomOutcomePlugin.fill(args);

    expect(first.options).toHaveLength(1);
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
      expect(fill.options).toHaveLength(1);
      for (const option of fill.options) {
        expect(option.text).not.toMatch(/\bprecommitted\b/i);
        expect(option.text).not.toMatch(/\bcommitted outcome\b/i);
      }
    }
  });

  it("keeps the visible random reward list to exactly three rewards across audit seeds", () => {
    const stages: readonly JourneyStage[] = ["early", "mid", "late"];

    for (const stage of stages) {
      for (let index = 1; index <= 10; index += 1) {
        const seed = `audit:single_random_outcome:${stage}:${String(index).padStart(2, "0")}`;
        const fill = fillFor(seed, stage);
        const [option] = fill.options;

        expect(fill.options, seed).toHaveLength(1);
        expect(visibleRewardLines(option!.text), seed).toHaveLength(3);
        expect(randomEntry(fill.precommitted.random, "visible_pool")?.rewards, seed).toHaveLength(3);
      }
    }
  });
});
