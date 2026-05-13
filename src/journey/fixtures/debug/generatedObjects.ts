import type { GeneratedObjectDefinition } from "../../manifest.js";

type GeneratedObjectKind = Exclude<
  GeneratedObjectDefinition["generatedObjectKind"],
  "dreamsign" | "status"
>;

export function debugGeneratedObjectDefinition(
  kind: GeneratedObjectKind,
): GeneratedObjectDefinition {
  const definitions: Record<GeneratedObjectKind, GeneratedObjectDefinition> = {
    card: {
      generatedObjectKind: "card",
      generatedObjectId: "generated-card-rain-lantern",
      name: "Rain Lantern",
      objectType: "Event Card",
      rulesText:
        "0 energy Event. Fast. Gain 1 omen, then the next card you draft costs 25 less essence.",
      tags: ["journey-only", "card", "event", "fast", "late"],
      references: {
        rules: ["Fast", "omens", "essence", "card"],
      },
      lifetime: "journey_only",
      valueEstimate: {
        convertedEssence: 150,
        confidence: "medium",
        basis:
          "Fast zero-cost card plus one omen and a bounded draft discount.",
      },
      validation: {
        source: "generated_manifest_local",
        status: "validated",
        ruleIds: [
          "stable_id",
          "card_rules_text",
          "value_estimate",
          "manifest_local",
        ],
      },
      payload: {
        energyCost: 0,
        cardType: "Event",
        keywords: ["Fast"],
        source: "manifest_generated",
      },
    },
    transfiguration: {
      generatedObjectKind: "transfiguration",
      generatedObjectId: "generated-transfiguration-glass",
      name: "Glass Transfiguration",
      objectType: "Transfiguration",
      rulesText:
        "A Glass card gains Fast and Reclaim 1. When it dissolves, gain 60 essence.",
      tags: ["journey-only", "transfiguration", "card", "fast", "reclaim"],
      references: {
        rules: ["Fast", "Reclaim", "essence", "card", "transfiguration"],
      },
      lifetime: "journey_only",
      valueEstimate: {
        convertedEssence: 145,
        confidence: "medium",
        basis:
          "Slightly above Viridian due to Fast, Reclaim, and a conditional essence payout.",
      },
      validation: {
        source: "generated_manifest_local",
        status: "validated",
        ruleIds: [
          "stable_id",
          "transfiguration_rules_text",
          "value_estimate",
          "manifest_local",
        ],
      },
      payload: {
        generatedTransfigurationName: "Glass",
        keywords: ["Fast", "Reclaim"],
        source: "manifest_generated",
      },
    },
  };

  return definitions[kind];
}
