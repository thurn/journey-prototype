import { describe, expect, it } from "vitest";
import type { JourneyStage } from "../../src/journey/manifest.js";
// Import the validate barrel first so the shapes registry finishes loading
// before the shape plugin module is evaluated.
import "../../src/journey/validate/index.js";
import { heterogeneousPairPlugin } from "../../src/journey/shapes/heterogeneous_pair/index.js";
import { makeTestContext } from "../helpers/journey-context.js";

const DISPLAY_SYMBOLS = new Set(["reward", "cost", "risk", "route", "leave", "loss", "no-op"]);

function fillFor(seed: string, stage: JourneyStage = "mid") {
  const { context, drawContext } = makeTestContext({ seed, stage });

  return heterogeneousPairPlugin.fill({ context, drawContext, stage });
}

function axisSymbols(symbols: readonly string[]): readonly string[] {
  return symbols
    .filter((symbol) => symbol.startsWith("axis:"))
    .map((symbol) => symbol.slice("axis:".length));
}

function profileSymbols(symbols: readonly string[], prefix: string): readonly string[] {
  return symbols
    .filter((symbol) => symbol.startsWith(prefix))
    .map((symbol) => symbol.slice(prefix.length));
}

function hasOverlap(left: readonly string[], right: readonly string[]): boolean {
  return left.some((value) => right.includes(value));
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
        expect(option.symbols).toContain("semantic:reward");
        expect(axisSymbols(option.symbols).length).toBeGreaterThan(0);
        expect(option.symbols.filter((symbol) => DISPLAY_SYMBOLS.has(symbol))).toEqual([]);
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

  it("keeps target, operation, and result profiles visibly separated", () => {
    for (let index = 0; index < 30; index += 1) {
      const fill = fillFor(`heterogeneous-pair-profile-${index}`);
      const [left, right] = fill.options;
      const targetSeparated = !hasOverlap(
        profileSymbols(left!.symbols, "target:"),
        profileSymbols(right!.symbols, "target:"),
      );
      const operationSeparated = !hasOverlap(
        profileSymbols(left!.symbols, "operation:"),
        profileSymbols(right!.symbols, "operation:"),
      );
      const resultSeparated = !hasOverlap(
        profileSymbols(left!.symbols, "result:"),
        profileSymbols(right!.symbols, "result:"),
      );

      expect([targetSeparated, operationSeparated, resultSeparated].filter(Boolean).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("applies a late-stage minimum impact floor", () => {
    for (let index = 0; index < 30; index += 1) {
      const fill = fillFor(`heterogeneous-pair-late-impact-${index}`, "late");

      for (const option of fill.options) {
        expect(option.netConvertedEssence).toBeGreaterThanOrEqual(65);
      }
    }
  });
});
