import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "smol-toml";
import type {
  CardContent,
  ContentBundle,
  DreamcallerContent,
  DreamsignContent,
} from "./model.js";
import { validateContent } from "./validate.js";

type TomlDocument = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseToml(bytes: Uint8Array, relativePath: string): TomlDocument {
  try {
    const parsed = parse(Buffer.from(bytes).toString("utf8"));

    if (!isRecord(parsed)) {
      throw new Error("expected a TOML table document");
    }

    return parsed;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${relativePath}: failed to parse TOML: ${detail}`);
  }
}

function rowsFromDocument(
  document: TomlDocument,
  key: string,
  relativePath: string,
): unknown[] {
  const rows = document[key];

  if (!Array.isArray(rows)) {
    throw new Error(`${relativePath}: expected [[${key}]] table rows`);
  }

  return rows;
}

function rawRecord(row: unknown, relativePath: string, rowIndex: number) {
  if (!isRecord(row)) {
    return {
      value: row,
      __diagnostic: `${relativePath} row ${rowIndex + 1} is not a table`,
    };
  }

  return row;
}

function normalizeAwakening(value: unknown): string {
  if (typeof value === "number" || typeof value === "string") {
    return String(value);
  }

  return value as string;
}

function normalizeCards(rows: unknown[]): CardContent[] {
  return rows.map((row, index) => {
    const raw = rawRecord(row, "data/cards.toml", index);

    return {
      id: raw.id as string,
      name: raw.name as string,
      tides: raw.tides as string[],
      rarity: raw.rarity as string,
      cardType: raw["card-type"] as string,
      energyCost: raw["energy-cost"] as number | "*",
      spark: raw.spark as number | "" | "*",
      cardNumber: raw["card-number"] as number,
      raw,
    };
  });
}

function normalizeDreamcallers(rows: unknown[]): DreamcallerContent[] {
  return rows.map((row, index) => {
    const raw = rawRecord(row, "data/dreamcallers.toml", index);

    return {
      id: raw.id as string,
      name: raw.name as string,
      title: raw.title as string,
      awakening: normalizeAwakening(raw.awakening),
      mandatoryTides: raw["mandatory-tides"] as string[],
      optionalTides: raw["optional-tides"] as string[],
      raw,
    };
  });
}

function normalizeDreamsigns(rows: unknown[]): DreamsignContent[] {
  return rows.map((row, index) => {
    const raw = rawRecord(row, "data/dreamsigns.toml", index);

    return {
      id: raw.id as string,
      name: raw.name as string,
      kind: raw.kind as "tidal" | "neutral",
      renderedText: raw["rendered-text"] as string,
      tides: (raw.tides ?? []) as string[],
      raw,
    };
  });
}

async function readContentFile(projectRoot: string, relativePath: string) {
  try {
    return await readFile(join(projectRoot, relativePath));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${relativePath}: failed to read TOML: ${detail}`);
  }
}

export async function loadContent(projectRoot: string): Promise<ContentBundle> {
  const [cardsToml, dreamcallersToml, dreamsignsToml] = await Promise.all([
    readContentFile(projectRoot, "data/cards.toml"),
    readContentFile(projectRoot, "data/dreamcallers.toml"),
    readContentFile(projectRoot, "data/dreamsigns.toml"),
  ]);

  const cardsDocument = parseToml(cardsToml, "data/cards.toml");
  const dreamcallersDocument = parseToml(
    dreamcallersToml,
    "data/dreamcallers.toml",
  );
  const dreamsignsDocument = parseToml(dreamsignsToml, "data/dreamsigns.toml");

  const content: ContentBundle = {
    cards: normalizeCards(
      rowsFromDocument(cardsDocument, "cards", "data/cards.toml"),
    ),
    dreamcallers: normalizeDreamcallers(
      rowsFromDocument(
        dreamcallersDocument,
        "dreamcaller",
        "data/dreamcallers.toml",
      ),
    ),
    dreamsigns: normalizeDreamsigns(
      rowsFromDocument(dreamsignsDocument, "dreamsign", "data/dreamsigns.toml"),
    ),
    rawBytes: {
      cardsToml,
      dreamcallersToml,
      dreamsignsToml,
    },
  };

  validateContent(content);

  return content;
}
