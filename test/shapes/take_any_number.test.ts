import { describe, expect, it } from "vitest";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import type { JourneyStage } from "../../src/journey/manifest.js";
import { getShapePlugin } from "../../src/journey/shapes.js";
import type { JourneyContext } from "../../src/quest/context.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import { createInitialJourneyState, simulateQuestStateForStage } from "../../src/quest/init.js";
import { renderJourneyHuman } from "../../src/render/human.js";
import type { DrawContext } from "../../src/util/rng.js";

const takeAnyNumberPlugin = getShapePlugin("take_any_number");

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
        seed: "take-any-number-test",
        dreamcaller: { id: "x", name: "x", title: "x", awakening: "x" },
        resources: { essence: 120, maxEssence: 500, omens: 2, dreamscape: 1 },
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

describe("take_any_number fill", () => {
  it("produces an any-number repeatable menu", () => {
    for (let index = 0; index < 20; index += 1) {
      const context = fakeCtx();
      const drawContext = fakeDraw(`take-any-number-${index}`);
      const stage = "mid" as JourneyStage;
      const fill = takeAnyNumberPlugin.fill({ context, drawContext, stage });

      expect(fill.options).toHaveLength(3);
      expect(fill.presentation).toEqual({ flatMenuHeader: "Take any number:" });
      expect(fill.precommitted).toEqual({});
      expect(fill.symmetryContracts).toBeUndefined();

      for (const option of fill.options.slice(0, 3)) {
        expect(option.text).toMatch(/^.+\. .+\.$/u);
        expect(option.text).not.toContain("Take up to");
        expect(option.text).not.toContain("Take any number");
        expect(option.text).not.toMatch(/\b(?:Cost|Reward):/u);
        expect(option.pickBehavior).toBe("record_and_generate_next");
        expect(option.operations).toEqual([]);
        expect(option.costs).toEqual([]);
        expect(option.effects).toEqual([]);
        expect(option.burdens).toEqual([]);
        expect(option.targets).toEqual([]);
        expect(option.triggers).toEqual([]);
        expect(option.routeEffects).toEqual([]);
        expect(option.costConvertedEssence).toBeGreaterThan(0);
        expect(option.effectConvertedEssence).toBeGreaterThan(0);
        expect(option.effectConvertedEssence).toBeLessThanOrEqual(260);
        expect(option.netConvertedEssence).toBe(
          option.effectConvertedEssence - option.costConvertedEssence,
        );
        expect(option.netConvertedEssence).toBeLessThanOrEqual(230);
      }
    }
  });

  it("is deterministic for a fixed draw context", () => {
    const args = {
      context: fakeCtx(),
      drawContext: fakeDraw("take-any-number-determinism"),
      stage: "mid" as JourneyStage,
    };

    expect(takeAnyNumberPlugin.fill(args)).toEqual(takeAnyNumberPlugin.fill(args));
  });

  it("uses the shape-owned validation bypass contract", () => {
    expect(takeAnyNumberPlugin.definition).toMatchObject({
      topology: "repeatable_menu",
      rootOptionCount: { min: 3, max: 3 },
      supportedTags: [],
      validationRules: [
        "manifest_schema_version",
        "manifest_version_metadata",
        "journey_id_format",
        "root_option_count_within_bounds",
      ],
    });
  });

  it("keeps forced early rows below the stage ceiling and excludes nested take-any rewards", async () => {
    const { content, contentVersion } = await loadContentContext(process.cwd());
    const seeds = [
      "audit:take_any_number:early:04",
      "audit:take_any_number:early:05",
      "audit:take_any_number:early:10",
    ];

    for (const seed of seeds) {
      const state = createInitialJourneyState({ seed, content, contentVersion });
      simulateQuestStateForStage({
        state,
        stage: "early",
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
        forcedShapeId: "take_any_number",
        forcedStage: "early",
      });

      expect(manifest.presentation).toEqual({ flatMenuHeader: "Take any number:" });
      expect(manifest.options).toHaveLength(4);
      for (const option of manifest.options.slice(0, 3)) {
        expect(option.text).not.toMatch(/Take any number of .+ from \d+ choices/u);
        expect(option.effectConvertedEssence).toBeLessThanOrEqual(180);
        expect(option.netConvertedEssence).toBeLessThanOrEqual(160);
      }
      expect(manifest.options[3]?.pickBehavior).toBe("leave");
      expect(manifest.options[3]?.text).toBe("Leave.");
    }
  });

  it("prints selected forced shape and scorer top entry in debug output", async () => {
    const seed = "audit:take_any_number:early:01";
    const { content, contentVersion } = await loadContentContext(process.cwd());
    const state = createInitialJourneyState({ seed, content, contentVersion });
    simulateQuestStateForStage({
      state,
      stage: "early",
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
      forcedShapeId: "take_any_number",
      forcedStage: "early",
    });
    const rendered = renderJourneyHuman(state, manifest, {
      color: false,
      debug: true,
      debugContext: false,
      showDeck: false,
      verbose: false,
    });

    expect(rendered).toContain("Selected shape: take_any_number");
    expect(rendered).toMatch(/Shape scoring: [a-z_]+ [0-9.]+/u);
  });

  it("renders the any-number instruction as a body header", async () => {
    const seed = "audit:take_any_number:early:01";
    const { content, contentVersion } = await loadContentContext(process.cwd());
    const state = createInitialJourneyState({ seed, content, contentVersion });
    simulateQuestStateForStage({
      state,
      stage: "early",
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
      forcedShapeId: "take_any_number",
      forcedStage: "early",
    });
    const rendered = renderJourneyHuman(state, manifest, {
      color: false,
      debug: false,
      debugContext: false,
      showDeck: false,
      verbose: false,
    });

    expect(rendered).toContain("\nTake any number:\n1. ");
    expect(rendered).not.toContain("Take up to 2 rewards from this cache.");
    expect(rendered).not.toMatch(/\n1\. Take any number:/u);
  });
});
