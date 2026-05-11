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
    { singular: "low-cost card", plural: "low-cost cards" },
    { maxEnergyCost: 2 }),
  predicate("high_cost", 1.3,
    { singular: "high-cost card", plural: "high-cost cards" },
    { minEnergyCost: 4 }),
  predicate("low_spark", 1.2,
    { singular: "low-spark card", plural: "low-spark cards" },
    { spark: 1 }),
  predicate("high_spark", 1.3,
    { singular: "high-spark card", plural: "high-spark cards" },
    { spark: 4 }),
  predicate("materialized", 1.3,
    { singular: "Materialized card", plural: "Materialized cards" },
    { renderedTextIncludes: "Materialized" }),
  predicate("judgment", 1.3,
    { singular: "Judgment card", plural: "Judgment cards" },
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
    { singular: "Transfigured card", plural: "Transfigured cards" },
    { renderedTextIncludes: "Transfigured" }),
  predicate("discard_text", 1.2,
    { singular: "discard-text card", plural: "discard-text cards" },
    { renderedTextIncludes: "discard" }),
  predicate("abandon", 1.3,
    { singular: "Abandon card", plural: "Abandon cards" },
    { renderedTextIncludes: "Abandon" }),
  predicate("event_copying", 1.4,
    { singular: "event-copying card", plural: "event-copying cards" },
    { renderedTextIncludes: ["copy", "event"] }),
  predicate("energy_generation", 1.3,
    { singular: "energy-generation card", plural: "energy-generation cards" },
    { renderedTextIncludes: ["Gain", "●"] }),
  predicate("dissolve", 1.3,
    { singular: "Dissolve card", plural: "Dissolve cards" },
    { renderedTextIncludes: "Dissolve" }),
  predicate("reclaim", 1.3,
    { singular: "Reclaim card", plural: "Reclaim cards" },
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
