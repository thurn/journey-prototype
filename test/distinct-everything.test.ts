import { describe, expect, it } from "vitest";
import { independentRowsMenuFill } from "../src/journey/shapes/independent_rows_menu/fill.js";
import { makeTestContext } from "./helpers/journey-context.js";

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
