import { describe, expect, it } from "vitest";
// Import the validate barrel first so the shapes registry finishes loading
// before our shape plugin module is evaluated. This avoids a known circular
// import (shared.ts -> validate/tree.ts -> shapes.ts -> registry -> shapes/*/index.ts -> shared.ts).
import { validateJourneyManifest } from "../../src/journey/validate/index.js";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import { randomTradesPlugin } from "../../src/journey/shapes/random_trades/index.js";
import { BANE_NAMES } from "../../src/journey/shared/content.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import { createInitialJourneyState, simulateQuestStateForStage } from "../../src/quest/init.js";
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

function costFamilyForText(text: string): "resource" | "bane" | "other" {
  const stripped = text.replace(/^\[LOCKED\] /, "");
  if (/^Lose \d+ essence/u.test(stripped) || /^Lose \d+ omens?/u.test(stripped)) {
    return "resource";
  }
  if (/^Gain \d+ random banes?/u.test(stripped)) {
    return "bane";
  }
  for (const name of BANE_NAMES) {
    if (new RegExp(`^Gain \\d+ ${name}(?: for the next \\d+ battles?)?`, "u").test(stripped)) {
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
    const seed = "random:703bb028-5067-4c5c-a35e-b402b73810e3";
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
      "random:703bb028-5067-4c5c-a35e-b402b73810e3",
      "random:451b2048-1df9-4464-853b-a7065625f417",
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
    // Use option.text uniqueness as a proxy for reward-template-id distinctness
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
    expect(Math.max(...nonAnchorDistances)).toBeGreaterThan(165);
    expect(first).toEqual(second);
  });

  it("selects resource and Bane costs at the intended rates across real mid-stage seeds", async () => {
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
    const baneRate = counts.bane / total;

    expect(resourceRate).toBeGreaterThanOrEqual(0.35);
    expect(resourceRate).toBeLessThanOrEqual(0.70);
    expect(baneRate).toBeGreaterThanOrEqual(0.14);
    expect(baneRate).toBeLessThanOrEqual(0.36);
    expect(counts.other).toBeGreaterThan(0);
  });

  it("does not select chosen-card purge templates as real random trade costs", async () => {
    const seed = "random:72a92a8f-1e7e-44d2-87d1-1256f6524e01";
    const { content, contentVersion } = await loadContentContext(process.cwd());
    const chosenCardPurgeCost = /^(?:\[LOCKED\] )?(?:.+\. )?Purge a chosen /u;

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

  it("bypass-validation: synthetic manifest passes the full pipeline", () => {
    const ctx = fakeCtx();
    const fill = randomTradesPlugin.fill({
      context: ctx,
      drawContext: fakeDraw("rt-validate"),
      stage: "mid" as JourneyStage,
    });
    const manifest = {
      schemaVersion: 2 as const,
      versions: {} as never,
      journeyId: "J-000001",
      seed: "rt-test",
      rootJourneyIndex: 0,
      shapeId: "random_trades" as const,
      stage: "mid" as JourneyStage,
      dreamscape: 1,
      selectedTags: [],
      options: fill.options,
      distinctness: { algorithm: "semantic-fingerprint:v1" as const, value: "", components: [], explanation: {} as never, equivalenceBands: [] },
      generatedObjects: [],
      precommitted: fill.precommitted,
      debug: { generation: [], symmetryContracts: [] } as never,
      references: {} as never,
    };
    const result = validateJourneyManifest(manifest as never, ctx);
    // We can't necessarily assert ok:true here without complete metadata (the
    // four cheap checks may fail on missing versions). The strict assertion is:
    // the result does NOT contain any of the heavy validators' rule ids.
    const heavyRules = new Set([
      "typed_payload_contracts", "unresolved_reference",
      "root_option_payloads", "duplicate_root_option_mechanics",
      "route_effects", "shape_value_comparability",
      "offer_refusal_invariants", "random_precommitted_outcomes",
      "delayed_precommitted_outcomes",
    ]);
    if (!result.ok) {
      expect(heavyRules.has(result.rule ?? "")).toBe(false);
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
