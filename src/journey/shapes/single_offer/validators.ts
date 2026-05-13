import type { JourneyManifest, JourneyOption } from "../../manifest.js";
import { fail, type ValidationResult } from "../../validate/result.js";
import type { ShapeValidator } from "../types.js";

function hasReward(option: JourneyOption): boolean {
  return option.effects.length > 0 && option.effectConvertedEssence > 0;
}

function hasMeaningfulTrade(option: JourneyOption): boolean {
  return (
    option.costs.length > 0 ||
    option.burdens.length > 0 ||
    option.costConvertedEssence > 0 ||
    option.burdenConvertedEssence < 0
  );
}

function isNoEffectLeave(option: JourneyOption): boolean {
  return (
    option.pickBehavior === "leave" &&
    option.effects.length === 0 &&
    option.costs.length === 0 &&
    option.burdens.length === 0 &&
    option.triggers.length === 0 &&
    option.routeEffects.length === 0 &&
    option.effectConvertedEssence === 0 &&
    option.costConvertedEssence === 0 &&
    option.burdenConvertedEssence === 0 &&
    option.uncertaintyConvertedEssence === 0 &&
    option.netConvertedEssence === 0
  );
}

export function validateSingleOffer(manifest: JourneyManifest): ValidationResult {
  const takeOptions = manifest.options.filter((option) =>
    option.pickBehavior !== "leave"
  );
  const leaveOptions = manifest.options.filter((option) =>
    option.pickBehavior === "leave"
  );

  if (
    manifest.options.length !== 2 ||
    takeOptions.length !== 1 ||
    leaveOptions.length !== 1
  ) {
    return fail(
      "one_take_option_and_one_refusal_option",
      "single_offer requires one take option and one leave option",
    );
  }

  const takeOption = takeOptions[0]!;
  const leaveOption = leaveOptions[0]!;

  if (!hasReward(takeOption) || !hasMeaningfulTrade(takeOption)) {
    return fail(
      "take_option_has_visible_meaningful_trade",
      "single_offer take option requires a guaranteed reward plus a visible cost or burden",
    );
  }

  if (!isNoEffectLeave(leaveOption)) {
    return fail(
      "refusal_option_has_no_effect",
      "single_offer leave option must not carry costs, rewards, burdens, or uncertainty",
    );
  }

  return { ok: true };
}

export const singleOfferValidator: ShapeValidator = {
  ruleId: "single_offer_take_or_leave_contract",
  passMessage:
    "single_offer exposes exactly one meaningful take option and one no-effect leave option.",
  checkedPayloads: ({ optionChecked }) => optionChecked,
  validate: ({ manifest }) => validateSingleOffer(manifest),
};
