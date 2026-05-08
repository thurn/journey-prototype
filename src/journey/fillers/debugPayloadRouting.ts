import { drawInt, weightedChoice, type DrawContext } from "../../util/rng.js";
import type { DebugPayloadSelection } from "../debugPayloads.js";
import type { GeneratedObjectDefinition, JourneyStage } from "../manifest.js";
import { type JourneyShapeId } from "../shapes.js";

export function isResourceEdgeCasePayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "resource/resource-edge-cases";
}

export function isNamedCardOperationMenuPayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "card/named-card-operation-menu";
}

export function isStarterCleanupReplacementPayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "card/starter-cleanup-replacement";
}

export function isNamedDreamsignShopRowPayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "dreamsign/named-dreamsign-shop-row";
}

export function isDreamsignTransformDuplicatePoolPayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "dreamsign/dreamsign-transform-duplicate-pool";
}

export function isBaneGainPurgeTransformPayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "bane/bane-gain-purge-transform";
}

export function isRouteEditsPayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "route/route-edits";
}

export function isShopEconomyPayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "shop/shop-economy";
}

export function isDreamwellWindowPayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "dreamwell/dreamwell-window";
}

export function isStatusRewardReplacementPayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "status/status-reward-replacement";
}

export function isDelayedTriggerMatrixPayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "hook/delayed-trigger-matrix";
}

export function isPairedReturnSealBorrowTradePayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "return/paired-return-seal-borrow-trade";
}

export function isRandomRevealRollWagerPayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "random/reveal-roll-wager";
}

export function isCompleteDecisionTreePayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "decision_tree/complete-decision-tree";
}

export function generatedObjectVariant(
  debugPayload: DebugPayloadSelection | undefined,
): GeneratedObjectDefinition["generatedObjectKind"] | undefined {
  switch (debugPayload?.qaId) {
    case "generated_object/generated-card":
      return "card";
    case "generated_object/generated-dreamsign":
      return "dreamsign";
    case "generated_object/generated-status":
      return "status";
    case "generated_object/generated-transfiguration":
      return "transfiguration";
    default:
      return undefined;
  }
}

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
  debugPayload?: DebugPayloadSelection;
  drawContext: DrawContext;
  shapeId: JourneyShapeId;
  stage: JourneyStage;
}): GeneratedObjectDefinition["generatedObjectKind"] | undefined {
  if (
    args.debugPayload ||
    !NATURAL_GENERATED_OBJECT_SHAPE_IDS.has(args.shapeId)
  ) {
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
