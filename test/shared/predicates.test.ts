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

  it("tags every predicate with a kind classifying its category", () => {
    // Each predicate carries a `kind` so rewards can opt in or out of whole
    // categories. Stat-bucket predicates (low/high cost/spark) are excluded
    // from random-gain rewards because granting cards at random keyed off a
    // raw stat slice is not a meaningful reward; ability and card-type
    // predicates are the meaningful categories for those rewards.
    const expected: Record<string, "ability" | "card-type" | "stat-bucket"> = {
      events: "card-type",
      characters: "card-type",
      warriors: "card-type",
      survivors: "card-type",
      spirit_animals: "card-type",
      starter: "card-type",
      legendary: "card-type",
      low_cost: "stat-bucket",
      high_cost: "stat-bucket",
      low_spark: "stat-bucket",
      high_spark: "stat-bucket",
      materialized: "ability",
      judgment: "ability",
      fast: "ability",
      transfigured: "ability",
      discard_text: "ability",
      abandon: "ability",
      event_copying: "ability",
      energy_generation: "ability",
      dissolve: "ability",
      reclaim: "ability",
    };
    for (const [id, kind] of Object.entries(expected)) {
      expect(getPredicate(id).kind, `${id} should be tagged ${kind}`).toBe(kind);
    }
  });

  it("renders text-keyword predicates as 'card with a/an <keyword> ability'", () => {
    const expected: Record<string, { singular: string; plural: string }> = {
      materialized: {
        singular: "card with a 'materialized' ability",
        plural: "cards with a 'materialized' ability",
      },
      judgment: {
        singular: "card with a 'judgment' ability",
        plural: "cards with a 'judgment' ability",
      },
      transfigured: {
        singular: "card with a 'transfigured' ability",
        plural: "cards with a 'transfigured' ability",
      },
      discard_text: {
        singular: "card with a 'discard' ability",
        plural: "cards with a 'discard' ability",
      },
      abandon: {
        singular: "card with an 'abandon' ability",
        plural: "cards with an 'abandon' ability",
      },
      event_copying: {
        singular: "card with an event-copying ability",
        plural: "cards with an event-copying ability",
      },
      energy_generation: {
        singular: "card with an energy-generation ability",
        plural: "cards with an energy-generation ability",
      },
      dissolve: {
        singular: "card with a 'dissolve' ability",
        plural: "cards with a 'dissolve' ability",
      },
      reclaim: {
        singular: "card with a 'reclaim' ability",
        plural: "cards with a 'reclaim' ability",
      },
    };
    for (const [id, text] of Object.entries(expected)) {
      const pred = getPredicate(id);
      expect(pred.text.singular).toBe(text.singular);
      expect(pred.text.plural).toBe(text.plural);
    }
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
