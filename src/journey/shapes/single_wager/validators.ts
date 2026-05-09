import type { JourneyManifest } from "../../manifest.js";
import { isRecord } from "../../validate/guards.js";
import { hasEnvelopeConstraint } from "../../validate/precommitRules.js";
import { hasOdds } from "../../validate/randomContracts.js";
import { fail, type ValidationResult } from "../../validate/result.js";

function isSingleWagerEnvelope(
  value: unknown,
): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    value.kind === "wager" &&
    hasEnvelopeConstraint(value, "single_wager", "single_wager_known_stake")
  );
}

export function validateSingleWager(
  manifest: JourneyManifest,
): ValidationResult {
  const wagerOptions = manifest.options.filter(
    (option) => option.pickBehavior !== "leave",
  );

  for (const option of wagerOptions) {
    if (option.costs.length === 0) {
      return fail(
        "known_stake_is_visible_before_commit",
        "Single wager requires a visible stake",
      );
    }

    if (
      !/\b\d+%\s+chance\b/iu.test(option.text) ||
      !/\botherwise\b|\bnothing\b|\bfail/iu.test(option.text)
    ) {
      return fail(
        "reward_outcome_is_bounded_random_envelope",
        "Single wager must show odds and the failure outcome before commitment",
      );
    }
  }

  const wagers = (manifest.precommitted.random ?? [])
    .filter((entry) => isSingleWagerEnvelope(entry))
    .map((entry) => entry as Record<string, unknown>);

  if (wagers.length < wagerOptions.length) {
    return fail(
      "reward_outcome_is_bounded_random_envelope",
      "Single wager precommit must store one typed constrained wager envelope per wager option",
    );
  }

  for (const wager of wagers) {
    if (
      !hasOdds(wager) ||
      !isRecord(wager.stake) ||
      !("success" in wager) ||
      !("failure" in wager) ||
      typeof wager.roll !== "number" ||
      (wager.committedResult !== "success" &&
        wager.committedResult !== "failure")
    ) {
      return fail(
        "reward_outcome_is_bounded_random_envelope",
        "Single wager precommit must store stake, odds, success and failure outcomes, and the committed roll",
      );
    }
  }

  return { ok: true };
}
