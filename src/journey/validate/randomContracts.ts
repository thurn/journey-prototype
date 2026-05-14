import { isRecord } from "./guards.js";
import { fail, type ValidationResult } from "./result.js";

const typedRandomEnvelopeKinds = new Set([
  "visible_pool",
  "random_cost",
  "random_reward",
  "chance_to_gain_bane",
  "chance_to_pay_cost",
  "reveal_rewards",
  "choose_one_revealed_reward",
  "choose_one_random_revealed_reward",
  "gain_one_random_reward",
  "roll_twice_keep_one",
  "repeated_pool_draws",
  "random_range",
  "wager",
  "push_choice",
  "complete_decision_tree",
]);

const legacyDebugRandomPrecommitKinds = new Set([
  "dreamsign_random_reward",
  "bane_random_purge",
  "resource_random_range",
]);

function claimsRandomEnvelopeContract(value: Record<string, unknown>): boolean {
  return isRecord(value.visibilityPolicy) ||
    isRecord(value.odds) ||
    Array.isArray(value.constraints) ||
    typeof value.expectedConvertedEssence === "number" ||
    typeof value.riskPremiumConvertedEssence === "number" ||
    typeof value.presentation === "string";
}

export function hasOdds(value: unknown): boolean {
  return isRecord(value) &&
    isRecord(value.odds) &&
    typeof value.odds.percent === "number" &&
    value.odds.percent > 0 &&
    value.odds.percent < 100;
}

export function validateRandomOdds(value: unknown): ValidationResult {
  if (!isRecord(value)) {
    return fail("invalid_random_odds", "Random odds must be structured");
  }

  if (
    !isRecord(value.odds) ||
    typeof value.odds.numerator !== "number" ||
    typeof value.odds.denominator !== "number" ||
    typeof value.odds.percent !== "number" ||
    value.odds.denominator <= 0 ||
    value.odds.numerator <= 0 ||
    value.odds.numerator >= value.odds.denominator ||
    value.odds.percent <= 0 ||
    value.odds.percent >= 100
  ) {
    return fail("invalid_random_odds", "Random odds require positive bounded numerator, denominator, and percent");
  }

  return { ok: true };
}

export function validateRandomVisibilityPolicy(value: unknown): ValidationResult {
  if (!isRecord(value)) {
    return fail("hidden_outcome_disclosure", "Random envelopes require an explicit visibility policy");
  }

  if (
    value.outcomeVisibility !== "visible" &&
    value.outcomeVisibility !== "hidden_until_resolution" &&
    value.outcomeVisibility !== "delayed" &&
    value.outcomeVisibility !== "pre_rolled" &&
    value.outcomeVisibility !== "resolved" &&
    value.outcomeVisibility !== "debug_only"
  ) {
    return fail("invalid_random_visibility", "Random visibility must be visible, hidden, delayed, pre-rolled, resolved, or debug-only");
  }

  if (typeof value.disclosure !== "string" || value.disclosure.length === 0) {
    return fail("hidden_outcome_disclosure", "Hidden or delayed random outcomes require disclosure text");
  }

  if (typeof value.playerVisible !== "boolean") {
    return fail("invalid_random_visibility", "Random visibility policy must state whether the outcome is player-visible");
  }

  return { ok: true };
}

export function validateRandomPool(value: Record<string, unknown>): ValidationResult {
  const rewards = value.rewards;

  if (!Array.isArray(rewards) || rewards.length === 0) {
    return fail("empty_random_pool", "Random pool envelopes require at least one reward");
  }

  if (
    value.replacement !== undefined &&
    value.replacement !== "with_replacement" &&
    value.replacement !== "without_replacement" &&
    value.replacement !== "precommitted_order"
  ) {
    return fail("invalid_random_replacement_policy", "Random pool replacement policy must be with, without, or precommitted order");
  }

  return { ok: true };
}

export function validateRevealEnvelope(value: Record<string, unknown>): ValidationResult {
  const poolResult = validateRandomPool(value);
  if (!poolResult.ok) {
    return poolResult;
  }

  if (
    typeof value.revealCount !== "number" ||
    value.revealCount < 1 ||
    !Array.isArray(value.rewards) ||
    value.revealCount > value.rewards.length
  ) {
    return fail("incoherent_reveal_count", "Reveal envelopes require a reveal count within the reward pool size");
  }

  return { ok: true };
}

