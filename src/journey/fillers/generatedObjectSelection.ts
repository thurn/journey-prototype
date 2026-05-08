import { drawInt, weightedChoice, type DrawContext } from "../../util/rng.js";
import type { GeneratedObjectDefinition, JourneyStage } from "../manifest.js";
import { getShapePlugin, type JourneyShapeId } from "../shapes.js";

export function naturalGeneratedObjectKind(args: {
  drawContext: DrawContext;
  shapeId: JourneyShapeId;
  stage: JourneyStage;
}): GeneratedObjectDefinition["generatedObjectKind"] | undefined {
  const policy = getShapePlugin(args.shapeId).generatedObjects;

  if (policy?.natural !== true) {
    return undefined;
  }

  const stageChance = args.stage === "early" ? 1 : args.stage === "mid" ? 3 : 7;
  const weirdnessBonus = policy.highWeirdness === true
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
