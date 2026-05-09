import type { JourneyManifest, JourneyOperation } from "../../manifest.js";
import { isRecord } from "../../validate/guards.js";
import { fail, type ValidationResult } from "../../validate/result.js";

type TimedWindowDescriptor = {
  scope: string;
  duration: string;
};

function timedWindowDescriptor(operation: JourneyOperation): TimedWindowDescriptor | undefined {
  const record = operation.payload;
  const declaredScope = typeof record.timedWindowScope === "string"
    ? record.timedWindowScope
    : undefined;
  const declaredDuration = isRecord(record.timedWindowDuration)
    ? record.timedWindowDuration
    : undefined;

  if (
    !declaredScope ||
    !declaredDuration ||
    !isMeaningfulDurationForScope(declaredScope, declaredDuration) ||
    (record.affectedPlayer !== "you" &&
      record.affectedPlayer !== "opponent" &&
      record.affectedPlayer !== "both_players") ||
    typeof record.affectedObjectClass !== "string" ||
    typeof record.windowModifier !== "string" ||
    typeof record.amount !== "number" ||
    typeof record.windowValue !== "number" ||
    (record.polarity !== "positive" &&
      record.polarity !== "negative" &&
      record.polarity !== "neutral" &&
      record.polarity !== "mixed")
  ) {
    return undefined;
  }

  return {
    scope: declaredScope,
    duration: `${declaredDuration.durationKind}:${declaredDuration.count}`,
  };
}

function isNegativeDreamwellPayload(record: Record<string, unknown>): boolean {
  return record.kind === "dreamwell_modifier" &&
    ((record.cardRole === "penalty" && record.polarity !== "positive") ||
      record.polarity === "negative" ||
      (typeof record.windowValue === "number" && record.windowValue < 0));
}

function isMeaningfulDurationForScope(scope: string, duration: Record<string, unknown>): boolean {
  if (typeof duration.count !== "number" || duration.count < 2) {
    return false;
  }

  switch (scope) {
    case "battle":
    case "battle_object":
    case "dreamwell":
    case "temporary_object":
      return duration.durationKind === "battle_count";
    case "shop":
      return duration.durationKind === "shop_count";
    case "route":
      return duration.durationKind === "dreamscape_count";
    default:
      return false;
  }
}

export function validateTimedWindowMenu(manifest: JourneyManifest): ValidationResult {
  const sharedWindowKeys = new Set<string>();

  for (const option of manifest.options.filter((entry) => entry.pickBehavior !== "leave")) {
    const windows = option.operations
      .map(timedWindowDescriptor)
      .filter((entry): entry is TimedWindowDescriptor => entry !== undefined);

    if (windows.length === 0) {
      return fail(
        "timed_window_requires_temporary_window",
        "Timed window options must use a meaningful temporary battle, Dreamwell, shop, route, or object window",
      );
    }

    for (const window of windows) {
      sharedWindowKeys.add(`${window.scope}:${window.duration}`);
    }

    const invalidDreamwellReward = option.operations.some((operation) =>
      isNegativeDreamwellPayload(operation.payload) &&
      operation.role !== "burden"
    );

    if (invalidDreamwellReward) {
      return fail(
        "timed_window_dreamwell_penalty_must_be_burden",
        "Penalty Dreamwell cards and negative Dreamwell windows must be modeled as burdens",
      );
    }

    const hasResourceReward = option.operations.some((operation) =>
      operation.operationKind === "reward" &&
      operation.rewardKind === "resource"
    );
    const hasShopResourceTiming = option.operations.some((operation) =>
      operation.operationKind === "reward" &&
      operation.rewardKind === "shop_economy_modifier" &&
      operation.payload.economyOperationKind === "next_shop_essence_restore"
    ) && option.operations.some((operation) =>
      operation.operationKind === "reward" &&
      operation.rewardKind === "resource" &&
      operation.payload.shopEconomyTiming === "before_next_shop"
    );

    if (hasResourceReward && !hasShopResourceTiming) {
      return fail(
        "timed_window_resource_only_reward",
        "Timed window options must alter temporary play rules rather than grant plain resources",
      );
    }

    if (Math.abs(option.netConvertedEssence) < 120) {
      return fail(
        "timed_window_low_impact",
        "Timed window options must be impactful enough to define upcoming battles",
      );
    }
  }

  if (sharedWindowKeys.size > 1) {
    return fail(
      "timed_window_options_must_share_window",
      "Timed window options must share the same temporary timing window",
    );
  }

  return { ok: true };
}
