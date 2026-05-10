import { describe, expect, it } from "vitest";
import { getShapePlugin } from "../src/journey/shapes.js";

describe("independent_rows_menu plugin", () => {
  it("is registered with rootOptionCount 2-3", () => {
    const plugin = getShapePlugin("independent_rows_menu");
    expect(plugin).toBeDefined();
    expect(plugin!.definition.rootOptionCount).toEqual({ min: 2, max: 3 });
    expect(plugin!.definition.topology).toBe("direct_menu");
  });
});
