

export const VALIDATION_CONTRACT_VERSION = "validation:v1";

export type ValidationResult =
  | { ok: true }
  | { ok: false; rule: string; message: string; debug?: Record<string, unknown> };

export function fail(rule: string, message: string, debug?: Record<string, unknown>): ValidationResult {
  return { ok: false, rule, message, ...(debug ? { debug } : {}) };
}
