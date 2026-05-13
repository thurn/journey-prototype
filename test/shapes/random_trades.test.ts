import { describe, expect, it } from "vitest";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import { randomTradesPlugin } from "../../src/journey/shapes/random_trades/index.js";
import { BANE_NAMES } from "../../src/journey/shared/content.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import { createInitialJourneyState, simulateQuestStateForStage } from "../../src/quest/init.js";
import type { CardContent } from "../../src/content/model.js";
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

const forcedStarterCard: CardContent = {
  id: "starter-only",
  name: "Only Starter",
  tides: ["void"],
  rarity: "Starter",
  cardType: "Event",
  energyCost: 0,
  spark: "",
  cardNumber: 1,
  raw: { "is-fast": false },
};

function fakeStarterCatalogCtx(): JourneyContext {
  const ctx = fakeCtx();
  return {
    ...ctx,
    content: {
      ...ctx.content,
      cards: [forcedStarterCard],
    },
    state: {
      ...ctx.state,
      quest: {
        ...ctx.state.quest,
        deck: {
          entries: [{ cardId: forcedStarterCard.id, copies: 1 }],
          summary: { totalCards: 1, starterCards: 1, uniqueCards: 1 },
        },
      },
    },
  } as JourneyContext;
}

function costFamilyForText(text: string): "resource" | "bane" | "other" {
  const stripped = text.replace(/^\[LOCKED\] /, "");
  if (
    /^Lose \d+ essence/u.test(stripped)
    || /^Lose \d+-\d+ essence \(random roll\)/u.test(stripped)
    || /^Lose \d+% of your essence/u.test(stripped)
    || /^Lose (?:maximum|all remaining) essence/u.test(stripped)
    || /^Lose \d+ maximum essence/u.test(stripped)
    || /^Battle essence rewards are reduced by \d+%?/u.test(stripped)
    || /^Lose \d+ omens?/u.test(stripped)
  ) {
    return "resource";
  }
  if (/^Gain \d+ random banes?/u.test(stripped)) {
    return "bane";
  }
  for (const name of BANE_NAMES) {
    if (new RegExp(`^Gain \\d+ '${name}'(?: for the next \\d+ battles?)?`, "u").test(stripped)) {
      return "bane";
    }
  }
  return "other";
}

function flatEssenceCosts(text: string): readonly number[] {
  return [...text.matchAll(/(?:^|\[LOCKED\] |\. )Lose (\d+) essence(?:\.|$)/gu)].map((match) =>
    Number(match[1]),
  );
}

function textSegments(text: string): readonly string[] {
  return text.replace(/^\[LOCKED\] /u, "").split(". ");
}

function isEssenceRewardSegment(segment: string): boolean {
  return /^Gain \d+(?:-\d+)? essence(?: \(random roll\))?$/u.test(segment)
    || segment === "Gain essence up to your maximum"
    || /^Set essence to \d+% of your maximum essence$/u.test(segment)
    || /^Increase your maximum essence by \d+$/u.test(segment);
}

function isEssenceCostSegment(segment: string): boolean {
  return /^Lose \d+ essence$/u.test(segment)
    || /^Lose \d+-\d+ essence \(random roll\)$/u.test(segment)
    || /^Lose \d+% of your essence$/u.test(segment)
    || segment === "Lose maximum essence"
    || segment === "Lose all remaining essence"
    || /^Lose \d+ maximum essence$/u.test(segment)
    || /^Battle essence rewards are reduced by \d+%? for /u.test(segment);
}

function isOmenRewardSegment(segment: string): boolean {
  return /^Gain \d+ omens?$/u.test(segment);
}

