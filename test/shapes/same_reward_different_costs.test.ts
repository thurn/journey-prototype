import { describe, expect, it } from "vitest";
import { validateJourneyManifest } from "../../src/journey/validate/index.js";
import type { JourneyContext } from "../../src/quest/context.js";
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

  it("bypasses standard validation rules", () => {
    const ctx = fakeCtx();
    const fill = sameRewardDifferentCostsPlugin.fill({
      context: ctx,
      drawContext: fakeDraw("srdc-validate"),
      stage: "mid" as JourneyStage,
    });
    const manifest = {
      schemaVersion: 2 as const,
      versions: {} as never,
      journeyId: "J-000001",
      seed: "srdc-test",
      rootJourneyIndex: 0,
      shapeId: "same_reward_different_costs" as const,
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
