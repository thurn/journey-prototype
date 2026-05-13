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
const TARGET_DEPENDENT_POOL_IDS = new Set([
  "apply_named_transfiguration_to_all_predicate_cards",
  "gain_essence_random_range",
  "meta_gain_2_rewards",
  "purge_X_banes",
  "purge_all_banes",
  "replace_site_type",
]);
const EARLY_SCALE_POOL_IDS = new Set([
  "draw_X_and_duplicate_chosen",
  "gain_copy_of_chosen_dreamsign",
  "gain_copy_of_random_dreamsign",
  "gain_essence_to_max",
  "increase_max_essence",
  "set_essence_to_percent_of_max",
  "shop_essence_discount",
]);
const NESTED_RANDOM_POOL_IDS = new Set([
  "apply_named_transfiguration_to_random_predicate_cards",
  "apply_random_transfigurations_to_random_cards",
  "duplicate_random_predicate",
  "gain_random_predicate_cards",
  "modify_random_cards_to_types",
  "purge_random_starter",
  "purge_random_starter_with_predicate_replacement",
  "temporary_dreamsign_for_X_battles",
  "transfigure_all_starters",
  "transfigure_random_starters",
]);

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

async function forcedRandomPoolManifest(seed: string, stage: JourneyStage) {
  const { content, contentVersion } = await loadContentContext(process.cwd());
  const state = createInitialJourneyState({ seed, content, contentVersion });
  simulateQuestStateForStage({
    state,
    stage,
    drawContext: { seed, contentVersion, rootJourneyIndex: 0 },
  });
  const context = buildJourneyContext({
    projectRoot: process.cwd(),
    content,
    state,
    contentVersion,
  });

  return generateNextJourney({
    context,
    forcedShapeId: "random_pool_draws",
    forcedStage: stage,
  });
}

function poolTemplateIds(manifest: Awaited<ReturnType<typeof forcedRandomPoolManifest>>): string[] {
  return (manifest.rewardPool?.rewards ?? []).flatMap((reward) => {
    if (typeof reward !== "object" || reward === null || !("templateId" in reward)) {
      return [];
    }

    const templateId = (reward as { readonly templateId?: unknown }).templateId;

    return typeof templateId === "string" ? [templateId] : [];
  });
}

function drawCosts(manifest: Awaited<ReturnType<typeof forcedRandomPoolManifest>>): number[] {
  return (manifest.tree?.nodes ?? []).map((node) => {
    const drawBranch = node.branches.find((branch) => branch.label === "Draw");
    const match = drawBranch?.text.match(/^Pay (\d+) essence/u);

    return match ? Number(match[1]) : Number.NaN;
  });
}

describe("random_pool_draws fill", () => {
  it("uses the shape-owned validation bypass contract", () => {
    expect(randomPoolDrawsPlugin.definition).toMatchObject({
      topology: "decision_tree",
      rootOptionCount: { min: 0, max: 0 },
      supportedTags: [],
      validationRules: [
        "manifest_schema_version",
        "manifest_version_metadata",
        "journey_id_format",
        "root_option_count_within_bounds",
      ],
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
  });

  it.each([
    ["audit:random_pool_draws:early:03", "early"],
    ["audit:random_pool_draws:early:07", "early"],
    ["audit:random_pool_draws:early:10", "early"],
  ] as const)("keeps early audit pool %s inside early-stage bands", async (seed, stage) => {
    const manifest = await forcedRandomPoolManifest(seed, stage);
    const ids = poolTemplateIds(manifest);

    for (const id of ids) {
      expect(EARLY_SCALE_POOL_IDS.has(id)).toBe(false);
    }
    expect(ids.filter((id) => NESTED_RANDOM_POOL_IDS.has(id)).length)
      .toBeLessThanOrEqual(1);
    for (const reward of manifest.rewardPool?.rewards ?? []) {
      if (typeof reward !== "object" || reward === null) {
        continue;
      }
      const templateId = (reward as { readonly templateId?: unknown }).templateId;
      const params = (reward as { readonly params?: unknown }).params;
      if (
        templateId === "duplicate_chosen_cards" ||
        templateId === "duplicate_named_card_X"
      ) {
        expect((params as { readonly count?: number }).count).toBeLessThanOrEqual(1);
      }
    }
  });

  it.each([
    ["audit:random_pool_draws:early:01", "early"],
    ["audit:random_pool_draws:mid:08", "mid"],
    ["audit:random_pool_draws:late:05", "late"],
  ] as const)("renders audit pool %s as numbered outcomes with policy line", async (seed, stage) => {
    const manifest = await forcedRandomPoolManifest(seed, stage);
    const summary = manifest.rewardPool?.summary ?? "";

    expect(summary).toMatch(/^Randomly gain one:\n1\. /u);
    expect(summary).toContain("\n2. ");
    expect(summary).toMatch(/\nReplacement policy: Outcomes draw (with|without) replacement\.$/u);
  });

  it.each([
    ["audit:random_pool_draws:late:03", "late"],
    ["audit:random_pool_draws:late:08", "late"],
    ["audit:random_pool_draws:late:10", "late"],
  ] as const)("filters hidden-state pool outcomes for audit seed %s", async (seed, stage) => {
    const manifest = await forcedRandomPoolManifest(seed, stage);
    const ids = poolTemplateIds(manifest);

    for (const id of ids) {
      expect(TARGET_DEPENDENT_POOL_IDS.has(id)).toBe(false);
    }
  });

  it.each([
    ["audit:random_pool_draws:early:07", "early"],
    ["audit:random_pool_draws:mid:10", "mid"],
    ["audit:random_pool_draws:late:09", "late"],
  ] as const)("escalates draw prices for audit seed %s", async (seed, stage) => {
    const manifest = await forcedRandomPoolManifest(seed, stage);
    const costs = drawCosts(manifest);

    expect(costs.length).toBeGreaterThanOrEqual(3);
    expect(costs.every((cost) => Number.isFinite(cost))).toBe(true);
    expect(costs[0]).toBeGreaterThanOrEqual(stage === "early" ? 35 : stage === "mid" ? 45 : 55);
    for (let index = 1; index < costs.length; index += 1) {
      expect(costs[index]).toBeGreaterThan(costs[index - 1]!);
    }
  });

  it("shows the committed draw order in debug metadata", async () => {
    const manifest = await forcedRandomPoolManifest(
      "audit:random_pool_draws:mid:01",
      "mid",
    );
    const repeatedDraws = manifest.precommitted.random?.find((entry) =>
      entry.kind === "repeated_pool_draws"
    );

    expect(repeatedDraws?.visibilityPolicy?.disclosure).toMatch(
      /^Committed draw order: #\d+ /u,
    );
    expect(repeatedDraws?.visibilityPolicy?.disclosure).toContain(" -> ");
    expect(repeatedDraws?.visibilityPolicy?.disclosure.endsWith(".")).toBe(false);
  });
});
