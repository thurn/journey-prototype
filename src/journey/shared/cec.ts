// src/journey/shared/cec.ts
import type { Predicate } from "./types.js";

export const CARD_CEC = 40;

export const STAGE_MULTIPLIER = 1.0;

export function cardPoolCEC(
  perItem: number,
  count: number,
  predicate: Predicate,
  stageMultiplier: number = STAGE_MULTIPLIER,
): number {
  return perItem * count * predicate.multiplier * stageMultiplier;
}
