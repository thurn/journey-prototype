import { describe, expect, it } from "vitest";
import {
  expandPredicateAxes,
  type PredicateAxis,
} from "../src/journey/fillers/predicateAxes.js";

describe("expandPredicateAxes", () => {
  it("produces one entry per cartesian product point", () => {
    const axes: PredicateAxis[] = [
      { name: "keyword", values: ["Dissolve", "Anchor", "Echo"] as const },
      { name: "count", values: [1, 2, 3] as const },
    ];
    const expanded = expandPredicateAxes(axes);
    expect(expanded).toHaveLength(9);
    expect(expanded[0]).toEqual({ keyword: "Dissolve", count: 1 });
  });

  it("returns a single empty point when given no axes", () => {
    expect(expandPredicateAxes([])).toEqual([{}]);
  });
});
