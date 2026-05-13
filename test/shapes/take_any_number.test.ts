import { describe, expect, it } from "vitest";
import type { JourneyStage } from "../../src/journey/manifest.js";
import { getShapePlugin } from "../../src/journey/shapes.js";
import type { JourneyContext } from "../../src/quest/context.js";
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
  it("produces a capped repeatable menu with a leave option", () => {
    for (let index = 0; index < 20; index += 1) {
      const context = fakeCtx();
      const drawContext = fakeDraw(`take-any-number-${index}`);
      const stage = "mid" as JourneyStage;
      const fill = takeAnyNumberPlugin.fill({ context, drawContext, stage });

      expect(fill.options).toHaveLength(3);
      expect(fill.precommitted).toEqual({});
      expect(fill.symmetryContracts).toBeUndefined();

      for (const option of fill.options.slice(0, 2)) {
        expect(option.text).toMatch(
          /^Take up to 2 rewards from this cache\. Cost: .+\. Reward: .+/u,
        );
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
        expect(option.netConvertedEssence).toBe(
          option.effectConvertedEssence - option.costConvertedEssence,
        );
      }

      expect(fill.options[2]).toMatchObject({
        number: 3,
        text: "Leave the cache.",
        pickBehavior: "leave",
        netConvertedEssence: 0,
      });
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
      payloadCompatibility: [],
      validationRules: [
        "manifest_schema_version",
        "manifest_version_metadata",
        "journey_id_format",
        "root_option_count_within_bounds",
      ],
      repairPreferences: [],
      bypassStandardValidation: true,
    });
  });
});
