import type { JourneyManifest } from "../../manifest.js";
import { isRecord } from "../../validate/guards.js";
import {
  hasEnvelopeConstraint,
  hasPrecommitted,
} from "../../validate/precommitRules.js";
import { hasOdds } from "../../validate/randomContracts.js";
import { fail, type ValidationResult } from "../../validate/result.js";
import type { ShapeValidator } from "../types.js";

const SHAPE_ID = "risk_or_skip";
const DOWNSIDE_RULE_ID = "risk_or_skip_bounded_downside";

function isRiskDownsideEnvelope(value: unknown): value is Record<string, unknown> {
  return isRecord(value) &&
    hasEnvelopeConstraint(value, SHAPE_ID, DOWNSIDE_RULE_ID) &&
    (value.kind === "chance_to_gain_bane" || value.kind === "chance_to_pay_cost");
}

function textSignalsDownsideEnvelope(text: string): boolean {
  const hasPercentChance =
    /\b\d+%\s+chance\b/iu.test(text) ||
    /\b(?:chance|risk)\b.*\b\d+%\b/iu.test(text) ||
    /\b\d+%\b.*\b(?:chance|risk)\b/iu.test(text);
  const hasSafeAlternative = /\botherwise\b|\bno downside\b|\bsafe\b|\bnothing\b/iu.test(text);

  return hasPercentChance && hasSafeAlternative;
}

export function validateRiskOrSkip(manifest: JourneyManifest): ValidationResult {
  const acceptOptions = manifest.options.filter((option) => option.pickBehavior !== "leave");

  if (acceptOptions.length !== 1 || manifest.options.length - acceptOptions.length !== 1) {
    return fail(
      "one_take_option_and_one_refusal_option",
      "Risk-or-skip requires one accept option and one leave option",
    );
  }

  const acceptOption = acceptOptions[0]!;

  if (acceptOption.effects.length === 0 || acceptOption.effectConvertedEssence <= 0) {
    return fail(
      "accept_option_has_guaranteed_reward",
      "Risk-or-skip accept option requires a guaranteed reward",
    );
  }

  if (
    acceptOption.costs.length > 0 ||
    acceptOption.burdens.length > 0 ||
    acceptOption.costConvertedEssence > 0 ||
    acceptOption.burdenConvertedEssence < 0
  ) {
    return fail(
      "downside_is_random_inside_visible_envelope",
      "Risk-or-skip costs and burdens must be random outcomes, not guaranteed accept-option payloads",
    );
  }

  if (acceptOption.uncertaintyConvertedEssence >= 0 || !textSignalsDownsideEnvelope(acceptOption.text)) {
    return fail(
      "downside_is_random_inside_visible_envelope",
      "Risk-or-skip accept option must show bounded downside odds and a safe alternative",
    );
  }

  if (!hasPrecommitted(manifest.precommitted.random)) {
    return fail("missing_precommitted_outcomes", "Random shapes require precommitted outcomes");
  }

  const downsideRolls = manifest.precommitted.random?.filter(isRiskDownsideEnvelope) ?? [];

  if (downsideRolls.length < acceptOptions.length) {
    return fail(
      "downside_is_random_inside_visible_envelope",
      "Risk-or-skip precommit must store one typed constrained downside envelope per accept option",
    );
  }

  for (const roll of downsideRolls) {
    const hasBaneEnvelope = roll.kind === "chance_to_gain_bane" &&
      typeof roll.baneName === "string" &&
      typeof roll.count === "number" &&
      (roll.committedResult === "bane" || roll.committedResult === "safe");
    const hasCostEnvelope = roll.kind === "chance_to_pay_cost" &&
      isRecord(roll.cost) &&
      (roll.committedResult === "paid" || roll.committedResult === "free");

    if (!hasOdds(roll) || (!hasBaneEnvelope && !hasCostEnvelope)) {
      return fail(
        "downside_is_random_inside_visible_envelope",
        "Risk-or-skip precommit must store odds, typed downside metadata, and the committed safe/downside result",
      );
    }
  }

  return { ok: true };
}

export const riskOrSkipValidator: ShapeValidator = {
  ruleId: "risk_or_skip_envelope",
  passMessage:
    "Risk-or-skip envelopes expose bounded downside metadata when applicable.",
  validate: ({ manifest }) => validateRiskOrSkip(manifest),
};
