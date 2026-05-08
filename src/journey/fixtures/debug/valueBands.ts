import type { DebugPayloadSelection } from "./metadata.js";
import type { JourneyOption } from "../../manifest.js";
import {
  isDebugDreamwellWindowPayload,
  isDebugShopEconomyPayload,
  isDebugStatusRewardReplacementPayload,
} from "./routing.js";
import {
  isResourceBandLegacyKind,
  operationReceivesResourceBands,
  recordKind,
} from "./decisionTree.js";
import { RESOURCE_EDGE_CASE_VALUE_BANDS } from "../../fillers/shared.js";

export function forcedTimedPayloadPrecommits(
  debugPayload: DebugPayloadSelection | undefined,
  options: readonly JourneyOption[],
): unknown[] {
  if (
    !isDebugShopEconomyPayload(debugPayload) &&
    !isDebugDreamwellWindowPayload(debugPayload) &&
    !isDebugStatusRewardReplacementPayload(debugPayload)
  ) {
    return [];
  }

  const isTimedPayload = (
    payload: unknown,
  ): payload is Record<string, unknown> => {
    if (
      typeof payload !== "object" ||
      payload === null ||
      Array.isArray(payload)
    ) {
      return false;
    }

    const timing = (payload as Record<string, unknown>).timing;

    return (
      typeof timing === "string" &&
      (timing.includes("next") ||
        timing.includes("after") ||
        timing.includes("following") ||
        timing.includes("future"))
    );
  };

  return options.flatMap((journeyOption) =>
    [...journeyOption.effects, ...journeyOption.burdens]
      .filter(isTimedPayload)
      .map((payload) => ({
        optionNumber: journeyOption.number,
        trigger:
          typeof payload.timing === "string"
            ? payload.timing
            : "committed trigger",
        reward: payload,
      })),
  );
}

export function withValueBands(value: unknown): unknown {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? {
        ...value,
        valueBands: RESOURCE_EDGE_CASE_VALUE_BANDS,
      }
    : value;
}

export function withResourceEdgeCaseValueBands(
  options: readonly JourneyOption[],
): JourneyOption[] {
  return options.map((journeyOption) => ({
    ...journeyOption,
    effects: journeyOption.effects.map((effect) =>
      isResourceBandLegacyKind(recordKind(effect))
        ? withValueBands(effect)
        : effect,
    ),
    operations: journeyOption.operations.map((operation) =>
      operationReceivesResourceBands(operation)
        ? {
            ...operation,
            value: {
              ...(operation.value ?? {}),
              bands: RESOURCE_EDGE_CASE_VALUE_BANDS.map((band) => ({
                ...band,
              })),
            },
            payload: {
              ...operation.payload,
              valueBands: RESOURCE_EDGE_CASE_VALUE_BANDS.map((band) => ({
                ...band,
              })),
            },
          }
        : operation,
    ),
  }));
}
