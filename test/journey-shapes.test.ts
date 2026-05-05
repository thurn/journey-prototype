import { describe, expect, it } from "vitest";
import type { ContentBundle } from "../src/content/model.js";
import { computeContentVersion } from "../src/content/version.js";
import {
  canonicalShapeDefinitions,
  getShapeDefinition,
  JOURNEY_SHAPE_CATALOG_VERSION,
  JOURNEY_SHAPES,
} from "../src/journey/shapes.js";

const expectedShapeIds = [
  "random_allocation",
  "same_cost_different_rewards",
  "same_reward_different_costs",
  "service_menu",
  "shop_row",
  "curated_reward_trio",
  "heterogeneous_pair",
  "one_target_many_operations",
  "staged_assembly",
  "mirrored_operations",
  "one_operation_many_targets",
  "choose_your_loss",
  "single_reward",
  "single_offer",
  "risk_or_skip",
  "single_wager",
  "now_vs_later",
  "reward_after_trigger",
  "paired_return",
  "timed_window_menu",
  "take_any_number",
  "take_up_to_n",
  "repeat_to_scale",
  "push_your_luck",
  "resolved_random_series",
  "single_random_outcome",
  "sequential_offers",
  "escalating_search",
  "commit_now_future_payoff",
  "alter_dreamscapes",
] as const;

const encoder = new TextEncoder();

function bytes(text: string): Uint8Array {
  return encoder.encode(text);
}

function minimalContent(): ContentBundle {
  return {
    cards: [],
    dreamcallers: [],
    dreamsigns: [],
    rawBytes: {
      cardsToml: bytes("cards-v1"),
      dreamcallersToml: bytes("dreamcallers-v1"),
      dreamsignsToml: bytes("dreamsigns-v1"),
    },
  };
}

describe("JOURNEY_SHAPES", () => {
  it("contains the exact canonical V1 shape IDs once and in catalog order", () => {
    const actualShapeIds = JOURNEY_SHAPES.map((shape) => shape.id);

    expect(actualShapeIds).toEqual(expectedShapeIds);
    expect(actualShapeIds).toHaveLength(30);
    expect(new Set(actualShapeIds).size).toBe(actualShapeIds.length);
  });

  it("provides complete definitions and lookups for every canonical shape", () => {
    for (const id of expectedShapeIds) {
      const definition = getShapeDefinition(id);

      expect(definition.id).toBe(id);
      expect(definition.rootOptionCount.min).toBeGreaterThanOrEqual(1);
      expect(definition.rootOptionCount.max).toBeGreaterThanOrEqual(
        definition.rootOptionCount.min,
      );
      expect(definition.supportedTags.length).toBeGreaterThan(0);
      expect(definition.validationRules.length).toBeGreaterThan(0);
      expect(definition.repairPreferences.length).toBeGreaterThan(0);
      expect(definition.debugLabel.length).toBeGreaterThan(0);
      expect(definition.versionContribution).toBeDefined();
    }
  });

  it("freezes shared catalog definitions against accidental mutation", () => {
    const definition = getShapeDefinition("random_allocation");
    const canonicalBeforeMutationAttempts = canonicalShapeDefinitions();

    expect(Object.isFrozen(JOURNEY_SHAPES)).toBe(true);
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.rootOptionCount)).toBe(true);
    expect(Object.isFrozen(definition.supportedTags)).toBe(true);
    expect(Object.isFrozen(definition.validationRules)).toBe(true);
    expect(Object.isFrozen(definition.repairPreferences)).toBe(true);
    expect(Object.isFrozen(definition.versionContribution)).toBe(true);

    expect(() => {
      (JOURNEY_SHAPES as unknown[]).push(definition);
    }).toThrow(TypeError);
    expect(() => {
      (definition.rootOptionCount as { min: number }).min = 99;
    }).toThrow(TypeError);
    expect(() => {
      (definition.supportedTags as string[]).push("mutated");
    }).toThrow(TypeError);

    expect(getShapeDefinition("random_allocation").rootOptionCount).toEqual({
      min: 3,
      max: 4,
    });
    expect(canonicalShapeDefinitions()).toEqual(canonicalBeforeMutationAttempts);
  });

  it("throws a developer-facing error for an unknown shape ID", () => {
    expect(() =>
      getShapeDefinition("not_a_shape" as (typeof expectedShapeIds)[number]),
    ).toThrow("Unknown Journey shape ID: not_a_shape");
  });

  it("returns deterministic canonical definitions for fingerprinting", () => {
    expect(canonicalShapeDefinitions()).toEqual(canonicalShapeDefinitions());
  });

  it("can contribute canonical shape definitions to the content version", () => {
    const contentVersion = computeContentVersion({
      content: minimalContent(),
      journeyCatalogVersion: JOURNEY_SHAPE_CATALOG_VERSION,
      canonicalShapeDefinitions: canonicalShapeDefinitions(),
      effectCatalogVersion: "effects:v1",
      valueModelVersion: "value:v1",
      valueModelContribution: { version: "value:v1" },
      manifestSchemaVersion: 1,
      rendererVersion: "renderer:v1",
      questInitializationVersion: "quest-init:v1",
    });

    expect(contentVersion).toMatch(
      /^journey-shapes:v1;manifest:v1;renderer:v1;content:[0-9a-f]{16}$/,
    );
  });
});
