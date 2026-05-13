import { describe, expect, it } from "vitest";
import { alterDreamscapesFill } from "../../src/journey/shapes/alter_dreamscapes/fill.js";
import { getShapeDefinition } from "../../src/journey/shapes.js";
import { makeTestContext } from "../helpers/journey-context.js";

const SITE_UPGRADE_RANK: Readonly<Record<string, number>> = {
  "Dream Journey": 0,
  "Dreamsign Offering": 1,
  "Shop": 1,
  "Essence": 2,
  "Specialty Shop": 2,
  "Transfiguration": 2,
  "Purge": 3,
  "Dreamsign Draft": 3,
  "Duplication": 4,
};

function routeEffect(option: ReturnType<typeof alterDreamscapesFill>["options"][number]) {
  return option.routeEffects[0] as Record<string, unknown>;
}

describe("alter_dreamscapes", () => {
  it("builds deterministic route-edit rows from shared reward templates", () => {
    const first = makeTestContext({ seed: "alter-dreamscapes-shared-rewards" });
    const second = makeTestContext({ seed: "alter-dreamscapes-shared-rewards" });

    const firstFill = alterDreamscapesFill(first);
    const secondFill = alterDreamscapesFill(second);

    expect(getShapeDefinition("alter_dreamscapes")).toMatchObject({
      topology: "direct_menu",
      validationRules: [
        "manifest_schema_version",
        "manifest_version_metadata",
        "journey_id_format",
        "root_option_count_within_bounds",
      ],
    });
    expect(firstFill).toEqual(secondFill);
    expect(firstFill.options).toHaveLength(3);
    expect(firstFill.symmetryContracts).toBeUndefined();
    expect(firstFill.precommitted.routeEdits).toHaveLength(3);

    for (const option of firstFill.options) {
      expect(option.symbols).toEqual(["route", "dreamscape", "reward"]);
      expect(option.operations).toEqual([]);
      expect(option.costs).toEqual([]);
      expect(option.effects).toEqual([]);
      expect(option.burdens).toEqual([]);
      expect(option.targets).toEqual([]);
      expect(option.triggers).toEqual([]);
      expect(option.routeEffects).toHaveLength(1);
      expect(option.effectConvertedEssence).toBeGreaterThan(0);
      expect(option.netConvertedEssence).toBe(option.effectConvertedEssence);
      expect(option.pickBehavior).toBe("record_and_generate_next");

      expect(option.routeEffects[0]).toEqual(
        expect.objectContaining({
          routePolarity: "positive",
          source: "shared_reward_template",
        }),
      );
      expect(["add_site", "replace_site", "probability_adjustment"]).toContain(
        (option.routeEffects[0] as { routeOperationKind?: string }).routeOperationKind,
      );
    }
  });

  it("keeps current and next add-site rows distinct when both appear", () => {
    for (let i = 0; i < 80; i += 1) {
      const fill = alterDreamscapesFill(makeTestContext({ seed: `alter-dreamscapes-add-sites:${i}` }));
      const addSiteTypes = fill.options
        .map(routeEffect)
        .filter((effect) => effect.routeOperationKind === "add_site")
        .map((effect) => effect.siteType);

      expect(new Set(addSiteTypes).size).toBe(addSiteTypes.length);
    }
  });

  it("reserves replacement rows for clear site upgrades with competitive value", () => {
    for (let i = 0; i < 80; i += 1) {
      const fill = alterDreamscapesFill(makeTestContext({ seed: `alter-dreamscapes-replacements:${i}` }));

      for (const option of fill.options) {
        const effect = routeEffect(option);

        if (effect.routeOperationKind !== "replace_site") {
          continue;
        }

        const fromRank = SITE_UPGRADE_RANK[String(effect.fromSite)];
        const toRank = SITE_UPGRADE_RANK[String(effect.toSite)];

        expect(fromRank).toBeDefined();
        expect(toRank).toBeDefined();
        expect(toRank! - fromRank!).toBeGreaterThanOrEqual(2);
        expect(option.effectConvertedEssence).toBeGreaterThanOrEqual(105);
        expect(effect.siteDeltaValue).toBe(option.effectConvertedEssence);
      }
    }
  });

  it("renders future site boosts with matching duration metadata", () => {
    let checkedBoost = false;

    for (let i = 0; i < 80; i += 1) {
      const fill = alterDreamscapesFill(makeTestContext({ seed: `alter-dreamscapes-boosts:${i}` }));

      for (const option of fill.options) {
        const effect = routeEffect(option);

        if (effect.routeOperationKind !== "probability_adjustment") {
          continue;
        }

        checkedBoost = true;
        expect(option.text).toContain("in the next 3 dreamscapes you visit");
        expect(effect.timing).toBe("the next 3 dreamscapes");
        expect(effect.durationDreamscapes).toBe(3);
        expect(effect.duration).toEqual({ unit: "dreamscape", count: 3 });
      }
    }

    expect(checkedBoost).toBe(true);
  });
});
