import { fail, type ValidationResult } from "./result.js";

export function validateNormalOutputText(text: string): ValidationResult {
  if (text.includes("Shape:") || /^Shape:/u.test(text.trim())) {
    return fail("normal_output_shape_line", "Normal Journey text cannot require a top-level Shape line");
  }

  if (referencesTides(text)) {
    return fail("normal_output_tide_reference", "Normal Journey ability text cannot mention tides");
  }

  if (requiresNarrativeName(text)) {
    return fail("normal_output_narrative_name", "Normal Journey text cannot require narrative Journey names or invented event names");
  }

  return { ok: true };
}

export function looksLikeInventedTitle(prefix: string): boolean {
  const words = prefix.trim().split(/\s+/u);

  if (words.length < 2) {
    return false;
  }

  return words.every((word) =>
    /^(?:A|An|And|At|In|Of|On|The|To)$/u.test(word) ||
    /^[A-Z][a-z]+$/u.test(word),
  );
}

export function requiresNarrativeName(text: string): boolean {
  const trimmed = text.trim();

  if (/^(?:Journey|Event)(?:\s+name)?\s*:/iu.test(trimmed)) {
    return true;
  }

  if (/\b(?:Journey|Event)\s+(?:named|called)\s+["']?[A-Z][a-z]+/u.test(trimmed)) {
    return true;
  }

  const titlePrefix = trimmed.match(/^([^:.!?]{2,80}):\s+\S/u);

  return titlePrefix !== null &&
    titlePrefix[1] !== "Take" &&
    looksLikeInventedTitle(titlePrefix[1] ?? "");
}

export function referencesTides(text: string): boolean {
  return /(?:selected-tide|\btidal\b|\btides?\b)/iu.test(text);
}
