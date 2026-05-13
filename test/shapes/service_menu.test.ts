import { describe, expect, it } from "vitest";
import { serviceMenuFill } from "../../src/journey/shapes/service_menu/fill.js";
import { makeTestContext } from "../helpers/journey-context.js";

describe("service_menu", () => {
  it("builds deterministic text and CEC service rows from shared templates", () => {
    const first = makeTestContext({ seed: "service-menu-shared-templates" });
    const second = makeTestContext({ seed: "service-menu-shared-templates" });

    const firstFill = serviceMenuFill(first);
    const secondFill = serviceMenuFill(second);

    expect(firstFill).toEqual(secondFill);
    expect(firstFill.options).toHaveLength(3);
    expect(firstFill.precommitted).toEqual({});
    expect(firstFill.symmetryContracts).toBeUndefined();

    for (const option of firstFill.options) {
      expect(option.text).toMatch(/^Cost: .+\. Reward: .+/u);
      expect(option.symbols).toEqual(["service", "cost", "reward"]);
      expect(option.operations).toEqual([]);
      expect(option.costs).toEqual([]);
      expect(option.effects).toEqual([]);
      expect(option.burdens).toEqual([]);
      expect(option.targets).toEqual([]);
      expect(option.triggers).toEqual([]);
      expect(option.routeEffects).toEqual([]);
      expect(option.effectConvertedEssence).toBeGreaterThan(0);
      expect(option.costConvertedEssence).toBeGreaterThan(0);
      expect(option.netConvertedEssence).toBeGreaterThan(0);
      expect(option.pickBehavior).toBe("record_and_generate_next");
    }
  });
});
