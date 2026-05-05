import type { ContentBundle } from "./model.js";
import { sha256Hex } from "../util/hash.js";
import { stableStringify } from "../util/stableJson.js";

export const CONTENT_FINGERPRINT_ALGORITHM_VERSION = "content-fingerprint:v1";

export type ContentVersionInput = {
  content: ContentBundle;
  journeyCatalogVersion: string;
  canonicalShapeDefinitions: unknown;
  effectCatalogVersion: string;
  valueModelVersion: string;
  valueModelContribution: unknown;
  manifestSchemaVersion: number;
  rendererVersion: string;
  questInitializationVersion: string;
};

function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function versionPart(label: string, version: string): string {
  return version.includes(":") ? version : `${label}:${version}`;
}

function blockDigest(name: string, bytes: Uint8Array): string {
  const prefix = utf8Bytes(`${name}\0`);
  const combined = new Uint8Array(prefix.length + bytes.length);

  combined.set(prefix);
  combined.set(bytes, prefix.length);

  return sha256Hex(combined);
}

export function computeContentVersion(input: ContentVersionInput): string {
  const blocks: Record<string, Uint8Array> = {
    [CONTENT_FINGERPRINT_ALGORITHM_VERSION]: utf8Bytes(
      CONTENT_FINGERPRINT_ALGORITHM_VERSION,
    ),
    "data/cards.toml": input.content.rawBytes.cardsToml,
    "data/dreamcallers.toml": input.content.rawBytes.dreamcallersToml,
    "data/dreamsigns.toml": input.content.rawBytes.dreamsignsToml,
    "journey-catalog-version": utf8Bytes(input.journeyCatalogVersion),
    "canonical-shape-definitions": utf8Bytes(
      stableStringify(input.canonicalShapeDefinitions),
    ),
    "effect-catalog-version": utf8Bytes(input.effectCatalogVersion),
    "value-model-contribution": utf8Bytes(
      stableStringify(input.valueModelContribution),
    ),
    "value-model-version": utf8Bytes(input.valueModelVersion),
    "manifest-schema-version": utf8Bytes(String(input.manifestSchemaVersion)),
    "renderer-version": utf8Bytes(input.rendererVersion),
    "quest-initialization-version": utf8Bytes(input.questInitializationVersion),
  };

  const finalText = Object.keys(blocks)
    .sort((left, right) => left.localeCompare(right, "en-US"))
    .map((name) => `${name}:${blockDigest(name, blocks[name] as Uint8Array)}`)
    .join("\n");
  const digest = sha256Hex(`${finalText}\n`).slice(0, 16);

  return [
    versionPart("journey-catalog", input.journeyCatalogVersion),
    `manifest:v${input.manifestSchemaVersion}`,
    versionPart("renderer", input.rendererVersion),
    `content:${digest}`,
  ].join(";");
}
