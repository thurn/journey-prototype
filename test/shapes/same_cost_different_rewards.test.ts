import { describe, expect, it } from "vitest";
import { validateJourneyManifest } from "../../src/journey/validate/index.js";
import type { JourneyContext } from "../../src/quest/context.js";
import type { JourneyStage } from "../../src/journey/manifest.js";
import type { DrawContext } from "../../src/util/rng.js";
import { sameCostDifferentRewardsPlugin } from "../../src/journey/shapes/same_cost_different_rewards/index.js";

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
        seed: "scdr-test",
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

describe("same_cost_different_rewards fill", () => {
  it("produces three text-only options with one shared cost", () => {
    for (let index = 0; index < 30; index += 1) {
      const fill = sameCostDifferentRewardsPlugin.fill({
        context: fakeCtx(),
        drawContext: fakeDraw(`scdr-${index}`),
        stage: "mid" as JourneyStage,
      });

      expect(fill.options).toHaveLength(3);
      expect(fill.symmetryContracts).toBeUndefined();
      expect(new Set(fill.options.map((option) => option.text)).size).toBe(3);
      expect(new Set(fill.options.map((option) => option.costConvertedEssence)).size).toBe(1);

      for (const option of fill.options) {
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

  it("keeps family-restricted rewards inside the requested family", () => {
    const fill = sameCostDifferentRewardsPlugin.fill({
      context: fakeCtx(),
      drawContext: fakeDraw("scdr-family-resource"),
      stage: "mid" as JourneyStage,
      shapeArgs: { familyRestriction: "resource" },
    });

    expect(fill.options).toHaveLength(3);
    for (const option of fill.options) {
      expect(option.text).toMatch(/essence|omen/u);
    }
  });

  it("bypasses standard validation rules", () => {
    const ctx = fakeCtx();
    const fill = sameCostDifferentRewardsPlugin.fill({
      context: ctx,
      drawContext: fakeDraw("scdr-validate"),
      stage: "mid" as JourneyStage,
    });
    const manifest = {
      schemaVersion: 2 as const,
      versions: {} as never,
      journeyId: "J-000001",
      seed: "scdr-test",
      rootJourneyIndex: 0,
      shapeId: "same_cost_different_rewards" as const,
      stage: "mid" as JourneyStage,
      dreamscape: 1,
      selectedTags: [],
      options: fill.options,
      distinctness: {
        algorithm: "semantic-fingerprint:v1" as const,
        value: "",
        components: [],
        explanation: {} as never,
        equivalenceBands: [],
      },
      generatedObjects: [],
      precommitted: fill.precommitted,
      debug: { generation: [], symmetryContracts: [] } as never,
      references: {} as never,
    };
    const result = validateJourneyManifest(manifest as never, ctx);
    const heavyRules = new Set([
      "typed_payload_contracts",
      "unresolved_reference",
      "root_option_payloads",
      "duplicate_root_option_mechanics",
      "route_effects",
      "shape_value_comparability",
      "offer_refusal_invariants",
      "random_precommitted_outcomes",
      "delayed_precommitted_outcomes",
    ]);
    if (!result.ok) {
      expect(heavyRules.has(result.rule ?? "")).toBe(false);
    }
  });
});
