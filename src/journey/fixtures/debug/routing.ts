import type { DebugPayloadSelection } from "./metadata.js";
import type { GeneratedObjectDefinition } from "../../manifest.js";

export function isDebugResourceEdgeCasePayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "resource/resource-edge-cases";
}

export function isDebugNamedCardOperationMenuPayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "card/named-card-operation-menu";
}

export function isDebugStarterCleanupReplacementPayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "card/starter-cleanup-replacement";
}

export function isDebugNamedDreamsignShopRowPayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "dreamsign/named-dreamsign-shop-row";
}

export function isDebugDreamsignTransformDuplicatePoolPayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "dreamsign/dreamsign-transform-duplicate-pool";
}

export function isDebugBaneGainPurgeTransformPayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "bane/bane-gain-purge-transform";
}

export function isDebugRouteEditsPayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "route/route-edits";
}

export function isDebugShopEconomyPayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "shop/shop-economy";
}

export function isDebugDreamwellWindowPayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "dreamwell/dreamwell-window";
}

export function isDebugStatusRewardReplacementPayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "status/status-reward-replacement";
}

export function isDebugDelayedTriggerMatrixPayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "hook/delayed-trigger-matrix";
}

export function isDebugPairedReturnSealBorrowTradePayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "return/paired-return-seal-borrow-trade";
}

export function isDebugRandomRevealRollWagerPayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "random/reveal-roll-wager";
}

export function isDebugCompleteDecisionTreePayload(
  debugPayload: DebugPayloadSelection | undefined,
): boolean {
  return debugPayload?.qaId === "decision_tree/complete-decision-tree";
}

export function debugGeneratedObjectVariant(
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
