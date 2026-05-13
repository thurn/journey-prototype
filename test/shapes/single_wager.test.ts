import { describe, expect, it } from "vitest";
// Import the validate barrel first so the shapes registry finishes loading
// before this shape plugin module is evaluated.
import "../../src/journey/validate/index.js";
import { loadContentContext } from "../../src/commands/shared.js";
import { singleWagerPlugin } from "../../src/journey/shapes/single_wager/index.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import type { JourneyContext } from "../../src/quest/context.js";
import type { DrawContext } from "../../src/util/rng.js";
import type { JourneyStage } from "../../src/journey/manifest.js";
import {
  createInitialJourneyState,
  simulateQuestStateForStage,
} from "../../src/quest/init.js";

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

async function realStageContext(
  seed: string,
  stage: JourneyStage,
): Promise<{
  context: JourneyContext;
  drawContext: DrawContext;
  stage: JourneyStage;
}> {
  const { content, contentVersion } = await loadContentContext(process.cwd());
  const state = createInitialJourneyState({ seed, content, contentVersion });
  const drawContext = {
    seed,
    contentVersion,
    rootJourneyIndex: state.generator.rootJourneyIndex,
  };

  simulateQuestStateForStage({ state, stage, drawContext });

  return {
    context: buildJourneyContext({
      projectRoot: process.cwd(),
      content,
      state,
      contentVersion,
    }),
    drawContext,
    stage,
  };
}

function comparableNetSpread(nets: readonly number[]): boolean {
  const spread = Math.abs(nets[0]! - nets[1]!);
  const magnitude = Math.max(Math.abs(nets[0]!), Math.abs(nets[1]!));

  return spread <= Math.max(50, magnitude * 0.35);
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
        /^Pay \d+ essence\. \d+% chance\. On success: .+; on failure: gain nothing\.$/u,
      );
      expect(option.text).not.toContain("chance to");
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

  it("pairs audit-seed rewards into comparable expected-value bands", async () => {
    const cases: Array<readonly [string, JourneyStage]> = [
      ["audit:single_wager:early:02", "early"],
      ["audit:single_wager:early:08", "early"],
      ["audit:single_wager:mid:07", "mid"],
      ["audit:single_wager:mid:09", "mid"],
      ["audit:single_wager:late:04", "late"],
      ["audit:single_wager:late:08", "late"],
    ];

    for (const [seed, stage] of cases) {
      const fill = singleWagerPlugin.fill(await realStageContext(seed, stage));
      const nets = fill.options.map((option) => option.netConvertedEssence);

      expect(Math.max(...nets), seed).toBeGreaterThanOrEqual(-10);
      expect(comparableNetSpread(nets), seed).toBe(true);
    }
  });
});
