import { describe, expect, it } from "vitest";
import type { ContentBundle } from "../src/content/model.js";
import { computeContentVersion } from "../src/content/version.js";
import {
  canonicalShapeDefinitions,
  getShapeDefinition,
  getShapePlugin,
  isJourneyShapeId,
  JOURNEY_SHAPE_CATALOG_VERSION,
  JOURNEY_SHAPES,
  journeyShapePlugins,
} from "../src/journey/shapes.js";
import { defineShapePlugin } from "../src/journey/shapes/shared.js";

const expectedShapeIds = [
  "random_rewards",
  "same_cost_different_rewards",
  "same_reward_different_costs",
  "shared_prefix_menu",
  "shop_row",
  "heterogeneous_pair",
  "random_trades",
  "one_target_many_operations",
  "one_operation_many_targets",
  "choose_your_loss",
  "single_offer",
  "risk_or_skip",
  "single_wager",
  "now_vs_later",
  "reward_after_trigger",
  "paired_return",
  "take_any_number",
  "push_your_luck",
  "probability_ladder",
  "random_pool_draws",
  "escalating_reward_chain",
  "flat_escalating_trade",
  "single_random_outcome",
  "reveal_choice_menu",
  "commit_now_future_payoff",
  "alter_dreamscapes",
] as const;
const deletedServiceShapeId = ["service", "menu"].join("_");

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
  it("exposes plugins and definitions in the same deterministic order", () => {
    const pluginIds = journeyShapePlugins().map((plugin) => plugin.id);
    const definitionIds = JOURNEY_SHAPES.map((shape) => shape.id);

    expect(pluginIds).toEqual(expectedShapeIds);
    expect(definitionIds).toEqual(pluginIds);
    expect(journeyShapePlugins().map((plugin) => plugin.definition)).toEqual(
      JOURNEY_SHAPES,
    );
  });

  it("contains the exact canonical V5 shape IDs once and in catalog order", () => {
    const actualShapeIds = JOURNEY_SHAPES.map((shape) => shape.id);

    expect(actualShapeIds).toEqual(expectedShapeIds);
    expect(actualShapeIds).toHaveLength(26);
    expect(new Set(actualShapeIds).size).toBe(actualShapeIds.length);
  });

  it("keeps Milestone 19 topology additions scoped to genuinely missing roots", () => {
    expect(getShapeDefinition("flat_escalating_trade")).toMatchObject({
      topology: "direct_menu",
      rootOptionCount: { min: 3, max: 4 },
    });
    expect(getShapeDefinition("reveal_choice_menu")).toMatchObject({
      topology: "random_commit",
      rootOptionCount: { min: 3, max: 3 },
    });
    expect(getShapeDefinition("shared_prefix_menu")).toMatchObject({
      topology: "direct_menu",
      rootOptionCount: { min: 3, max: 3 },
    });
    expect(isJourneyShapeId("return_row")).toBe(false);
    expect(
      isJourneyShapeId(["compound", deletedServiceShapeId].join("_")),
    ).toBe(false);
    expect(getShapeDefinition("paired_return").rootOptionCount.max).toBe(3);
  });

  it("does not expose the deleted service shape as a canonical shape", () => {
    expect(isJourneyShapeId(deletedServiceShapeId)).toBe(false);
    expect(() => getShapeDefinition(deletedServiceShapeId)).toThrow(
      `Unknown Journey shape ID: ${deletedServiceShapeId}`,
    );
    expect(() => getShapePlugin(deletedServiceShapeId)).toThrow(
      `Unknown Journey shape ID: ${deletedServiceShapeId}`,
    );
  });

  it("does not expose the timed window menu as a canonical shape", () => {
    const retiredShapeId = ["timed", "window", "menu"].join("_");

    expect(isJourneyShapeId(retiredShapeId)).toBe(false);
    expect(() => getShapeDefinition(retiredShapeId)).toThrow(
      `Unknown Journey shape ID: ${retiredShapeId}`,
    );
    expect(() => getShapePlugin(retiredShapeId)).toThrow(
      `Unknown Journey shape ID: ${retiredShapeId}`,
    );
  });

  it("does not expose the retired random series as a canonical shape", () => {
    const retiredShapeId = ["resolved", "random", "series"].join("_");

    expect(isJourneyShapeId(retiredShapeId)).toBe(false);
    expect(() => getShapeDefinition(retiredShapeId)).toThrow(
      `Unknown Journey shape ID: ${retiredShapeId}`,
    );
    expect(() => getShapePlugin(retiredShapeId)).toThrow(
      `Unknown Journey shape ID: ${retiredShapeId}`,
    );
  });

  it("does not expose the retired deterministic ladder branch shape", () => {
    const retiredShapeId = "prize_ladder";

    expect(isJourneyShapeId(retiredShapeId)).toBe(false);
    expect(() => getShapeDefinition(retiredShapeId)).toThrow(
      `Unknown Journey shape ID: ${retiredShapeId}`,
    );
    expect(() => getShapePlugin(retiredShapeId)).toThrow(
      `Unknown Journey shape ID: ${retiredShapeId}`,
    );
  });

  it("does not expose the deleted single_rule_trial shape", () => {
    const retiredShapeId = "single_rule_trial";

    expect(isJourneyShapeId(retiredShapeId)).toBe(false);
    expect(() => getShapeDefinition(retiredShapeId)).toThrow(
      `Unknown Journey shape ID: ${retiredShapeId}`,
    );
    expect(() => getShapePlugin(retiredShapeId)).toThrow(
      `Unknown Journey shape ID: ${retiredShapeId}`,
    );
  });

  it("provides complete definitions and lookups for every canonical shape", () => {
    for (const id of expectedShapeIds) {
      const definition = getShapeDefinition(id);
      const plugin = getShapePlugin(id);

      expect(definition.id).toBe(id);
      expect(plugin.id).toBe(id);
      expect(plugin.definition).toBe(definition);
      expect(plugin.scoreWeight).toBeGreaterThan(0);
      expect(plugin.fill).toEqual(expect.any(Function));
      expect(definition.rootOptionCount.min).toBeGreaterThanOrEqual(
        definition.topology === "decision_tree" ? 0 : 1,
      );
      expect(definition.rootOptionCount.max).toBeGreaterThanOrEqual(
        definition.rootOptionCount.min,
      );
      expect(definition.validationRules.length).toBeGreaterThan(0);
      expect(definition.debugLabel.length).toBeGreaterThan(0);
      expect(definition.versionContribution).toBeDefined();
    }
  });

  it("uses registry lookup without a closed ID union", () => {
    expect(isJourneyShapeId("risk_or_skip")).toBe(true);
    expect(isJourneyShapeId("fixture_test_shape")).toBe(false);
    expect(getShapePlugin("risk_or_skip").validators?.map((entry) => entry.ruleId)).toContain(
      "risk_or_skip_envelope",
    );
  });

  it("requires non-tree shapes to expose a root choice", () => {
    for (const definition of JOURNEY_SHAPES) {
      if (definition.topology === "decision_tree") {
        continue;
      }

      const renderedMinimum = definition.rootOptionCount.min +
        (definition.automaticLeave === false ? 0 : 1);

      expect(renderedMinimum, definition.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("freezes shared catalog definitions against accidental mutation", () => {
    const definition = getShapeDefinition("random_rewards");
    const canonicalBeforeMutationAttempts = canonicalShapeDefinitions();

    expect(Object.isFrozen(JOURNEY_SHAPES)).toBe(true);
    expect(Object.isFrozen(journeyShapePlugins())).toBe(true);
    expect(Object.isFrozen(getShapePlugin("random_rewards"))).toBe(true);
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.rootOptionCount)).toBe(true);
    expect(Object.isFrozen(definition.supportedTags)).toBe(true);
    expect(Object.isFrozen(definition.validationRules)).toBe(true);
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

    expect(getShapeDefinition("random_rewards").rootOptionCount).toEqual({
      min: 3,
      max: 3,
    });
    expect(canonicalShapeDefinitions()).toEqual(canonicalBeforeMutationAttempts);
  });

  it("throws a developer-facing error for an unknown shape ID", () => {
    expect(() =>
      getShapeDefinition("not_a_shape" as (typeof expectedShapeIds)[number]),
    ).toThrow("Unknown Journey shape ID: not_a_shape");
    expect(() => getShapePlugin("not_a_shape")).toThrow(
      "Unknown Journey shape ID: not_a_shape",
    );
  });

  it("can define a source-local fixture plugin with a new shape ID", () => {
    const plugin = defineShapePlugin({
      definition: {
        id: "fixture_test_shape",
        topology: "decision_tree",
        rootOptionCount: { min: 0, max: 0 },
        supportedTags: ["fixture"],
        validationRules: ["fixture_tree_is_complete"],
        debugLabel: "Fixture test shape",
        versionContribution: {
          catalogVersion: JOURNEY_SHAPE_CATALOG_VERSION,
          id: "fixture_test_shape",
          topology: "decision_tree",
        },
      },
      scoreWeight: 1.1,
      fill: () => ({ options: [], precommitted: {} }),
    });

    expect(plugin.id).toBe("fixture_test_shape");
    expect(plugin.definition.id).toBe("fixture_test_shape");
    expect(plugin.fill({ context: {} as never, drawContext: {} as never })).toEqual({
      options: [],
      precommitted: {},
    });
  });

  it("returns deterministic canonical definitions for fingerprinting", () => {
    expect(canonicalShapeDefinitions()).toEqual(canonicalShapeDefinitions());
  });

  it("can contribute canonical shape definitions to the content version", () => {
    const contentVersion = computeContentVersion({
      content: minimalContent(),
      journeyCatalogVersion: JOURNEY_SHAPE_CATALOG_VERSION,
      canonicalShapeDefinitions: canonicalShapeDefinitions(),
      effectCatalogVersion: "effects:v6",
      valueModelVersion: "value:v2",
      valueModelContribution: { version: "value:v2" },
      manifestSchemaVersion: 2,
      manifestContractVersion: "manifest:v2",
      rendererVersion: "renderer:v1",
      questInitializationVersion: "quest-init:v1",
    });

    expect(contentVersion).toMatch(
      /^journey-shapes:v21;manifest:v2;renderer:v1;content:[0-9a-f]{16}$/,
    );
  });
});