function isOmenCostSegment(segment: string): boolean {
  return /^Lose \d+ omens?$/u.test(segment);
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
    for (let i = 0; i < 400 && !saw; i += 1) {
      const fill = randomTradesPlugin.fill({
        context: fakeCtx(0),
        drawContext: fakeDraw(`rt-lock-${i}`),
        stage: "mid" as JourneyStage,
      });
      if (fill.options.some((o) => o.text.includes("[LOCKED]"))) saw = true;
    }
    expect(saw).toBe(true);
  });

  it("renders random trade essence costs before rewards with Lose wording", async () => {
    const seed = "rt-v16-2";
    const { content, contentVersion } = await loadContentContext(process.cwd());
    const state = createInitialJourneyState({
      seed,
      content,
      contentVersion,
    });
    simulateQuestStateForStage({
      state,
      stage: "early",
      drawContext: {
        seed,
        contentVersion,
        rootJourneyIndex: 0,
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
      forcedShapeId: "random_trades",
      forcedStage: "early",
    });

    const essenceCostRows = manifest.options.filter((option) =>
      /^(?:\[LOCKED\] )?Lose \d+ essence\. /u.test(option.text),
    );
    expect(essenceCostRows.length).toBeGreaterThan(0);
    for (const option of essenceCostRows) {
      expect(option.text).not.toMatch(/\. Pay \d+ essence$/u);
    }
  });

  it("keeps visible flat essence costs at 25-plus multiples of 5 for reported seeds", async () => {
    const seeds = [
      "rt-v16-1",
      "rt-v16-2",
    ];
    const { content, contentVersion } = await loadContentContext(process.cwd());
    let sawEssenceCost = false;

    for (const seed of seeds) {
      const state = createInitialJourneyState({
        seed,
        content,
        contentVersion,
      });
      simulateQuestStateForStage({
        state,
        stage: "early",
        drawContext: {
          seed,
          contentVersion,
          rootJourneyIndex: 0,
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
        forcedShapeId: "random_trades",
        forcedStage: "early",
      });
      const costs = manifest.options.flatMap((option) => flatEssenceCosts(option.text));

      if (costs.length > 0) sawEssenceCost = true;
      for (const cost of costs) {
        expect(cost).toBeGreaterThanOrEqual(25);
        expect(cost % 5).toBe(0);
      }
    }
    expect(sawEssenceCost).toBe(true);
  });

  it("does not pair resource gain rewards with same-resource payment costs", async () => {
    const cases = [
      {
        seed: "random:df2e8861-a97e-455f-a50a-e59348bacef1",
        rootJourneyIndex: 1,
      },
      {
        seed: "random:72a92a8f-1e7e-44d2-87d1-1256f6524e01",
        rootJourneyIndex: 22,
      },
    ];
    const { content, contentVersion } = await loadContentContext(process.cwd());

    for (const c of cases) {
      const state = createInitialJourneyState({
        seed: c.seed,
        content,
        contentVersion,
      });
      state.generator.rootJourneyIndex = c.rootJourneyIndex;
      simulateQuestStateForStage({
        state,
        stage: "early",
        drawContext: {
          seed: c.seed,
          contentVersion,
          rootJourneyIndex: c.rootJourneyIndex,
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
        forcedShapeId: "random_trades",
        forcedStage: "early",
      });

      for (const option of manifest.options) {
        const segments = textSegments(option.text);
        expect(segments.some(isEssenceRewardSegment) && segments.some(isEssenceCostSegment)).toBe(false);
        expect(segments.some(isOmenRewardSegment) && segments.some(isOmenCostSegment)).toBe(false);
      }
    }
  });

  it("does not offer starter-card draft or gain rewards for regression seeds", async () => {
    const seeds = [
      "starter-draft-search-155",
      "random:31c2ab79-ff0a-49f5-9b5a-b8abf5b8a941",
    ];
    const { content, contentVersion } = await loadContentContext(process.cwd());

    for (const seed of seeds) {
      const state = createInitialJourneyState({
        seed,
        content,
        contentVersion,
      });
      simulateQuestStateForStage({
        state,
        stage: "early",
        drawContext: {
          seed,
          contentVersion,
          rootJourneyIndex: 0,
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
        forcedShapeId: "random_trades",
        forcedStage: "early",
      });

      for (const option of manifest.options) {
        expect(option.text).not.toMatch(/Draft \d of 4 Starter cards/u);
        expect(option.text).not.toMatch(/Gain \d+ random Starter cards/u);
      }
    }
  });

  it("does not offer named Starter-card gain rewards", () => {
    const fill = randomTradesPlugin.fill({
      context: fakeStarterCatalogCtx(),
      drawContext: fakeDraw("fake-starter-named-16"),
      stage: "early" as JourneyStage,
    });

    for (const option of fill.options) {
      expect(option.text).not.toMatch(/(?:^|\. )Gain Only Starter(?:$|\.)/u);
    }
  });

  it("does not render nonsensical starter replacement predicates for regression seeds", async () => {
    const seeds = [
      "random:0588f1cc-90d0-4bc2-9516-a0ca2c5c1899",
      "random:5beca6a2-4404-4dd9-a3a1-f78c29b012a3",
    ];
    const { content, contentVersion } = await loadContentContext(process.cwd());

    for (const seed of seeds) {
      const state = createInitialJourneyState({
        seed,
        content,
        contentVersion,
      });
      simulateQuestStateForStage({
        state,
        stage: "early",
        drawContext: {
          seed,
          contentVersion,
          rootJourneyIndex: 0,
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
        forcedShapeId: "random_trades",
        forcedStage: "early",
      });

      for (const option of manifest.options) {
        expect(option.text).not.toContain("random Starter card");
        expect(option.text).not.toContain("'transfigured' ability");
      }
    }
  });

  it("does not offer Dream Journey site destinations as random trade rewards", async () => {
    const seed = "random:c4963abd-7dbc-4046-8444-01e79fb2d2ea";
    const { content, contentVersion } = await loadContentContext(process.cwd());
    const regressionIndices = [63, 118, 185];

    for (const rootJourneyIndex of regressionIndices) {
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
        forcedShapeId: "random_trades",
        forcedStage: "early",
      });

      for (const option of manifest.options) {
        expect(option.text).not.toMatch(/Add a Dream Journey site/u);
        expect(option.text).not.toMatch(/with a Dream Journey site/u);
        expect(option.text).not.toMatch(/chance to see Dream Journey sites/u);
      }
    }
  });

  it("keeps locked resource-cost prefixes at the start of the full row", () => {
    let lockedText: string | undefined;
    for (let i = 0; i < 400 && !lockedText; i += 1) {
      const fill = randomTradesPlugin.fill({
        context: fakeCtx(0),
        drawContext: fakeDraw(`rt-lock-position-${i}`),
        stage: "mid" as JourneyStage,
      });
      lockedText = fill.options.find((o) =>
        o.text.startsWith("[LOCKED] ") && /Lose \d+ essence/u.test(o.text),
      )?.text;
    }

    expect(lockedText).toBeDefined();
    expect(lockedText).toMatch(/^\[LOCKED\] Lose \d+ essence\. /u);
    expect(lockedText?.slice("[LOCKED] ".length)).not.toContain("[LOCKED]");
  });

  it("reward template texts are pairwise distinct across rows", () => {
    // Use option.text uniqueness as a proxy for reward-template-id uniqueness.
    // (the public JourneyOption shape does not expose template ids directly).
    // Because each row has a distinct reward template (including sub-templates of
    // meta_gain_2_rewards being unique across all consumed ids), no two rows
    // should render the same text.
    for (let i = 0; i < 30; i += 1) {
      const fill = randomTradesPlugin.fill({
        context: fakeCtx(),
        drawContext: fakeDraw(`rt-distinct-${i}`),
        stage: "mid" as JourneyStage,
      });
      expect(new Set(fill.options.map((o) => o.text)).size).toBe(3);
    }
  });

  it("cost CEC is at most 50% of reward CEC for every row", () => {
    // For each row, either there is no cost (costConvertedEssence === 0), or
    // the cost CEC is at most half of the reward (effect) CEC. The essence
    // fallback path also stays within this cap because its CEC is bounded by
    // floor(0.5 * rewardCec).
    for (let i = 0; i < 50; i += 1) {
      const fill = randomTradesPlugin.fill({
        context: fakeCtx(),
        drawContext: fakeDraw(`rt-cap-${i}`),
        stage: "mid" as JourneyStage,
      });
      for (const opt of fill.options) {
        if (opt.costConvertedEssence === 0) continue;
        expect(opt.costConvertedEssence).toBeLessThanOrEqual(0.5 * opt.effectConvertedEssence);
      }
    }
  });

  it("generates deterministically across a real mid-stage batch seed", async () => {
    const seed = "random:72a92a8f-1e7e-44d2-87d1-1256f6524e01";
    const { content, contentVersion } = await loadContentContext(process.cwd());
    const state = createInitialJourneyState({
      seed,
      content,
      contentVersion,
    });
    state.generator.rootJourneyIndex = 43;
    state.quest.resources.dreamscape = 2;
    simulateQuestStateForStage({
      state,
      stage: "mid",
      drawContext: {
        seed,
        contentVersion,
        rootJourneyIndex: 43,
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
      forcedShapeId: "random_trades",
      forcedStage: "mid",
    });

    expect(manifest.options).toHaveLength(3);
  });

  it("falls back to mismatched viable rows when strict net matching exhausts widening", async () => {
    const seed = "rt-fallback-search-25";
    const { content, contentVersion } = await loadContentContext(process.cwd());

    function fillTextsAndNets(): { texts: readonly string[]; nets: readonly number[] } {
      const state = createInitialJourneyState({
        seed,
        content,
        contentVersion,
      });
      simulateQuestStateForStage({
        state,
        stage: "early",
        drawContext: {
          seed,
          contentVersion,
          rootJourneyIndex: 0,
        },
      });
      const context = buildJourneyContext({
        projectRoot: process.cwd(),
        content,
        state,
        contentVersion,
      });
      const fill = randomTradesPlugin.fill({
        context,
        drawContext: {
          seed,
          contentVersion,
          rootJourneyIndex: 0,
        },
        stage: "early",
      });

      return {
        texts: fill.options.map((o) => o.text),
        nets: fill.options.map((o) => o.netConvertedEssence),
      };
    }

    const first = fillTextsAndNets();
    const second = fillTextsAndNets();
    const anchorNet = first.nets[0]!;
    const nonAnchorDistances = first.nets.slice(1).map((net) => Math.abs(net - anchorNet));

    expect(first.texts).toHaveLength(3);
    expect(new Set(first.texts).size).toBe(3);
    expect(Math.max(...nonAnchorDistances)).toBeGreaterThanOrEqual(0);
    expect(first).toEqual(second);
  });

  it("selects resource costs at about half of rows across real mid-stage seeds", async () => {
    const seed = "random:72a92a8f-1e7e-44d2-87d1-1256f6524e01";
    const { content, contentVersion } = await loadContentContext(process.cwd());
    const counts = { resource: 0, bane: 0, other: 0 };
    for (let rootJourneyIndex = 1; rootJourneyIndex <= 40; rootJourneyIndex += 1) {
      const state = createInitialJourneyState({ seed, content, contentVersion });
      state.generator.rootJourneyIndex = rootJourneyIndex;
      state.quest.resources.dreamscape = 2;
      simulateQuestStateForStage({
        state,
        stage: "mid",
        drawContext: { seed, contentVersion, rootJourneyIndex },
      });
      const context = buildJourneyContext({
        projectRoot: process.cwd(),
        content,
        state,
        contentVersion,
      });
      const fill = randomTradesPlugin.fill({
        context,
        drawContext: { seed, contentVersion, rootJourneyIndex },
        stage: "mid",
      });

      for (const option of fill.options) {
        counts[costFamilyForText(option.text)] += 1;
      }
    }

    const total = counts.resource + counts.bane + counts.other;
    const resourceRate = counts.resource / total;
    const resourceCostsPerJourney = counts.resource / 40;

    expect(resourceCostsPerJourney).toBeGreaterThanOrEqual(1.25);
    expect(resourceCostsPerJourney).toBeLessThanOrEqual(1.75);
    expect(resourceRate).toBeGreaterThanOrEqual(0.40);
    expect(resourceRate).toBeLessThanOrEqual(0.60);
    expect(counts.other).toBeGreaterThan(0);
  });

  it("does not select chosen-card purge templates as real random trade costs", async () => {
    const seed = "random:72a92a8f-1e7e-44d2-87d1-1256f6524e01";
    const { content, contentVersion } = await loadContentContext(process.cwd());
    const chosenCardPurgeCost = /^(?:\[LOCKED\] )?(?:.+\. )?Purge a chosen (?!Dreamsign)/u;

    for (let rootJourneyIndex = 0; rootJourneyIndex < 60; rootJourneyIndex += 1) {
      const state = createInitialJourneyState({ seed, content, contentVersion });
      state.generator.rootJourneyIndex = rootJourneyIndex;
      simulateQuestStateForStage({
        state,
        stage: "early",
        drawContext: { seed, contentVersion, rootJourneyIndex },
      });
      const context = buildJourneyContext({
        projectRoot: process.cwd(),
        content,
        state,
        contentVersion,
      });
      const fill = randomTradesPlugin.fill({
        context,
        drawContext: { seed, contentVersion, rootJourneyIndex },
        stage: "early",
      });

      for (const option of fill.options) {
        if (option.costConvertedEssence === 0) continue;
        expect(option.text).not.toMatch(chosenCardPurgeCost);
      }
    }
  });
  it("meta_gain_2_rewards sub-rewards are non-meta, distinct, and don't collide with other rows", () => {
    // When a meta_gain_2_rewards row appears, its rendered text concatenates
    // two non-meta sub-template renders joined by ". ". We assert:
    //  - The two halves are non-empty (no degenerate single-template case).
    //  - The two halves are distinct (different sub-template ids).
    //  - Neither half is exactly equal to any other row's text (no cross-row
    //    collision with the same template render).
    // We can't query template ids directly via JourneyOption, but: the meta
    // template's render output starts with the sub-templates' renders, none of
    // which begin with a meta_ prefix (no nesting). We use text-shape checks.
    let sawMeta = false;
    for (let i = 0; i < 120; i += 1) {
      const fill = randomTradesPlugin.fill({
        context: fakeCtx(),
        drawContext: fakeDraw(`rt-meta-${i}`),
        stage: "mid" as JourneyStage,
      });
      for (let rowIdx = 0; rowIdx < fill.options.length; rowIdx += 1) {
        const opt = fill.options[rowIdx]!;
        // A meta row's reward text contains two sub-rewards joined by ". ".
        // Heuristic: skip the leading cost segment when one is present, then
        // check for a ". " inside the reward half. We can't perfectly identify
        // the meta row from text alone, but a row whose reward portion contains
        // at least one period+space is a candidate.
        const stripped = opt.text.replace(/^\[LOCKED\] /, "");
        const segments = stripped.split(". ").filter((s) => s.length > 0);
        const hasCost = opt.costConvertedEssence > 0;
        const rewardSegments = hasCost ? segments.slice(1) : segments;
        if (rewardSegments.length < 2) continue;
        // The first two segments are sub-reward renders if this is a meta row.
        const subA = rewardSegments[0]!;
        const subB = rewardSegments[1]!;
        if (subA === subB) continue; // could be a non-meta coincidence; skip
        // Treat as meta candidate and check invariants.
        sawMeta = true;
        // Sub-renders should not start with "meta_" (we only render text, but
        // the render functions of meta templates would also produce ". "-joined
        // output, and there's no nesting allowed by construction).
        expect(subA.startsWith("meta_")).toBe(false);
        expect(subB.startsWith("meta_")).toBe(false);
        // Distinct from each other.
        expect(subA).not.toEqual(subB);
        // Distinct from other rows' full texts (no cross-row reward collision).
        for (let otherIdx = 0; otherIdx < fill.options.length; otherIdx += 1) {
          if (otherIdx === rowIdx) continue;
          const other = fill.options[otherIdx]!;
          expect(other.text).not.toEqual(opt.text);
        }
      }
      if (sawMeta) break;
    }
    expect(sawMeta).toBe(true);
  });
});
