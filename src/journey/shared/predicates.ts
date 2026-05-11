// src/journey/shared/predicates.ts
import type { Predicate } from "./types.js";

export const PREDICATES: readonly Predicate[] = Object.freeze([
  predicate("events", 1.0, { singular: "Event card", plural: "Event cards" },
    { cardType: "Event" }),
  predicate("characters", 1.0, { singular: "Character", plural: "Characters" },
    { cardType: "Character" }),
  predicate("warriors", 1.4, { singular: "Warrior", plural: "Warriors" },
    { cardType: "Character", subtype: "Warrior" }),
  predicate("survivors", 1.4, { singular: "Survivor", plural: "Survivors" },
    { cardType: "Character", subtype: "Survivor" }),
  predicate("spirit_animals", 1.4,
    { singular: "Spirit Animal", plural: "Spirit Animals" },
    { cardType: "Character", subtype: "Spirit Animal" }),
  predicate("low_cost", 1.2,
    { singular: "card with cost 2 or less", plural: "cards with cost 2 or less" },
    { maxEnergyCost: 2 }),
  predicate("high_cost", 1.3,
    { singular: "card with cost 4 or more", plural: "cards with cost 4 or more" },
    { minEnergyCost: 4 }),
  predicate("low_spark", 1.2,
    { singular: "card with spark 1 or less", plural: "cards with spark 1 or less" },
    { spark: 1 }),
  predicate("high_spark", 1.3,
    { singular: "card with spark 4 or more", plural: "cards with spark 4 or more" },
    { spark: 4 }),
  predicate("materialized", 1.3,
    { singular: "card with a 'materialized' ability", plural: "cards with a 'materialized' ability" },
    { renderedTextIncludes: "Materialized" }),
  predicate("judgment", 1.3,
    { singular: "card with a 'judgment' ability", plural: "cards with a 'judgment' ability" },
    { renderedTextIncludes: "Judgment" }),
  predicate("fast", 1.2,
    { singular: "Fast card", plural: "Fast cards" },
    { isFast: true }),
  predicate("starter", 1.0,
    { singular: "Starter card", plural: "Starter cards" },
    { starter: true }),
  predicate("legendary", 1.8,
    { singular: "Legendary card", plural: "Legendary cards" },
    { rarity: "legendary" }),
  predicate("transfigured", 1.6,
    { singular: "card with a 'transfigured' ability", plural: "cards with a 'transfigured' ability" },
    { renderedTextIncludes: "Transfigured" }),
  predicate("discard_text", 1.2,
    { singular: "card with a 'discard' ability", plural: "cards with a 'discard' ability" },
    { renderedTextIncludes: "discard" }),
  predicate("abandon", 1.3,
    { singular: "card with an 'abandon' ability", plural: "cards with an 'abandon' ability" },
    { renderedTextIncludes: "Abandon" }),
  predicate("event_copying", 1.4,
    { singular: "card with an event-copying ability", plural: "cards with an event-copying ability" },
    { renderedTextIncludes: ["copy", "event"] }),
  predicate("energy_generation", 1.3,
    { singular: "card with an energy-generation ability", plural: "cards with an energy-generation ability" },
    { renderedTextIncludes: ["Gain", "●"] }),
  predicate("dissolve", 1.3,
    { singular: "card with a 'dissolve' ability", plural: "cards with a 'dissolve' ability" },
    { renderedTextIncludes: "Dissolve" }),
  predicate("reclaim", 1.3,
    { singular: "card with a 'reclaim' ability", plural: "cards with a 'reclaim' ability" },
    { renderedTextIncludes: "Reclaim" }),
]);

function predicate(
  id: string,
  multiplier: number,
  text: Predicate["text"],
  cardPredicate?: Predicate["cardPredicate"],
): Predicate {
  return Object.freeze({ id, multiplier, text, cardPredicate });
}

const BY_ID = new Map(PREDICATES.map((p) => [p.id, p]));

export function getPredicate(id: string): Predicate {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown predicate id: ${id}`);
  return found;
}
