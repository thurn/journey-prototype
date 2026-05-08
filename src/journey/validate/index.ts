import type { JourneyContext } from "../../quest/context.js";
import type { JourneyManifest, ValidationReport } from "../manifest.js";
import { validationRuleOutcomes } from "./pipeline.js";
import { buildReport } from "./report.js";
import type { ValidationResult } from "./result.js";

export { VALIDATION_CONTRACT_VERSION, type ValidationResult } from "./result.js";

export function validateJourneyManifest(
  manifest: JourneyManifest,
  context: JourneyContext,
): ValidationResult {
  const firstFailure = validationRuleOutcomes(
    manifest,
    context,
    { stopAfterFirstFailure: true },
  ).find((rule) => rule.status === "fail");

  if (!firstFailure) {
    return { ok: true };
  }

  return {
    ok: false,
    rule: firstFailure.ruleId,
    message: firstFailure.message,
    ...(firstFailure.debug ? { debug: firstFailure.debug } : {}),
  };
}

export function buildValidationReport(
  manifest: JourneyManifest,
  context: JourneyContext,
): ValidationReport {
  return buildReport(validationRuleOutcomes(manifest, context));
}
