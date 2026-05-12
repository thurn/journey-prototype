import {
  JOURNEY_TRANSFIGURATIONS,
  isBaneName,
} from "../effects.js";
import { isRecord } from "./guards.js";
import { fail, type ValidationResult } from "./result.js";

export function baneTargetContext(value: Record<string, unknown>): "current_state" | "future_burden" | "manifest_obligation" {
  return value.baneTargetContext === "current_state"
    ? "current_state"
    : value.baneTargetContext === "manifest_obligation"
      ? "manifest_obligation"
      : "future_burden";
}

export function isBaneCurrentStateRequirement(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const kind = typeof value.kind === "string" ? value.kind : "";

  return (
    kind === "bane_purge" ||
    kind === "bane_random_purge" ||
    kind === "bane_chosen_purge" ||
    kind === "bane_replace" ||
    kind === "bane_transform_to_card"
  ) && baneTargetContext(value) === "current_state";
}

export function scanIllegalStructuredValue(value: unknown): ValidationResult {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const result = scanIllegalStructuredValue(entry);

      if (!result.ok) {
        return result;
      }
    }

    return { ok: true };
  }

  if (!isRecord(value)) {
    return { ok: true };
  }

  const kind = typeof value.kind === "string" ? value.kind : "";
  const type = typeof value.type === "string" ? value.type : "";

  if (
    value.custom === true ||
    kind.startsWith("custom_") ||
    type.startsWith("custom_") ||
    kind === "custom-card" ||
    kind === "custom-dreamsign"
  ) {
    return fail("custom_content", "Custom cards, Dreamsigns, and generated content are not legal");
  }

  if (kind === "status" || type === "status") {
    return fail("custom_status", "Custom statuses are not legal Journey output");
  }

  if (kind === "battlefield_mutation" || type === "battlefield_mutation") {
    return fail("custom_battlefield_mutation", "Battlefield mutations are not legal Journey output");
  }

  if (kind === "dreamcaller_ability_mutation" || type === "dreamcaller_ability_mutation") {
    return fail("custom_dreamcaller_mutation", "Dreamcaller ability mutations are not legal Journey output");
  }

  if (typeof value.transfigurationName === "string" && !JOURNEY_TRANSFIGURATIONS.includes(value.transfigurationName as never)) {
    return fail("invalid_transfiguration", `Invalid transfiguration: ${value.transfigurationName}`);
  }

  if (typeof value.baneName === "string" && !isBaneName(value.baneName)) {
    return fail("invalid_bane_name", `Invalid Bane name: ${value.baneName}`);
  }

  if (typeof value.newBaneName === "string" && !isBaneName(value.newBaneName)) {
    return fail("invalid_bane_name", `Invalid Bane name: ${value.newBaneName}`);
  }

  if (
    typeof value.minimum === "number" &&
    typeof value.maximum === "number" &&
    value.minimum > value.maximum
  ) {
    return fail("invalid_resource_random_range", "Resource random range minimum cannot exceed maximum");
  }

  if (
    typeof value.percentage === "number" &&
    (value.percentage < 0 || value.percentage > 100)
  ) {
    return fail("invalid_resource_percentage", "Resource percentage must be between 0 and 100");
  }

  if (value.hidden === true && (value.important === true || value.importance === "important")) {
    return fail("hidden_important_outcome", "Important outcomes cannot be hidden");
  }

  for (const nested of Object.values(value)) {
    const result = scanIllegalStructuredValue(nested);

    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}
