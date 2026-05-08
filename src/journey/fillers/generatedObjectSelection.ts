import { drawInt, weightedChoice, type DrawContext } from "../../util/rng.js";
import type { GeneratedObjectDefinition, JourneyStage } from "../manifest.js";
import type { JourneyShapeId } from "../shapes.js";

export const NATURAL_GENERATED_OBJECT_SHAPE_IDS = new Set<JourneyShapeId>([
  "random_allocation",
  "same_cost_different_rewards",
  "same_reward_different_costs",
  "service_menu",
  "shop_row",
  "curated_reward_trio",
  "one_target_many_operations",
  "mirrored_operations",
  "one_operation_many_targets",
]);

export const HIGH_WEIRDNESS_GENERATED_OBJECT_SHAPE_IDS =
  new Set<JourneyShapeId>([
    "random_allocation",
    "one_target_many_operations",
    "mirrored_operations",
    "one_operation_many_targets",
  ]);

export function naturalGeneratedObjectKind(args: {
  drawContext: DrawContext;
  shapeId: JourneyShapeId;
  stage: JourneyStage;
}): GeneratedObjectDefinition["generatedObjectKind"] | undefined {
  if (!NATURAL_GENERATED_OBJECT_SHAPE_IDS.has(args.shapeId)) {
    return undefined;
  }

  const stageChance = args.stage === "early" ? 1 : args.stage === "mid" ? 3 : 7;
  const weirdnessBonus = HIGH_WEIRDNESS_GENERATED_OBJECT_SHAPE_IDS.has(
    args.shapeId,
  )
    ? args.stage === "early"
      ? 2
      : args.stage === "mid"
        ? 4
        : 6
    : 0;
  const chance = stageChance + weirdnessBonus;
  const roll = drawInt(
    args.drawContext,
    `generated-object:${args.stage}:${args.shapeId}:gate`,
    1,
    100,
  );

  if (roll > chance) {
    return undefined;
  }

  return weightedChoice(
    args.drawContext,
    `generated-object:${args.stage}:${args.shapeId}:kind`,
    [
      { item: "card" as const, weight: args.stage === "early" ? 4 : 3 },
      { item: "dreamsign" as const, weight: args.stage === "late" ? 4 : 2 },
      { item: "status" as const, weight: args.stage === "mid" ? 4 : 2 },
      {
        item: "transfiguration" as const,
        weight: args.stage === "late" ? 4 : 1,
      },
    ],
  );
}
