import { describe, expect, it } from "vitest";
import type { RandomPrecommittedOutcome } from "../../src/journey/manifest.js";
import { getShapePlugin } from "../../src/journey/shapes.js";
import { makeTestContext } from "../helpers/journey-context.js";

const resolvedRandomSeriesPlugin = getShapePlugin("resolved_random_series");

function fillFor(seed: string) {
  return resolvedRandomSeriesPlugin.fill(
    makeTestContext({ seed, stage: "mid" }),
  );
}

function seriesPayloads(entry: RandomPrecommittedOutcome | undefined) {
  return entry && "series" in entry && Array.isArray(entry.series)
    ? entry.series
    : [];
}

function optionSpread(fill: ReturnType<typeof fillFor>): number {
  const values = fill.options.map((option) => option.netConvertedEssence);

  return Math.max(...values) / Math.max(1, Math.min(...values));
}

describe("resolved_random_series fill", () => {
  it("uses the shape-owned validation bypass contract", () => {
    expect(resolvedRandomSeriesPlugin.definition).toMatchObject({
      topology: "random_commit",
      rootOptionCount: { min: 2, max: 2 },
      supportedTags: [],
      payloadCompatibility: [
        {
          familyId: "random",
          variants: ["reveal-roll-wager"],
          legality: "legal",
        },
      ],
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

  it("builds two resolved shared-reward series with empty option payload arrays", () => {
    const fill = fillFor("resolved-random-series-shared-rewards");

    expect(fill.options).toHaveLength(2);
    expect(fill.symmetryContracts).toBeUndefined();
    expect(fill.precommitted.random).toHaveLength(2);

    for (const option of fill.options) {
      expect(option.operations).toEqual([]);
      expect(option.costs).toEqual([]);
      expect(option.effects).toEqual([]);
      expect(option.burdens).toEqual([]);
      expect(option.targets).toEqual([]);
      expect(option.triggers).toEqual([]);
      expect(option.routeEffects).toEqual([]);
      expect(option.pickBehavior).toBe("record_and_generate_next");
      expect(option.effectConvertedEssence).toBeGreaterThan(0);
      expect(option.netConvertedEssence).toBe(option.effectConvertedEssence);
    }

    for (const [index, entry] of (fill.precommitted.random ?? []).entries()) {
      const series = seriesPayloads(entry);

      expect(entry).toMatchObject({
        kind: "resolved_random_series",
        optionNumber: index + 1,
        resolved: true,
        visibilityPolicy: {
          outcomeVisibility: "resolved",
          playerVisible: true,
        },
        expectedConvertedEssence: fill.options[index]?.effectConvertedEssence,
        riskPremiumConvertedEssence: 0,
      });
      expect(series).toHaveLength(3);
      expect(series.every((payload) =>
        typeof payload === "object" &&
        payload !== null &&
        "kind" in payload &&
        payload.kind === "shared_reward_template",
      )).toBe(true);
    }
  });

  it("is deterministic for a fixed draw context", () => {
    expect(fillFor("resolved-random-series-deterministic")).toEqual(
      fillFor("resolved-random-series-deterministic"),
    );
  });

  it("keeps deterministic early series values in a comparable band", () => {
    const fill = resolvedRandomSeriesPlugin.fill(
      makeTestContext({
        seed: "qa-resolved-random-series",
        stage: "early",
      }),
    );

    expect(optionSpread(fill)).toBeLessThanOrEqual(1.8);
    for (const entry of fill.precommitted.random ?? []) {
      for (const payload of seriesPayloads(entry)) {
        const templateId = (payload as { readonly templateId?: unknown }).templateId;

        expect(templateId).not.toBe("choose_1_of_X_dreamsigns");
        expect(templateId).not.toBe("shop_essence_discount");
      }
    }
  });
});
