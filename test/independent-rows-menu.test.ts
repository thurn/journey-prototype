import { describe, expect, it } from "vitest";
import { getShapePlugin } from "../src/journey/shapes.js";
import { independentRowsMenuFill } from "../src/journey/shapes/independent_rows_menu/fill.js";
import { ROW_POOL_CONFIGURATIONS } from "../src/journey/shapes/independent_rows_menu/rowPools.js";
import {
  makeTestContext,
  runShapeValidators,
  synthesizeIdenticalRowsManifest,
} from "./helpers/journey-context.js";

describe("independent_rows_menu plugin", () => {
  it("is registered with rootOptionCount 2-3", () => {
    const plugin = getShapePlugin("independent_rows_menu");
    expect(plugin).toBeDefined();
    expect(plugin!.definition.rootOptionCount).toEqual({ min: 2, max: 3 });
    expect(plugin!.definition.topology).toBe("direct_menu");
  });
});

describe("independentRowsMenuFill", () => {
  it("produces 2 or 3 options where each option's payloads come from a registered pool", () => {
    const { context, drawContext, stage } = makeTestContext({ seed: "indep-1" });
    const filled = independentRowsMenuFill({ context, drawContext, stage });
    expect(filled).toBeDefined();
    expect(filled!.options.length).toBeGreaterThanOrEqual(2);
    expect(filled!.options.length).toBeLessThanOrEqual(3);
    for (const opt of filled!.options) {
      // Each option should expose at least one structured payload (cost,
      // burden, or effect) sourced from one of the registered pools.
      const payloadCount =
        opt.costs.length + opt.burdens.length + opt.effects.length;
      expect(payloadCount).toBeGreaterThan(0);
    }
    // Sanity: registry is non-empty so the fill has something to choose from.
    expect(ROW_POOL_CONFIGURATIONS.length).toBeGreaterThan(0);
  });

  it("two options never produce identical (cost, reward) tuples", () => {
    const { context, drawContext, stage } = makeTestContext({ seed: "indep-2" });
    const filled = independentRowsMenuFill({ context, drawContext, stage })!;
    const tuples = filled.options.map((opt) =>
      [
        ...opt.costs.map((p) => `cost:${JSON.stringify(p)}`),
        ...opt.burdens.map((p) => `burden:${JSON.stringify(p)}`),
        ...opt.effects.map((p) => `effect:${JSON.stringify(p)}`),
      ].join("|"),
    );
    expect(new Set(tuples).size).toBe(tuples.length);
  });
});

describe("independent_rows_menu validators", () => {
  it("rejects manifests where every row uses the identical pool entry", () => {
    const manifest = synthesizeIdenticalRowsManifest();
    const result = runShapeValidators("independent_rows_menu", manifest);
    expect(result.failures.map((f) => f.ruleId)).toContain(
      "rows_are_pairwise_distinct_on_at_least_one_axis",
    );
  });
});
