import type {
  CardContent,
  ContentBundle,
  DreamcallerContent,
  DreamsignContent,
} from "./model.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeRecord(record: { id?: unknown; name?: unknown }): string {
  const id = typeof record.id === "string" && record.id.length > 0
    ? record.id
    : "missing id";
  const name = typeof record.name === "string" && record.name.length > 0
    ? ` ${record.name}`
    : "";

  return `${id}${name}`;
}

function rowContext(
  relativePath: string,
  tableName: string,
  index: number,
  record: { id?: unknown; name?: unknown },
): string {
  return `${relativePath} ${tableName}[${index + 1}] (${describeRecord(record)})`;
}

function requireString(
  errors: string[],
  context: string,
  field: string,
  value: unknown,
): void {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${context}: missing or invalid string field "${field}"`);
  }
}

function requireAnyString(
  errors: string[],
  context: string,
  field: string,
  value: unknown,
): void {
  if (typeof value !== "string") {
    errors.push(`${context}: missing or invalid string field "${field}"`);
  }
}

function requireRawRecord(
  errors: string[],
  context: string,
  value: unknown,
): void {
  if (!isRecord(value)) {
    errors.push(`${context}: missing raw TOML record`);
  }
}

function requireTideArray(
  errors: string[],
  context: string,
  field: string,
  value: unknown,
  options: { allowEmpty: boolean },
): void {
  if (!Array.isArray(value)) {
    errors.push(`${context}: malformed tide array "${field}"`);
    return;
  }

  if (!options.allowEmpty && value.length === 0) {
    errors.push(`${context}: tide array "${field}" must not be empty`);
  }

  value.forEach((tide, index) => {
    if (typeof tide !== "string" || tide.length === 0) {
      errors.push(`${context}: malformed tide "${field}[${index}]"`);
    }
  });
}

function requireNumberOrStar(
  errors: string[],
  context: string,
  field: string,
  value: unknown,
): void {
  if (value === "*") {
    return;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${context}: missing or invalid numeric/"*" field "${field}"`);
  }
}