export function validateRandomRangeEnvelope(value: Record<string, unknown>): ValidationResult {
  if (
    typeof value.minimum !== "number" ||
    typeof value.maximum !== "number" ||
    value.minimum > value.maximum
  ) {
    return fail("incoherent_random_range_bounds", "Random ranges require minimum <= maximum");
  }

  if (
    typeof value.committedAmount !== "number" ||
    value.committedAmount < value.minimum ||
    value.committedAmount > value.maximum
  ) {
    return fail("incoherent_random_range_bounds", "Committed random range amount must fall within bounds");
  }

  return { ok: true };
}

export function validateRandomEnvelopePayload(value: unknown): ValidationResult {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return fail("invalid_random_envelope", "Random precommits require a structured kind");
  }

  const kind = value.kind;
  if (legacyDebugRandomPrecommitKinds.has(kind)) {
    return { ok: true };
  }

  if (!typedRandomEnvelopeKinds.has(kind) && claimsRandomEnvelopeContract(value)) {
    return fail("unknown_random_envelope_kind", `Random precommits do not support unknown envelope kind ${kind}`);
  }

  if (!typedRandomEnvelopeKinds.has(kind)) {
    return { ok: true };
  }

  if (value.constraints !== undefined) {
    if (!Array.isArray(value.constraints)) {
      return fail("invalid_random_envelope_constraint", "Random envelope constraints must be structured");
    }

    for (const constraint of value.constraints) {
      if (
        !isRecord(constraint) ||
        constraint.constraintKind !== "shape_invariant" ||
        typeof constraint.shapeId !== "string" ||
        typeof constraint.ruleId !== "string" ||
        typeof constraint.label !== "string" ||
        constraint.label.length === 0
      ) {
        return fail("invalid_random_envelope_constraint", "Random envelope constraints require shape, rule, and label metadata");
      }
    }
  }

  const visibilityResult = validateRandomVisibilityPolicy(value.visibilityPolicy);
  if (!visibilityResult.ok) {
    return visibilityResult;
  }

  if (value.odds !== undefined) {
    const oddsResult = validateRandomOdds(value);
    if (!oddsResult.ok) {
      return oddsResult;
    }
  }

  if (
    kind === "visible_pool" ||
    kind === "gain_one_random_reward" ||
    kind === "repeated_pool_draws"
  ) {
    const poolResult = validateRandomPool(value);
    if (!poolResult.ok) {
      return poolResult;
    }
  }

  if (
    kind === "reveal_rewards" ||
    kind === "choose_one_revealed_reward" ||
    kind === "choose_one_random_revealed_reward"
  ) {
    const revealResult = validateRevealEnvelope(value);
    if (!revealResult.ok) {
      return revealResult;
    }
  }

  if (kind === "random_range") {
    const rangeResult = validateRandomRangeEnvelope(value);
    if (!rangeResult.ok) {
      return rangeResult;
    }
  }

  if (
    kind === "chance_to_gain_bane" ||
    kind === "chance_to_pay_cost" ||
    kind === "random_cost" ||
    kind === "wager" ||
    kind === "push_choice"
  ) {
    const oddsResult = validateRandomOdds(value);
    if (!oddsResult.ok) {
      return oddsResult;
    }
  }

  if (kind === "roll_twice_keep_one") {
    if (
      !Array.isArray(value.rolls) ||
      value.rolls.length !== 2 ||
      !value.rolls.every((roll) => typeof roll === "number") ||
      typeof value.keptRoll !== "number"
    ) {
      return fail("invalid_roll_twice_payload", "Roll-twice envelopes require two rolls and one kept roll");
    }

    if (!value.rolls.includes(value.keptRoll)) {
      return fail("invalid_roll_twice_payload", "Roll-twice kept roll must be one of the committed rolls");
    }
  }

  if (
    kind === "complete_decision_tree" &&
    (!Array.isArray(value.nodes) ||
      value.nodes.length === 0 ||
      !Array.isArray(value.stopBranchIds) ||
      !Array.isArray(value.failureBranchIds) ||
      !Array.isArray(value.rewardBranchIds))
  ) {
    return fail("incomplete_decision_tree_precommit", "Complete decision-tree precommit requires nodes, stop branches, failure branches, and reward branches");
  }

  return { ok: true };
}
