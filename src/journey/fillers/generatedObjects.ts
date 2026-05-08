import type { GeneratedObjectDefinition, JourneyOption } from "../manifest.js";
import { option } from "./shared.js";

export function generatedObjectDuration(
  label: string,
  count: number = 3,
): GeneratedObjectDefinition["duration"] {
  return {
    durationKind: "battle_count",
    count,
    label,
  };
}

export function generatedObjectDefinition(
  kind: GeneratedObjectDefinition["generatedObjectKind"],
): GeneratedObjectDefinition {
  const definitions: Record<
    GeneratedObjectDefinition["generatedObjectKind"],
    GeneratedObjectDefinition
  > = {
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
    dreamsign: {
      generatedObjectKind: "dreamsign",
      generatedObjectId: "generated-dreamsign-mirror-moon",
      name: "Mirror Moon",
      objectType: "Dreamsign",
      rulesText:
        "The next time you gain a Dreamsign, choose one: duplicate it, or gain 90 essence.",
      tags: ["journey-only", "dreamsign", "choice", "late"],
      references: {
        rules: ["dreamsign", "essence"],
      },
      duration: generatedObjectDuration("until the next Dreamsign gain", 3),
      lifetime: "until_returned",
      valueEstimate: {
        convertedEssence: 155,
        confidence: "medium",
        basis:
          "Comparable to a named Dreamsign with a narrow one-time trigger.",
      },
      validation: {
        source: "generated_manifest_local",
        status: "validated",
        ruleIds: [
          "stable_id",
          "dreamsign_rules_text",
          "duration",
          "value_estimate",
          "manifest_local",
        ],
      },
      payload: {
        trigger: "next Dreamsign gain",
        choices: ["duplicate gained Dreamsign", "gain 90 essence"],
        source: "manifest_generated",
      },
    },
    status: {
      generatedObjectKind: "status",
      generatedObjectId: "generated-status-afterimage-oath",
      name: "Afterimage Oath",
      objectType: "Quest Status",
      rulesText:
        "For the next 3 battles, the first card you purge each battle returns as a temporary copy for that battle.",
      tags: ["journey-only", "status", "battle", "temporary"],
      references: {
        rules: ["battle", "card"],
      },
      duration: generatedObjectDuration("next 3 battles", 3),
      lifetime: "temporary",
      valueEstimate: {
        convertedEssence: 135,
        confidence: "medium",
        basis: "Temporary battle rule with bounded card-copy upside.",
      },
      validation: {
        source: "generated_manifest_local",
        status: "validated",
        ruleIds: [
          "stable_id",
          "status_scope",
          "duration",
          "value_estimate",
          "manifest_local",
        ],
      },
      payload: {
        statusScope: "battle",
        affectedObject: "card",
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

export function generatedObjectPayload(args: {
  kind:
    | "generated_object_create"
    | "generated_object_grant"
    | "generated_object_transform"
    | "generated_object_temporary_grant"
    | "generated_object_return"
    | "generated_object_trade";
  generatedObject: GeneratedObjectDefinition;
  operation: string;
  duration?: string;
  extra?: Record<string, unknown>;
}) {
  return {
    kind: args.kind,
    generatedObjectOperationKind: args.operation,
    generatedObjectId: args.generatedObject.generatedObjectId,
    generatedObjectKind: args.generatedObject.generatedObjectKind,
    generatedObjectName: args.generatedObject.name,
    generatedObjectReferenceKind: "definition",
    rulesText: args.generatedObject.rulesText,
    timing: "immediate",
    source: "manifest_generated",
    ...(args.duration ? { duration: args.duration } : {}),
    ...(args.extra ?? {}),
  };
}

export function generatedObjectOptions(
  generatedObject: GeneratedObjectDefinition,
): JourneyOption[] {
  const compactRules = `${generatedObject.name}: ${generatedObject.rulesText}`;
  const grant = generatedObjectPayload({
    kind: "generated_object_grant",
    generatedObject,
    operation: "grant",
  });
  const create = generatedObjectPayload({
    kind: "generated_object_create",
    generatedObject,
    operation: "create",
  });
  const transform = generatedObjectPayload({
    kind: "generated_object_transform",
    generatedObject,
    operation: "transform",
    extra: {
      transformIntoGeneratedObjectId: generatedObject.generatedObjectId,
    },
  });
  const temporary = generatedObjectPayload({
    kind: "generated_object_temporary_grant",
    generatedObject,
    operation: "temporary_grant",
    duration: generatedObject.duration?.label ?? "next 3 battles",
    extra: { temporary: true },
  });
  const returned = generatedObjectPayload({
    kind: "generated_object_return",
    generatedObject,
    operation: "return",
    duration: "at the next Dream Journey site",
  });
  const trade = generatedObjectPayload({
    kind: "generated_object_trade",
    generatedObject,
    operation: "trade",
    extra: { tradeFor: "120 essence" },
  });
  const value = generatedObject.valueEstimate.convertedEssence;

  return [
    option({
      number: 1,
      text: `Create and gain {${generatedObject.name}}. ${compactRules}`,
      effects: [create, grant],
      effect: value,
    }),
    option({
      number: 2,
      text: `Transform a chosen eligible object into {${generatedObject.name}}. ${compactRules}`,
      effects: [transform],
      effect: Math.max(120, value - 10),
      uncertainty: -10,
    }),
    option({
      number: 3,
      text: `Gain {${generatedObject.name}} temporarily, then return it at the next Dream Journey site or trade it for 120 essence after using it once. ${compactRules}`,
      effects: [temporary, trade],
      triggers: [returned],
      effect: Math.max(105, value - 25),
      uncertainty: -12,
    }),
  ];
}
