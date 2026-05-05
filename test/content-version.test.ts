import { describe, expect, it } from "vitest";
import type { ContentBundle } from "../src/content/model.js";
import { computeContentVersion } from "../src/content/version.js";

const encoder = new TextEncoder();

function bytes(text: string): Uint8Array {
  return encoder.encode(text);
}

function minimalContent(overrides: Partial<ContentBundle["rawBytes"]> = {}): ContentBundle {
  return {
    cards: [],
    dreamcallers: [],
    dreamsigns: [],
    rawBytes: {
      cardsToml: bytes("cards-v1"),
      dreamcallersToml: bytes("dreamcallers-v1"),
      dreamsignsToml: bytes("dreamsigns-v1"),
      ...overrides,
    },
  };
}

function input(overrides: Partial<Parameters<typeof computeContentVersion>[0]> = {}) {
  return {
    content: minimalContent(),
    journeyCatalogVersion: "v1",
    canonicalShapeDefinitions: {
      z: ["shape-b", "shape-a"],
      a: { b: 1 },
    },
    effectCatalogVersion: "v1",
    valueModelVersion: "v1",
    manifestSchemaVersion: 1,
    rendererVersion: "v1",
    questInitializationVersion: "v1",
    ...overrides,
  };
}

describe("computeContentVersion", () => {
  it("is deterministic across repeated calls with the same inputs", () => {
    expect(computeContentVersion(input())).toBe(computeContentVersion(input()));
  });

  it.each([
    {
      name: "cards TOML bytes",
      overrides: { content: minimalContent({ cardsToml: bytes("cards-v2") }) },
    },
    {
      name: "dreamcallers TOML bytes",
      overrides: {
        content: minimalContent({ dreamcallersToml: bytes("dreamcallers-v2") }),
      },
    },
    {
      name: "dreamsigns TOML bytes",
      overrides: {
        content: minimalContent({ dreamsignsToml: bytes("dreamsigns-v2") }),
      },
    },
    {
      name: "Journey catalog version",
      overrides: { journeyCatalogVersion: "v2" },
    },
    {
      name: "shape definitions",
      overrides: { canonicalShapeDefinitions: { a: { b: 2 } } },
    },
    {
      name: "effect catalog version",
      overrides: { effectCatalogVersion: "v2" },
    },
    {
      name: "value model version",
      overrides: { valueModelVersion: "v2" },
    },
    {
      name: "manifest schema version",
      overrides: { manifestSchemaVersion: 2 },
    },
    {
      name: "renderer version",
      overrides: { rendererVersion: "v2" },
    },
    {
      name: "quest initialization version",
      overrides: { questInitializationVersion: "v2" },
    },
  ])("changes when $name changes", ({ overrides }) => {
    expect(computeContentVersion(input(overrides))).not.toBe(
      computeContentVersion(input()),
    );
  });

  it("returns a readable version string with a short content digest", () => {
    expect(computeContentVersion(input())).toMatch(
      /^journey-catalog:v1;manifest:v1;renderer:v1;content:[0-9a-f]{16}$/,
    );
  });
});
