function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeJsonValue(
  value: unknown,
  seen: Set<object>,
  arrayElement: boolean,
): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (
    typeof value === "undefined" ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    return arrayElement ? null : undefined;
  }

  if (typeof value === "bigint") {
    throw new TypeError("stableStringify cannot serialize bigint values");
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new TypeError("stableStringify cannot serialize circular structures");
    }

    seen.add(value);
    const normalized = value.map((element) =>
      normalizeJsonValue(element, seen, true),
    );
    seen.delete(value);

    return normalized;
  }

  if (value instanceof Uint8Array) {
    return Array.from(value);
  }

  if (!isPlainObject(value)) {
    if (typeof (value as { toJSON?: unknown }).toJSON === "function") {
      return normalizeJsonValue(
        (value as { toJSON: () => unknown }).toJSON(),
        seen,
        arrayElement,
      );
    }

    return value;
  }

  if (seen.has(value)) {
    throw new TypeError("stableStringify cannot serialize circular structures");
  }

  seen.add(value);
  const normalized: Record<string, unknown> = {};

  Object.keys(value)
    .sort((left, right) => left.localeCompare(right, "en-US"))
    .forEach((key) => {
      const normalizedValue = normalizeJsonValue(value[key], seen, false);

      if (normalizedValue !== undefined) {
        normalized[key] = normalizedValue;
      }
    });

  seen.delete(value);
  return normalized;
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(normalizeJsonValue(value, new Set(), false), null, 2)}\n`;
}
