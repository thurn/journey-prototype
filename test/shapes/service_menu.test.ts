import { describe, expect, it } from "vitest";
import { serviceMenuFill } from "../../src/journey/shapes/service_menu/fill.js";
import { makeTestContext } from "../helpers/journey-context.js";

describe("service_menu", () => {
  it("builds deterministic themed service rows from shared templates", () => {
    const first = makeTestContext({ seed: "service-menu-shared-templates" });
    const second = makeTestContext({ seed: "service-menu-shared-templates" });

    const firstFill = serviceMenuFill(first);
    const secondFill = serviceMenuFill(second);

    expect(firstFill).toEqual(secondFill);
    expect(firstFill.options).toHaveLength(3);
    expect(firstFill.precommitted).toEqual({});
    expect(firstFill.symmetryContracts).toBeUndefined();
    const sceneNames = new Set<string>();

    for (const option of firstFill.options) {
      expect(option.text).toMatch(/^At the [^,]+, .+\. .+\.$/u);
      expect(option.text).not.toContain("Cost:");
      expect(option.text).not.toContain("Reward:");
      expect(option.text).not.toContain("Price:");
      sceneNames.add(option.text.match(/^At the ([^,]+),/u)?.[1] ?? "");
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

    expect(sceneNames.size).toBe(1);
  });

  it("keeps card and Dreamsign surgery out of service prices", () => {
    for (let index = 0; index < 20; index += 1) {
      const fill = serviceMenuFill(
        makeTestContext({ seed: `service-menu-price-audit-${index}` }),
      );

      for (const option of fill.options) {
        const price = (option.text.split(". ").at(-1) ?? "").replace(/\.$/u, "");
        expect(price).not.toMatch(
          /Purge (?:a chosen|a random|'|all duplicate|the transfiguration)|Transform .* into|Draw \d+ cards/u,
        );
      }
    }
  });
});
