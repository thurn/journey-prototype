// src/journey/shared/predicates.ts
import type { Predicate, PredicateKind } from "./types.js";

export const PREDICATES: readonly Predicate[] = Object.freeze([
  predicate("events", "card-type", 1.0,
    { singular: "Event card", plural: "Event cards" },
    { cardType: "Event" }),
  predicate("characters", "card-type", 1.0,
    { singular: "Character", plural: "Characters" },
    { cardType: "Character" }),
  predicate("warriors", "card-type", 1.4,
    { singular: "Warrior", plural: "Warriors" },
    { cardType: "Character", subtype: "Warrior" }),
  predicate("survivors", "card-type", 1.4,
    { singular: "Survivor", plural: "Survivors" },
    { cardType: "Character", subtype: "Survivor" }),
  predicate("spirit_animals", "card-type", 1.4,
    { singular: "Spirit Animal", plural: "Spirit Animals" },
    { cardType: "Character", subtype: "Spirit Animal" }),
  predicate("low_cost", "stat-bucket", 1.2,
    { singular: "card with cost 2 or less", plural: "cards with cost 2 or less" },
    { maxEnergyCost: 2 }),
  predicate("high_cost", "stat-bucket", 1.3,
    { singular: "card with cost 4 or more", plural: "cards with cost 4 or more" },
    { minEnergyCost: 4 }),
  predicate("low_spark", "stat-bucket", 1.2,
    { singular: "card with spark 1 or less", plural: "cards with spark 1 or less" },
    { spark: 1 }),
  predicate("high_spark", "stat-bucket", 1.3,
    { singular: "card with spark 4 or more", plural: "cards with spark 4 or more" },
    { spark: 4 }),
  predicate("materialized", "ability", 1.3,
    { singular: "card with a 'materialized' ability", plural: "cards with a 'materialized' ability" },
    { renderedTextIncludes: "Materialized" }),
  predicate("judgment", "ability", 1.3,
    { singular: "card with a 'judgment' ability", plural: "cards with a 'judgment' ability" },
    { renderedTextIncludes: "Judgment" }),
  predicate("fast", "ability", 1.2,
    { singular: "Fast card", plural: "Fast cards" },
    { isFast: true }),
  predicate("starter", "card-type", 1.0,
    { singular: "Starter card", plural: "Starter cards" },
    { starter: true }),
  predicate("legendary", "card-type", 1.8,
    { singular: "Legendary card", plural: "Legendary cards" },
    { rarity: "legendary" }),
  predicate("transfigured", "ability", 1.6,
    { singular: "card with a transfiguration", plural: "cards with a transfiguration" },
    { renderedTextIncludes: "Transfigured" }),
  predicate("discard_text", "ability", 1.2,
    { singular: "card with a 'discard' ability", plural: "cards with a 'discard' ability" },
    { renderedTextIncludes: "discard" }),
  predicate("abandon", "ability", 1.3,
    { singular: "card with an 'abandon' ability", plural: "cards with an 'abandon' ability" },
    { renderedTextIncludes: "Abandon" }),
  predicate("event_copying", "ability", 1.4,
    { singular: "card with an event-copying ability", plural: "cards with an event-copying ability" },
    { renderedTextIncludes: ["copy", "event"] }),
  predicate("energy_generation", "ability", 1.3,
    { singular: "card with an energy-generation ability", plural: "cards with an energy-generation ability" },
    { renderedTextIncludes: ["Gain", "●"] }),
  predicate("dissolve", "ability", 1.3,
    { singular: "card with a 'dissolve' ability", plural: "cards with a 'dissolve' ability" },
    { renderedTextIncludes: "Dissolve" }),
  predicate("reclaim", "ability", 1.3,
    { singular: "card with a 'reclaim' ability", plural: "cards with a 'reclaim' ability" },
    { renderedTextIncludes: "Reclaim" }),
]);

function predicate(
  id: string,
  kind: PredicateKind,
  multiplier: number,
  text: Predicate["text"],
  cardPredicate?: Predicate["cardPredicate"],
): Predicate {
  return Object.freeze({ id, kind, multiplier, text, cardPredicate });
}

const BY_ID = new Map(PREDICATES.map((p) => [p.id, p]));

export function getPredicate(id: string): Predicate {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown predicate id: ${id}`);
  return found;
}
