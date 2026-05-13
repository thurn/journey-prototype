import { readFile } from "node:fs/promises";
import { isBaneName } from "../journey/effects.js";
import {
  MANIFEST_SCHEMA_VERSION,
  type JourneyManifest,
  type JourneyVersionMetadata,
} from "../journey/manifest.js";
import type { JourneyShapeId } from "../journey/shapes.js";
import { STATE_SCHEMA_VERSION, type JourneyState } from "./schema.js";
import { stableStringify } from "../util/stableJson.js";
import { writeFileAtomic } from "./atomicWrite.js";

export type StateReadResult =
  | { kind: "missing" }
  | { kind: "loaded"; state: JourneyState; rawBytes: Uint8Array }
  | { kind: "malformed"; rawBytes: Uint8Array; error: Error };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validationError(errors: string[]): Error {
  return new Error(`Invalid journey state:\n- ${errors.join("\n- ")}`);
}

function requireString(
  errors: string[],
  value: unknown,
  path: string,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${path} must be a non-empty string`);
  }
}

function requireNumber(
  errors: string[],
  value: unknown,
  path: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${path} must be a finite number`);
  }
}

function requireInteger(
  errors: string[],
  value: unknown,
  path: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    errors.push(`${path} must be an integer`);
  }
}

function requireRecord(
  errors: string[],
  value: unknown,
  path: string,
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
  }
}

function requireStringArray(
  errors: string[],
  value: unknown,
  path: string,
): asserts value is string[] {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return;
  }

  value.forEach((entry, index) => {
    if (typeof entry !== "string" || entry.length === 0) {
      errors.push(`${path}[${index}] must be a non-empty string`);
    }
  });
}

function validateCardEntries(
  errors: string[],
  value: unknown,
  path: string,
): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return;
  }

  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(`${path}[${index}] must be an object`);
      return;
    }

    requireString(errors, entry.cardId, `${path}[${index}].cardId`);
    requireInteger(errors, entry.copies, `${path}[${index}].copies`);
  });
}

function validateDreamsignRefs(
  errors: string[],
  value: unknown,
  path: string,
): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return;
  }

  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(`${path}[${index}] must be an object`);
      return;
    }

    requireString(errors, entry.dreamsignId, `${path}[${index}].dreamsignId`);
  });
}

function validateBaneRefs(
  errors: string[],
  value: unknown,
  path: string,
): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return;
  }

  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(`${path}[${index}] must be an object`);
      return;
    }

    if (typeof entry.baneName !== "string" || !isBaneName(entry.baneName)) {
      errors.push(`${path}[${index}].baneName must be a known Bane name`);
    }
  });
}

const MANIFEST_VERSION_METADATA_FIELDS: (keyof JourneyVersionMetadata)[] = [
  "contentVersion",
  "shapeCatalogVersion",
  "effectCatalogVersion",
  "valueModelVersion",
  "rendererVersion",
  "manifestContractVersion",
];

function validateManifestVersions(
  errors: string[],
  value: unknown,
  path: string,
): asserts value is JourneyVersionMetadata {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }

  for (const field of MANIFEST_VERSION_METADATA_FIELDS) {
    requireString(errors, value[field], `${path}.${field}`);
  }
}

function validateManifest(
  errors: string[],
  value: unknown,
  path: string,
): asserts value is JourneyManifest | null {
  if (value === null) {
    return;
  }

  if (!isRecord(value)) {
    errors.push(`${path} must be an object or null`);
    return;
  }

  if (value.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    errors.push(`${path}.schemaVersion must be ${MANIFEST_SCHEMA_VERSION}`);
  }

  requireString(errors, value.journeyId, `${path}.journeyId`);
  requireString(errors, value.seed, `${path}.seed`);
  requireInteger(errors, value.rootJourneyIndex, `${path}.rootJourneyIndex`);
  requireString(errors, value.shapeId, `${path}.shapeId`);
  validateManifestVersions(errors, value.versions, `${path}.versions`);
}

function validateHistory(errors: string[], value: unknown): void {
  if (!Array.isArray(value)) {
    errors.push("history must be an array");
    return;
  }

  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(`history[${index}] must be an object`);
      return;
    }

    requireString(errors, entry.journeyId, `history[${index}].journeyId`);
    requireString(errors, entry.shapeId, `history[${index}].shapeId`);

    if (entry.sequenceStep !== undefined) {
      requireInteger(errors, entry.sequenceStep, `history[${index}].sequenceStep`);
    }

    if (
      entry.sequenceStatus !== undefined &&
      entry.sequenceStatus !== "active" &&
      entry.sequenceStatus !== "complete" &&
      entry.sequenceStatus !== "left"
    ) {
      errors.push(`history[${index}].sequenceStatus must be active, complete, or left`);
    }

    requireInteger(
      errors,
      entry.selectedOptionNumber,
      `history[${index}].selectedOptionNumber`,
    );
    requireString(
      errors,
      entry.selectedOptionText,
      `history[${index}].selectedOptionText`,
    );

    if (entry.effectSimulation !== "not_applied") {
      errors.push(`history[${index}].effectSimulation must be "not_applied"`);
    }
  });
}

