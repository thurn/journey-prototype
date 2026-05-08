import type { JourneyManifest, JourneyOperation } from "../manifest.js";
import {
  LOSS_CHOICE_VALUE_CONSTANTS,
  POSITIVE_MENU_VALUE_CONSTANTS,
} from "../value.js";
import { isRecord } from "./guards.js";
import { fail, type ValidationResult } from "./result.js";

export function validateChooseYourLossValues(nets: readonly number[]): ValidationResult {
  if (nets.some((net) => net >= 0)) {
    return fail("invalid_positive_negative_framing", "choose_your_loss options must be negative outcomes");
  }

  const magnitudes = nets
    .map((net) => Math.abs(net))
    .sort((left, right) => left - right);
  const lowest = magnitudes[0] ?? 0;
  const highest = magnitudes[magnitudes.length - 1] ?? 0;

  if (lowest < LOSS_CHOICE_VALUE_CONSTANTS.minimumComparableMagnitude) {
    return fail("loss_not_comparable", "choose_your_loss options must use meaningful loss magnitudes");
  }

  if (highest / lowest > LOSS_CHOICE_VALUE_CONSTANTS.maximumComparableRatio) {
    return fail("loss_not_comparable", "choose_your_loss options must be comparable damage-control choices");
  }

  return { ok: true };
}

export function validateCommitNowFuturePayoffValues(nets: readonly number[]): ValidationResult {
  if (nets.length !== 3 || nets.some((net) => net <= 0)) {
    return fail(
      "option_values_are_comparable_for_shape",
      "commit_now_future_payoff options must all be positive commitments",
    );
  }

  const lowest = Math.min(...nets);
  const highest = Math.max(...nets);

  if (highest - lowest > 75) {
    return fail(
      "option_values_are_comparable_for_shape",
      "commit_now_future_payoff options must be comparable future-payoff choices",
    );
  }

  return { ok: true };
}

export const POSITIVE_MENU_COMPARABLE_SHAPES = new Set<JourneyManifest["shapeId"]>([
  "random_allocation",
  "same_cost_different_rewards",
  "service_menu",
  "curated_reward_trio",
  "heterogeneous_pair",
  "one_target_many_operations",
  "mirrored_operations",
  "one_operation_many_targets",
  "single_reward",
  "timed_window_menu",
  "single_random_outcome",
]);

export function validatePositiveMenuValues(
  shapeId: JourneyManifest["shapeId"],
  nets: readonly number[],
): ValidationResult {
  if (!POSITIVE_MENU_COMPARABLE_SHAPES.has(shapeId)) {
    return { ok: true };
  }

  const positiveNets = nets.filter((net) => net > 0);

  if (positiveNets.length < 2) {
    return { ok: true };
  }

  const lowest = Math.min(...positiveNets);
  const highest = Math.max(...positiveNets);
  const minimumComparableValue = Math.max(
    highest - POSITIVE_MENU_VALUE_CONSTANTS.maximumComparableSpread,
    highest * POSITIVE_MENU_VALUE_CONSTANTS.minimumComparableRatio,
  );

  if (lowest < minimumComparableValue) {
    return fail(
      "option_values_are_comparable_for_shape",
      `${shapeId} positive options must stay in comparable value bands`,
    );
  }

  return { ok: true };
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
