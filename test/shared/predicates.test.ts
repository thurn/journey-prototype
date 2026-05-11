import { describe, expect, it } from "vitest";
import { PREDICATES, getPredicate } from "../../src/journey/shared/predicates.js";

describe("predicates", () => {
  it("includes every predicate from the spec", () => {
    const expected = [
      "events", "characters", "warriors", "survivors", "spirit_animals",
      "low_cost", "high_cost", "low_spark", "high_spark",
      "materialized", "judgment", "fast", "starter", "legendary", "transfigured",
      "discard_text", "abandon", "event_copying", "energy_generation",
      "dissolve", "reclaim",
    ].sort();
    expect(PREDICATES.map((p) => p.id).sort()).toEqual(expected);
  });

  it("characters has multiplier 1.0 and warriors has 1.4", () => {
    expect(getPredicate("characters").multiplier).toBe(1.0);
    expect(getPredicate("warriors").multiplier).toBe(1.4);
  });

  it("warriors carries a cardType+subtype card predicate", () => {
    expect(getPredicate("warriors").cardPredicate).toEqual({
      cardType: "Character",
      subtype: "Warrior",
    });
  });

  it("throws for an unknown predicate id", () => {
    expect(() => getPredicate("not_a_predicate")).toThrow();
  });
});