function validateQuest(errors: string[], value: unknown): void {
  if (!isRecord(value)) {
    errors.push("quest must be an object");
    return;
  }

  requireString(errors, value.seed, "quest.seed");

  if (isRecord(value.dreamcaller)) {
    requireString(errors, value.dreamcaller.id, "quest.dreamcaller.id");
    requireString(errors, value.dreamcaller.name, "quest.dreamcaller.name");
    requireString(errors, value.dreamcaller.title, "quest.dreamcaller.title");
    requireString(
      errors,
      value.dreamcaller.awakening,
      "quest.dreamcaller.awakening",
    );
  } else {
    errors.push("quest.dreamcaller must be an object");
  }

  if (isRecord(value.resources)) {
    requireNumber(errors, value.resources.essence, "quest.resources.essence");
    requireNumber(errors, value.resources.maxEssence, "quest.resources.maxEssence");
    requireNumber(errors, value.resources.omens, "quest.resources.omens");
    requireNumber(errors, value.resources.dreamscape, "quest.resources.dreamscape");
  } else {
    errors.push("quest.resources must be an object");
  }

  requireStringArray(errors, value.selectedTides, "quest.selectedTides");
  requireStringArray(errors, value.mandatoryTides, "quest.mandatoryTides");
  requireStringArray(errors, value.optionalSubset, "quest.optionalSubset");

  if (isRecord(value.deck)) {
    validateCardEntries(errors, value.deck.entries, "quest.deck.entries");

    if (isRecord(value.deck.summary)) {
      requireInteger(
        errors,
        value.deck.summary.totalCards,
        "quest.deck.summary.totalCards",
      );
      requireInteger(
        errors,
        value.deck.summary.starterCards,
        "quest.deck.summary.starterCards",
      );
      requireInteger(
        errors,
        value.deck.summary.uniqueCards,
        "quest.deck.summary.uniqueCards",
      );
    } else {
      errors.push("quest.deck.summary must be an object");
    }
  } else {
    errors.push("quest.deck must be an object");
  }

  validateDreamsignRefs(errors, value.activeDreamsigns, "quest.activeDreamsigns");
  validateBaneRefs(errors, value.banes, "quest.banes");
  requireStringArray(errors, value.dreamsignPoolIds, "quest.dreamsignPoolIds");

  if (isRecord(value.dreamsignPoolSummary)) {
    requireInteger(
      errors,
      value.dreamsignPoolSummary.tidalPoolCount,
      "quest.dreamsignPoolSummary.tidalPoolCount",
    );
    requireInteger(
      errors,
      value.dreamsignPoolSummary.neutralCatalogCount,
      "quest.dreamsignPoolSummary.neutralCatalogCount",
    );
  } else {
    errors.push("quest.dreamsignPoolSummary must be an object");
  }

  validateCardEntries(errors, value.draftPool, "quest.draftPool");

  if (isRecord(value.draftPoolSummary)) {
    requireInteger(
      errors,
      value.draftPoolSummary.totalCopies,
      "quest.draftPoolSummary.totalCopies",
    );
    requireInteger(
      errors,
      value.draftPoolSummary.uniqueCards,
      "quest.draftPoolSummary.uniqueCards",
    );
    requireInteger(
      errors,
      value.draftPoolSummary.oneCopyCards,
      "quest.draftPoolSummary.oneCopyCards",
    );
    requireInteger(
      errors,
      value.draftPoolSummary.twoCopyCards,
      "quest.draftPoolSummary.twoCopyCards",
    );
  } else {
    errors.push("quest.draftPoolSummary must be an object");
  }

  if (isRecord(value.route)) {
    requireRecord(errors, value.route.pacingLedger, "quest.route.pacingLedger");

    if (!Array.isArray(value.route.unresolvedHooks)) {
      errors.push("quest.route.unresolvedHooks must be an array");
    }
  } else {
    errors.push("quest.route must be an object");
  }
}

function validateGenerator(errors: string[], value: unknown): void {
  if (!isRecord(value)) {
    errors.push("generator must be an object");
    return;
  }

  requireInteger(errors, value.rootJourneyIndex, "generator.rootJourneyIndex");

  if (value.lastJourneyId !== null && typeof value.lastJourneyId !== "string") {
    errors.push("generator.lastJourneyId must be a string or null");
  }

  if (!isRecord(value.cursors)) {
    errors.push("generator.cursors must be an object");
    return;
  }

  Object.entries(value.cursors).forEach(([key, cursor]) => {
    requireInteger(errors, cursor, `generator.cursors.${key}`);
  });
}

export function parseJourneyState(rawBytes: Uint8Array): JourneyState {
  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(rawBytes).toString("utf8")) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid journey state JSON: ${detail}`);
  }

  const errors: string[] = [];

  if (!isRecord(parsed)) {
    throw validationError(["state root must be an object"]);
  }

  if (parsed.schemaVersion !== STATE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${STATE_SCHEMA_VERSION}`);
  }

  requireString(errors, parsed.contentVersion, "contentVersion");
  validateQuest(errors, parsed.quest);
  validateGenerator(errors, parsed.generator);
  validateManifest(errors, parsed.pendingJourney, "pendingJourney");
  validateHistory(errors, parsed.history);

  if (errors.length > 0) {
    throw validationError(errors);
  }

  return parsed as JourneyState;
}

export async function readJourneyState(statePath: string): Promise<StateReadResult> {
  let rawBytes: Uint8Array;

  try {
    rawBytes = await readFile(statePath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return { kind: "missing" };
    }

    return {
      kind: "malformed",
      rawBytes: new Uint8Array(),
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  try {
    return {
      kind: "loaded",
      state: parseJourneyState(rawBytes),
      rawBytes,
    };
  } catch (error) {
    return {
      kind: "malformed",
      rawBytes,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

export async function writeJourneyStateAtomic(
  statePath: string,
  state: JourneyState,
): Promise<void> {
  await writeFileAtomic(statePath, stableStringify(state));
}
