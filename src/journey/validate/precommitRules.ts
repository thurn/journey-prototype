import type { JourneyManifest } from "../manifest.js";
import { isRecord } from "./guards.js";

export function hasPrecommitted(
  precommitted: unknown[] | Record<string, unknown> | undefined,
): boolean {
  if (Array.isArray(precommitted)) {
    return precommitted.length > 0;
  }

  return isRecord(precommitted) && Object.keys(precommitted).length > 0;
}

export function hasEnvelopeConstraint(
  value: Record<string, unknown>,
  shapeId: JourneyManifest["shapeId"],
  ruleId: string,
): boolean {
  return Array.isArray(value.constraints) &&
    value.constraints.some((constraint) =>
      isRecord(constraint) &&
      constraint.constraintKind === "shape_invariant" &&
      constraint.shapeId === shapeId &&
      constraint.ruleId === ruleId
    );
}
