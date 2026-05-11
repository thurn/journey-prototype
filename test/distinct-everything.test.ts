import { describe, expect, it } from "vitest";
import { randomTradesFill } from "../src/journey/shapes/random_trades/fill.js";
import {
  makeTestContext,
  runShapeValidators,
  synthesizeDistinctEverythingTrioWithDuplicates,
} from "./helpers/journey-context.js";

describe("distinct_everything_trio", () => {
  it("is emitted by every successful random_trades fill", () => {
    const { context, drawContext, stage } = makeTestContext({ seed: "de-1" });
    const filled = randomTradesFill({ context, drawContext, stage })!;
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
    const result = runShapeValidators("random_trades", manifest);
    expect(result.failures.map((f) => f.ruleId)).toContain(
      "distinct_everything_trio_axes_are_pairwise_distinct",
    );
  });
});
