import { describe, expect, it } from "vitest";
import type { ContentBundle } from "../src/content/model.js";
import { computeContentVersion } from "../src/content/version.js";
import { DEBUG_PAYLOAD_FAMILIES } from "../src/journey/debugPayloads.js";
import {
  canonicalShapeDefinitions,
  fallbackShapeIds,
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
  "service_menu",
  "shop_row",
  "curated_reward_trio",
  "heterogeneous_pair",
  "random_trades",
  "one_target_many_operations",
  "mirrored_operations",
  "one_operation_many_targets",
  "choose_your_loss",
  "single_reward",
  "single_offer",
  "single_rule_trial",
  "risk_or_skip",
  "single_wager",
  "now_vs_later",
  "reward_after_trigger",
  "paired_return",
  "timed_window_menu",
  "take_any_number",
  "push_your_luck",
  "prize_ladder",
  "probability_ladder",
  "random_pool_draws",
  "escalating_reward_chain",
  "flat_escalating_trade",
  "resolved_random_series",
  "single_random_outcome",
  "reveal_choice_menu",
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
  it("exposes plugins and compatibility definitions in the same deterministic order", () => {
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
    expect(actualShapeIds).toHaveLength(34);
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
    expect(isJourneyShapeId("compound_service_menu")).toBe(false);
    expect(getShapeDefinition("paired_return").rootOptionCount.max).toBe(3);
    expect(getShapeDefinition("service_menu").supportedTags).toContain("service");
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
      expect(definition.supportedTags.length).toBeGreaterThan(0);
      expect(definition.payloadCompatibility.length).toBeGreaterThan(0);
      expect(definition.payloadCompatibility.map((entry) => entry.familyId)).toEqual(expect.arrayContaining([
        "adapter",
        "decision_tree",
      ]));
      expect(definition.validationRules.length).toBeGreaterThan(0);
      expect(definition.repairPreferences.length).toBeGreaterThan(0);
      expect(definition.debugLabel.length).toBeGreaterThan(0);
      expect(definition.versionContribution).toBeDefined();
    }
  });

  it("uses registry lookup and fallback metadata without a closed ID union", () => {
    expect(isJourneyShapeId("risk_or_skip")).toBe(true);
    expect(isJourneyShapeId("fixture_test_shape")).toBe(false);
    expect(getShapePlugin("risk_or_skip").validators?.map((entry) => entry.ruleId)).toContain(
      "risk_or_skip_envelope",
    );
    expect(fallbackShapeIds()).toEqual([
      "curated_reward_trio",
      "single_reward",
      "service_menu",
    ]);
  });

  it("maps decision-tree payload compatibility only to tree topology shapes", () => {
    for (const definition of JOURNEY_SHAPES) {
      const decisionTreeCompatibility = definition.payloadCompatibility.find((entry) =>
        entry.familyId === "decision_tree"
      );

      expect(decisionTreeCompatibility, definition.id).toBeDefined();
      expect(decisionTreeCompatibility?.legality, definition.id).toBe(
        definition.topology === "decision_tree" ? "legal" : "unsupported",
      );
      expect(decisionTreeCompatibility?.variants, definition.id).toEqual(
        definition.topology === "decision_tree" ? ["complete-decision-tree"] : [],
      );
    }
  });

  it("keeps concrete debug payload variants aligned with shape compatibility metadata", () => {
    const availableDebugVariants = new Map(
      DEBUG_PAYLOAD_FAMILIES.flatMap((family) =>
        family.variants
          .filter((variant) => variant.availability === "available")
          .map((variant) => [`${family.id}/${variant.id}`, { family, variant }] as const)
      ),
    );

    for (const { family, variant } of availableDebugVariants.values()) {
      const supportedShapes = variant.supportedShapes === "all"
        ? JOURNEY_SHAPES.map((shape) => shape.id)
        : variant.supportedShapes;

      for (const shapeId of supportedShapes) {
        const compatibility = getShapeDefinition(shapeId).payloadCompatibility.find((entry) =>
          entry.familyId === family.id
        );

        expect(compatibility?.legality, `${variant.qaId}:${shapeId}`).toBe("legal");
        expect(compatibility?.variants, `${variant.qaId}:${shapeId}`).toContain(variant.id);
      }
    }

    for (const shape of JOURNEY_SHAPES) {
      for (const compatibility of shape.payloadCompatibility) {
        if (compatibility.legality !== "legal") {
          continue;
        }

        for (const variantId of compatibility.variants) {
          const debugVariant = availableDebugVariants.get(`${compatibility.familyId}/${variantId}`);

          if (!debugVariant) {
            continue;
          }

          const supportedShapes = debugVariant.variant.supportedShapes === "all"
            ? JOURNEY_SHAPES.map((entry) => entry.id)
            : debugVariant.variant.supportedShapes;

          expect(supportedShapes, `${compatibility.familyId}/${variantId}:${shape.id}`).toContain(shape.id);
        }
      }
    }
  });

  it("requires non-tree shapes to expose a root choice", () => {
    for (const definition of JOURNEY_SHAPES) {
      if (definition.topology === "decision_tree") {
        continue;
      }

      // single_rule_trial intentionally has no root choice; it applies a
      // single rule deterministically. All other non-tree shapes still
      // require a meaningful choice surface (>= 2 root options).
      if (definition.topology === "single_rule_trial") {
        continue;
      }

      expect(definition.rootOptionCount.min, definition.id).toBeGreaterThanOrEqual(2);
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

    expect(getShapeDefinition("random_rewards").rootOptionCount).toEqual({
      min: 3,
      max: 4,
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
        repairPreferences: ["fixture_rebuild"],
        debugLabel: "Fixture test shape",
        versionContribution: {
          catalogVersion: JOURNEY_SHAPE_CATALOG_VERSION,
          id: "fixture_test_shape",
          topology: "decision_tree",
        },
      },
      scoreWeight: 1.1,
      fill: () => ({ options: [], precommitted: {} }),
      repair: {
        actions: [
          { action: "fixture_rebuild", kind: "simplify_fill" },
        ],
      },
    });

    expect(plugin.id).toBe("fixture_test_shape");
    expect(plugin.definition.id).toBe("fixture_test_shape");
    expect(plugin.fill({ context: {} as never, drawContext: {} as never })).toEqual({
      options: [],
      precommitted: {},
    });
    expect(plugin.repair?.actions?.[0]).toEqual({
      action: "fixture_rebuild",
      kind: "simplify_fill",
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
      validationContractVersion: "validation:v1",
      rendererVersion: "renderer:v1",
      questInitializationVersion: "quest-init:v1",
    });

    expect(contentVersion).toMatch(
      /^journey-shapes:v14;manifest:v2;renderer:v1;content:[0-9a-f]{16}$/,
    );
  });
});
