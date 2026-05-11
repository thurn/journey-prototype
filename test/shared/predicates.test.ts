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

  it("renders cost and spark predicates with the explicit numeric threshold from the card predicate", () => {
    const lowCost = getPredicate("low_cost");
    expect(lowCost.cardPredicate).toEqual({ maxEnergyCost: 2 });
    expect(lowCost.text.singular).toBe("card with cost 2 or less");
    expect(lowCost.text.plural).toBe("cards with cost 2 or less");

    const highCost = getPredicate("high_cost");
    expect(highCost.cardPredicate).toEqual({ minEnergyCost: 4 });
    expect(highCost.text.singular).toBe("card with cost 4 or more");
    expect(highCost.text.plural).toBe("cards with cost 4 or more");

    const lowSpark = getPredicate("low_spark");
    expect(lowSpark.cardPredicate).toEqual({ spark: 1 });
    expect(lowSpark.text.singular).toBe("card with spark 1 or less");
    expect(lowSpark.text.plural).toBe("cards with spark 1 or less");

    const highSpark = getPredicate("high_spark");
    expect(highSpark.cardPredicate).toEqual({ spark: 4 });
    expect(highSpark.text.singular).toBe("card with spark 4 or more");
    expect(highSpark.text.plural).toBe("cards with spark 4 or more");
  });
});
