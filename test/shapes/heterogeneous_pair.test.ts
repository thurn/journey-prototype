import { describe, expect, it } from "vitest";
// Import the validate barrel first so the shapes registry finishes loading
// before the shape plugin module is evaluated.
import "../../src/journey/validate/index.js";
import { heterogeneousPairPlugin } from "../../src/journey/shapes/heterogeneous_pair/index.js";
import { makeTestContext } from "../helpers/journey-context.js";

function fillFor(seed: string) {
  const { context, drawContext, stage } = makeTestContext({ seed });

  return heterogeneousPairPlugin.fill({ context, drawContext, stage });
}

function axisSymbols(symbols: readonly string[]): readonly string[] {
  return symbols.filter((symbol) => symbol !== "reward");
}

describe("heterogeneous_pair fill", () => {
  it("produces exactly two text-backed reward options", () => {
    for (let index = 0; index < 30; index += 1) {
      const fill = fillFor(`heterogeneous-pair-count-${index}`);

      expect(fill.options).toHaveLength(2);
      expect(fill.precommitted).toEqual({});
      for (const [optionIndex, option] of fill.options.entries()) {
        expect(option.number).toBe(optionIndex + 1);
        expect(option.text.length).toBeGreaterThan(0);
        expect(option.symbols).toContain("reward");
        expect(axisSymbols(option.symbols).length).toBeGreaterThan(0);
        expect(option.operations).toEqual([]);
        expect(option.costs).toEqual([]);
        expect(option.effects).toEqual([]);
        expect(option.netConvertedEssence).toBe(option.effectConvertedEssence);
        expect(option.netConvertedEssence).toBeGreaterThan(0);
        expect(option.pickBehavior).toBe("record_and_generate_next");
      }
    }
  });

  it("is deterministic for the same draw context", () => {
    const first = fillFor("heterogeneous-pair-deterministic");
    const second = fillFor("heterogeneous-pair-deterministic");

    expect(first.options).toEqual(second.options);
  });

  it("keeps the pair on distinct reward axes with comparable CEC", () => {
    for (let index = 0; index < 30; index += 1) {
      const fill = fillFor(`heterogeneous-pair-axis-${index}`);
      const [left, right] = fill.options;
      const leftAxes = axisSymbols(left!.symbols);
      const rightAxes = axisSymbols(right!.symbols);
      const overlap = leftAxes.filter((axis) => rightAxes.includes(axis));
      const spread =
        Math.max(left!.netConvertedEssence, right!.netConvertedEssence) /
        Math.max(1, Math.min(left!.netConvertedEssence, right!.netConvertedEssence));

      expect(left!.text).not.toBe(right!.text);
      expect(overlap).toEqual([]);
      expect(spread).toBeLessThanOrEqual(4.5);
    }
  });
});
