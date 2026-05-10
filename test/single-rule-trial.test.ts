import { describe, expect, it } from "vitest";
import { getShapePlugin } from "../src/journey/shapes.js";

describe("single_rule_trial plugin", () => {
  it("declares rootOptionCount min and max of 1", () => {
    const plugin = getShapePlugin("single_rule_trial");
    expect(plugin).toBeDefined();
    expect(plugin!.definition.rootOptionCount).toEqual({ min: 1, max: 1 });
  });
});
