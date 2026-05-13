import { describe, expect, it } from "vitest";
import { alterDreamscapesFill } from "../../src/journey/shapes/alter_dreamscapes/fill.js";
import { getShapeDefinition } from "../../src/journey/shapes.js";
import { makeTestContext } from "../helpers/journey-context.js";

describe("alter_dreamscapes", () => {
  it("builds deterministic route-edit rows from shared reward templates", () => {
    const first = makeTestContext({ seed: "alter-dreamscapes-shared-rewards" });
    const second = makeTestContext({ seed: "alter-dreamscapes-shared-rewards" });

    const firstFill = alterDreamscapesFill(first);
    const secondFill = alterDreamscapesFill(second);

    expect(getShapeDefinition("alter_dreamscapes")).toMatchObject({
      topology: "direct_menu",
      bypassStandardValidation: true,
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
});
