import type { JourneyManifest } from "../manifest.js";
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
    const records = [
      ...option.effects.filter(isRecord),
      ...option.routeEffects.filter(isRecord),
      ...option.operations.map((operation) => operation.payload),
    ];
    const windows = records
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

    if (records.some((record) => record.kind === "gain_omens" || record.kind === "gain_essence")) {
      return fail(
        "timed_window_resource_only_reward",
        "Timed window options must alter temporary play rules rather than grant plain resources",
      );
    }

    if (option.netConvertedEssence < 120) {
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

function timedWindowDescriptor(record: Record<string, unknown>): TimedWindowDescriptor | undefined {
  const duration = typeof record.duration === "string" ? record.duration : undefined;
  const declaredScope = typeof record.timedWindowScope === "string"
    ? record.timedWindowScope
    : undefined;

  if (declaredScope && duration && isMeaningfulDurationForScope(declaredScope, duration)) {
    return { scope: declaredScope, duration };
  }

  if (
    duration &&
    /^next [2-9]\d* battles$/u.test(duration) &&
    (
      record.kind === "battle_window_modifier" ||
      record.kind === "card_rewrite" ||
      record.kind === "card_opening_hand" ||
      record.kind === "card_temporary_copy" ||
      record.kind === "dreamsign_temporary_grant" ||
      record.kind === "generated_object_temporary_grant" ||
      record.kind === "dreamwell_modifier"
    )
  ) {
    return {
      scope: record.kind === "dreamwell_modifier" ? "dreamwell" : "battle",
      duration,
    };
  }

  if (
    duration &&
    /^next [2-9]\d* future shops$/u.test(duration) &&
    record.kind === "shop_economy_modifier"
  ) {
    return { scope: "shop", duration };
  }

  if (
    duration &&
    /^next [2-9]\d* dreamscapes$/u.test(duration) &&
    typeof record.routeOperationKind === "string"
  ) {
    return { scope: "route", duration };
  }

  return undefined;
}

function isMeaningfulDurationForScope(scope: string, duration: string): boolean {
  switch (scope) {
    case "battle":
    case "dreamwell":
    case "temporary_object":
      return /^next [2-9]\d* battles$/u.test(duration);
    case "shop":
      return /^next [2-9]\d* future shops$/u.test(duration);
    case "route":
      return /^next [2-9]\d* dreamscapes$/u.test(duration);
    default:
      return false;
  }
}
