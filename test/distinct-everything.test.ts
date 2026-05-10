import { describe, expect, it } from "vitest";
import { independentRowsMenuFill } from "../src/journey/shapes/independent_rows_menu/fill.js";
import {
  makeTestContext,
  runShapeValidators,
  synthesizeDistinctEverythingTrioWithDuplicates,
} from "./helpers/journey-context.js";

describe("distinct_everything_trio", () => {
  it("is emitted by every successful independent_rows_menu fill", () => {
    const { context, drawContext, stage } = makeTestContext({ seed: "de-1" });
    const filled = independentRowsMenuFill({ context, drawContext, stage })!;
    expect(filled).toBeDefined();
    expect(
      (filled.symmetryContracts ?? []).some(
        (c) => c.contractKind === "distinct_everything_trio",
      ),
    ).toBe(true);
  });
});

describe("distinct_everything_trio validator", () => {
  it("rejects a manifest claiming the contract but containing duplicate rows", () => {
    const manifest = synthesizeDistinctEverythingTrioWithDuplicates();
    const result = runShapeValidators("independent_rows_menu", manifest);
    expect(result.failures.map((f) => f.ruleId)).toContain(
      "distinct_everything_trio_axes_are_pairwise_distinct",
    );
  });
});
