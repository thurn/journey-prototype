import { describe, expect, it } from "vitest";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import type { JourneyStage } from "../../src/journey/manifest.js";
import { getShapePlugin } from "../../src/journey/shapes.js";
import type { JourneyContext } from "../../src/quest/context.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import {
  createInitialJourneyState,
  simulateQuestStateForStage,
} from "../../src/quest/init.js";
import type { DrawContext } from "../../src/util/rng.js";

const randomPoolDrawsPlugin = getShapePlugin("random_pool_draws");

function fakeCtx(): JourneyContext {
  return {
    projectRoot: "",
    contentVersion: "v1",
    content: { cards: [], dreamcallers: [], dreamsigns: [], rawBytes: {} as never },
    state: {
      schemaVersion: 1,
      contentVersion: "v1",
      generator: { rootJourneyIndex: 0, lastJourneyId: null, cursors: {} },
      pendingJourney: null,
      history: [],
      quest: {
        seed: "random-pool-draws-test",
        dreamcaller: { id: "x", name: "x", title: "x", awakening: "x" },
        resources: { essence: 160, maxEssence: 300, omens: 2, dreamscape: 2 },
        selectedTides: [],
        mandatoryTides: [],
        optionalSubset: [],
        deck: {
          entries: [],
          summary: { totalCards: 0, starterCards: 0, uniqueCards: 0 },
        },
        activeDreamsigns: [],
        banes: [],
        dreamsignPoolIds: [],
        dreamsignPoolSummary: {
          tidalPoolCount: 0,
          neutralCatalogCount: 0,
        },
        draftPool: [],
        draftPoolSummary: {
          totalCopies: 0,
          uniqueCards: 0,
          oneCopyCards: 0,
          twoCopyCards: 0,
        },
        route: { pacingLedger: {}, unresolvedHooks: [] },
      },
    },
  } as JourneyContext;
}

function fakeDraw(seed: string): DrawContext {
  return { seed, contentVersion: "v1", rootJourneyIndex: 0 };
}

describe("random_pool_draws fill", () => {
  it("uses the shape-owned validation bypass contract", () => {
    expect(randomPoolDrawsPlugin.definition).toMatchObject({
      topology: "decision_tree",
      rootOptionCount: { min: 0, max: 0 },
      supportedTags: [],
      payloadCompatibility: [
        {
          familyId: "decision_tree",
          variants: ["complete-decision-tree"],
          legality: "legal",
        },
      ],
      validationRules: [
        "manifest_schema_version",
        "manifest_version_metadata",
        "journey_id_format",
        "root_option_count_within_bounds",
      ],
      repairPreferences: [],
      bypassStandardValidation: true,
    });
  });

  it("builds a visible shared-reward pool and empty-structured tree branches", () => {
    const fill = randomPoolDrawsPlugin.fill({
      context: fakeCtx(),
      drawContext: fakeDraw("random-pool-draws-tree"),
      stage: "mid" as JourneyStage,
    });

    expect(fill.options).toEqual([]);
    expect(fill.symmetryContracts).toBeUndefined();
    expect(fill.tree?.nodes.length).toBeGreaterThanOrEqual(3);
    expect(fill.rewardPool).toMatchObject({
      operations: [],
    });
    expect(fill.rewardPool?.rewards.length).toBeGreaterThanOrEqual(5);

    const random = fill.precommitted.random ?? [];
    expect(random[0]).toMatchObject({
      kind: "visible_pool",
      poolId: "random-pool-draws",
      rewards: fill.rewardPool?.rewards,
      replacement: fill.rewardPool?.replacement,
    });
    expect(random[1]).toMatchObject({
      kind: "repeated_pool_draws",
      poolId: "random-pool-draws",
      drawCount: fill.tree?.nodes.length,
      rewards: fill.rewardPool?.rewards,
      replacement: fill.rewardPool?.replacement,
    });
    expect(JSON.stringify(random)).toContain("shared_reward_template");

    for (const node of fill.tree?.nodes ?? []) {
      expect(node.branches).toHaveLength(2);
      for (const branch of node.branches) {
        expect(branch.operations).toEqual([]);
        expect(branch.costs).toEqual([]);
        expect(branch.effects).toEqual([]);
        expect(branch.burdens).toEqual([]);
        expect(branch.targets).toEqual([]);
        expect(branch.triggers).toEqual([]);
        expect(branch.routeEffects).toEqual([]);
        if (branch.terminal) {
          expect(branch.terminal.operations).toEqual([]);
          expect(branch.terminal.costs).toEqual([]);
          expect(branch.terminal.effects).toEqual([]);
          expect(branch.terminal.burdens).toEqual([]);
          expect(branch.terminal.targets).toEqual([]);
          expect(branch.terminal.routeEffects).toEqual([]);
        }
      }
    }
  });

  it("is deterministic for a fixed draw context", () => {
    const args = {
      context: fakeCtx(),
      drawContext: fakeDraw("random-pool-draws-deterministic"),
      stage: "late" as JourneyStage,
    };

    expect(randomPoolDrawsPlugin.fill(args)).toEqual(
      randomPoolDrawsPlugin.fill(args),
    );
  });

  it("generates a forced manifest with renderer and debug-compatible metadata", async () => {
    const seed = "audit:random_pool_draws:mid:01";
    const { content, contentVersion } = await loadContentContext(process.cwd());
    const state = createInitialJourneyState({ seed, content, contentVersion });
    simulateQuestStateForStage({
      state,
      stage: "mid",
      drawContext: { seed, contentVersion, rootJourneyIndex: 0 },
    });
    const context = buildJourneyContext({
      projectRoot: process.cwd(),
      content,
      state,
      contentVersion,
    });
    const manifest = generateNextJourney({
      context,
      forcedShapeId: "random_pool_draws",
      forcedStage: "mid",
    });

    expect(manifest.options).toEqual([]);
    expect(manifest.tree?.rootNodeId).toBe("level-1");
    expect(manifest.rewardPool?.summary).toContain("Randomly gain one:");
    expect(manifest.precommitted.random?.map((entry) => entry.kind)).toEqual([
      "visible_pool",
      "repeated_pool_draws",
    ]);
    expect(manifest.debug.validation.rules.map((rule) => rule.ruleId)).toEqual([
      "manifest_schema_version",
      "manifest_version_metadata",
      "journey_id_format",
      "root_option_count_within_bounds",
    ]);
  });
});
