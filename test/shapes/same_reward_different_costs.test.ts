import { describe, expect, it } from "vitest";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import type { JourneyContext } from "../../src/quest/context.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import { createInitialJourneyState, simulateQuestStateForStage } from "../../src/quest/init.js";
import type { JourneyStage } from "../../src/journey/manifest.js";
import type { DrawContext } from "../../src/util/rng.js";
import { sameRewardDifferentCostsPlugin } from "../../src/journey/shapes/same_reward_different_costs/index.js";

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
        seed: "srdc-test",
        dreamcaller: { id: "x", name: "x", title: "x", awakening: "x" },
        resources: { essence: 100, maxEssence: 200, omens: 1, dreamscape: 1 },
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
        route: { pacingLedger: {}, unresolvedHooks: [] },
      },
    },
  } as JourneyContext;
}

function fakeDraw(seed: string): DrawContext {
  return { seed, contentVersion: "v1", rootJourneyIndex: 0 };
}

function strippedText(text: string): string {
  return text.replace(/^\[LOCKED\]\s*/u, "");
}

function rewardText(text: string): string {
  return strippedText(text).replace(/^Cost: .+\. Reward: /u, "");
}

function costText(text: string): string {
  return strippedText(text).replace(/^Cost: /u, "").replace(/\. Reward: .+$/u, "");
}

function isCurrentEssenceCost(text: string): boolean {
  return /^Lose (?:\d+|\d+-\d+) essence(?: \(random roll\))?$/u.test(text)
    || /^Lose \d+% of your essence$/u.test(text)
    || text === "Lose all remaining essence";
}

describe("same_reward_different_costs fill", () => {
  it("produces three text-only options with one shared reward and distinct costs", () => {
    for (let index = 0; index < 30; index += 1) {
      const fill = sameRewardDifferentCostsPlugin.fill({
        context: fakeCtx(),
        drawContext: fakeDraw(`srdc-${index}`),
        stage: "mid" as JourneyStage,
      });

      expect(fill.options).toHaveLength(3);
      expect(fill.symmetryContracts).toBeUndefined();
      expect(new Set(fill.options.map((option) => rewardText(option.text))).size).toBe(1);
      expect(new Set(fill.options.map((option) => costText(option.text))).size).toBe(3);
      expect(new Set(fill.options.map((option) => option.effectConvertedEssence)).size).toBe(1);
      expect(new Set(fill.options.map((option) => option.costConvertedEssence)).size).toBe(3);

      for (const option of fill.options) {
        expect(option.symbols).toEqual([]);
        expect(strippedText(option.text)).toMatch(/^Cost: .+\. Reward: .+/u);
        expect(option.operations).toEqual([]);
        expect(option.costs).toEqual([]);
        expect(option.effects).toEqual([]);
        expect(option.burdens).toEqual([]);
        expect(option.targets).toEqual([]);
        expect(option.triggers).toEqual([]);
        expect(option.routeEffects).toEqual([]);
        expect(option.costConvertedEssence).toBeGreaterThan(0);
        expect(option.effectConvertedEssence).toBeGreaterThan(0);
        expect(option.netConvertedEssence).toBe(
          option.effectConvertedEssence - option.costConvertedEssence,
        );
      }
    }
  });
  it("keeps audit regression offers unlocked and non-dominated", async () => {
    const cases: Array<{ seed: string; stage: JourneyStage }> = [
      { seed: "audit:same_reward_different_costs:early:06", stage: "early" },
      { seed: "audit:same_reward_different_costs:mid:10", stage: "mid" },
      { seed: "audit:same_reward_different_costs:late:04", stage: "late" },
      { seed: "audit:same_reward_different_costs:early:10", stage: "early" },
    ];
    const { content, contentVersion } = await loadContentContext(process.cwd());

    for (const { seed, stage } of cases) {
      const state = createInitialJourneyState({ seed, content, contentVersion });
      simulateQuestStateForStage({
        state,
        stage,
        drawContext: { seed, contentVersion, rootJourneyIndex: 0 },
      });
      const context = buildJourneyContext({
        projectRoot: process.cwd(),
        content,
        state,
        contentVersion,
      });
      const manifest = generateNextJourney({
        context,
        forcedShapeId: "same_reward_different_costs",
        forcedStage: stage,
      });

      expect(manifest.options.some((option) => option.text.includes("[LOCKED]"))).toBe(false);
      const currentEssenceCostCount = manifest.options.filter((option) =>
        isCurrentEssenceCost(costText(option.text))
      ).length;
      expect(currentEssenceCostCount).toBeLessThanOrEqual(1);
    }
  });

  it("keeps broad transfiguration regression rewards below runaway all-predicate offers", async () => {
    const cases: Array<{ seed: string; stage: JourneyStage }> = [
      { seed: "audit:same_reward_different_costs:early:06", stage: "early" },
      { seed: "audit:same_reward_different_costs:mid:06", stage: "mid" },
      { seed: "audit:same_reward_different_costs:late:05", stage: "late" },
    ];
    const { content, contentVersion } = await loadContentContext(process.cwd());

    for (const { seed, stage } of cases) {
      const state = createInitialJourneyState({ seed, content, contentVersion });
      simulateQuestStateForStage({
        state,
        stage,
        drawContext: { seed, contentVersion, rootJourneyIndex: 0 },
      });
      const context = buildJourneyContext({
        projectRoot: process.cwd(),
        content,
        state,
        contentVersion,
      });
      const manifest = generateNextJourney({
        context,
        forcedShapeId: "same_reward_different_costs",
        forcedStage: stage,
      });

      for (const option of manifest.options) {
        expect(rewardText(option.text)).not.toMatch(/^Apply .+ to all /u);
        expect(option.effectConvertedEssence).toBeLessThan(1000);
      }
    }
  });
});