function requireSpark(
  errors: string[],
  context: string,
  value: unknown,
): void {
  if (value === "" || value === "*") {
    return;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${context}: missing or invalid spark field "spark"`);
  }
}

function requireCardNumber(
  errors: string[],
  context: string,
  value: unknown,
): void {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    errors.push(`${context}: missing numeric field "cardNumber"`);
  }
}

function validateDuplicateIds<T extends { id: unknown; name?: unknown }>(
  errors: string[],
  rows: T[],
  relativePath: string,
  tableName: string,
): void {
  const seen = new Map<string, { index: number; record: T }>();

  rows.forEach((row, index) => {
    if (typeof row.id !== "string" || row.id.length === 0) {
      return;
    }

    const normalizedId = row.id.toLocaleLowerCase("en-US");
    const existing = seen.get(normalizedId);

    if (existing) {
      errors.push(
        `${rowContext(relativePath, tableName, index, row)}: duplicate id also used by ${rowContext(
          relativePath,
          tableName,
          existing.index,
          existing.record,
        )}`,
      );
      return;
    }

    seen.set(normalizedId, { index, record: row });
  });
}

function validateCards(errors: string[], cards: CardContent[]): void {
  validateDuplicateIds(errors, cards, "data/cards.toml", "cards");

  cards.forEach((card, index) => {
    const context = rowContext("data/cards.toml", "cards", index, card);

    requireString(errors, context, "id", card.id);
    requireString(errors, context, "name", card.name);
    requireTideArray(errors, context, "tides", card.tides, {
      allowEmpty: true,
    });
    requireString(errors, context, "rarity", card.rarity);
    requireString(errors, context, "cardType", card.cardType);
    requireNumberOrStar(errors, context, "energyCost", card.energyCost);
    requireSpark(errors, context, card.spark);
    requireCardNumber(errors, context, card.cardNumber);
    requireRawRecord(errors, context, card.raw);
  });
}

function validateDreamcallers(
  errors: string[],
  dreamcallers: DreamcallerContent[],
): void {
  validateDuplicateIds(
    errors,
    dreamcallers,
    "data/dreamcallers.toml",
    "dreamcaller",
  );

  dreamcallers.forEach((dreamcaller, index) => {
    const context = rowContext(
      "data/dreamcallers.toml",
      "dreamcaller",
      index,
      dreamcaller,
    );

    requireString(errors, context, "id", dreamcaller.id);
    requireString(errors, context, "name", dreamcaller.name);
    requireString(errors, context, "title", dreamcaller.title);
    requireString(errors, context, "awakening", dreamcaller.awakening);
    requireTideArray(errors, context, "mandatoryTides", dreamcaller.mandatoryTides, {
      allowEmpty: false,
    });
    requireTideArray(errors, context, "optionalTides", dreamcaller.optionalTides, {
      allowEmpty: false,
    });
    requireRawRecord(errors, context, dreamcaller.raw);
  });
}

function validateDreamsigns(
  errors: string[],
  dreamsigns: DreamsignContent[],
): void {
  validateDuplicateIds(
    errors,
    dreamsigns,
    "data/dreamsigns.toml",
    "dreamsign",
  );

  dreamsigns.forEach((dreamsign, index) => {
    const mutableDreamsign = dreamsign as DreamsignContent & {
      tides?: unknown;
    };
    const context = rowContext(
      "data/dreamsigns.toml",
      "dreamsign",
      index,
      dreamsign,
    );

    requireString(errors, context, "id", dreamsign.id);
    requireString(errors, context, "name", dreamsign.name);
    requireAnyString(errors, context, "renderedText", dreamsign.renderedText);
    requireRawRecord(errors, context, dreamsign.raw);

    if (dreamsign.kind !== "tidal" && dreamsign.kind !== "neutral") {
      errors.push(`${context}: invalid Dreamsign kind "${String(dreamsign.kind)}"`);
      return;
    }

    if (dreamsign.kind === "neutral") {
      if (mutableDreamsign.tides === undefined) {
        mutableDreamsign.tides = [];
      }

      requireTideArray(errors, context, "tides", mutableDreamsign.tides, {
        allowEmpty: true,
      });

      if (Array.isArray(mutableDreamsign.tides) && mutableDreamsign.tides.length > 0) {
        errors.push(`${context}: neutral Dreamsign must not declare tides`);
      }

      return;
    }

    requireTideArray(errors, context, "tides", mutableDreamsign.tides, {
      allowEmpty: false,
    });
  });
}

function validateRawBytes(errors: string[], content: ContentBundle): void {
  const rawBytes = (content as ContentBundle & { rawBytes?: unknown }).rawBytes;

  if (!isRecord(rawBytes)) {
    errors.push("content bundle: missing rawBytes");
    return;
  }

  if (!(rawBytes.cardsToml instanceof Uint8Array)) {
    errors.push("data/cards.toml: missing raw TOML bytes");
  }

  if (!(rawBytes.dreamcallersToml instanceof Uint8Array)) {
    errors.push("data/dreamcallers.toml: missing raw TOML bytes");
  }

  if (!(rawBytes.dreamsignsToml instanceof Uint8Array)) {
    errors.push("data/dreamsigns.toml: missing raw TOML bytes");
  }
}

export function validateContent(content: ContentBundle): void {
  const errors: string[] = [];

  if (!Array.isArray(content.cards)) {
    errors.push("data/cards.toml: normalized cards must be an array");
  } else {
    validateCards(errors, content.cards);
  }

  if (!Array.isArray(content.dreamcallers)) {
    errors.push("data/dreamcallers.toml: normalized Dreamcallers must be an array");
  } else {
    validateDreamcallers(errors, content.dreamcallers);
  }

  if (!Array.isArray(content.dreamsigns)) {
    errors.push("data/dreamsigns.toml: normalized Dreamsigns must be an array");
  } else {
    validateDreamsigns(errors, content.dreamsigns);
  }

  validateRawBytes(errors, content);

  if (errors.length > 0) {
    throw new Error(`Content validation failed:\n- ${errors.join("\n- ")}`);
  }
}
