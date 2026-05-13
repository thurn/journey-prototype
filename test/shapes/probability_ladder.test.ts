import { describe, expect, it } from "vitest";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import type {
  JourneyManifest,
  JourneyStage,
  JourneyTree,
  JourneyTreeBranch,
} from "../../src/journey/manifest.js";
import { getShapePlugin } from "../../src/journey/shapes.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import {
  createInitialJourneyState,
  simulateQuestStateForStage,
} from "../../src/quest/init.js";
import type { TestContextBundle } from "../helpers/journey-context.js";
import { makeTestContext } from "../helpers/journey-context.js";

const probabilityLadderPlugin = getShapePlugin("probability_ladder");
const auditStages: readonly JourneyStage[] = ["early", "mid", "late"];
const auditSeedNumbers = Array.from({ length: 10 }, (_entry, index) =>
  String(index + 1).padStart(2, "0"),
);

let contentContextPromise:
  | ReturnType<typeof loadContentContext>
  | undefined;

async function contentContext() {
  contentContextPromise ??= loadContentContext(process.cwd());

  return contentContextPromise;
}

async function forcedProbabilityLadderManifest(
  seed: string,
  stage: JourneyStage,
) {
  const { content, contentVersion } = await contentContext();
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
    forcedShapeId: "probability_ladder",
    forcedStage: stage,
  });
}

function primaryCostKind(branch: JourneyTreeBranch): string | undefined {
  const primaryCost = branch.costs[0];

  if (
    primaryCost &&
    typeof primaryCost === "object" &&
    "kind" in primaryCost &&
    typeof primaryCost.kind === "string"
  ) {
    return primaryCost.kind;
  }

  return undefined;
}

function manifestWithTree(tree: JourneyTree): JourneyManifest {
  return {
    shapeId: "probability_ladder",
    tree,
  } as JourneyManifest;
}

function runTreeValidator(tree: JourneyTree, bundle: TestContextBundle) {
  return probabilityLadderPlugin.treeValidator?.(
    manifestWithTree(tree),
    bundle.context,
    [],
  );
}

function assertProbabilityLadderTree(tree: JourneyTree) {
  expect(tree.rootNodeId).toBe("level-1");
  expect([3, 4]).toContain(tree.nodes.length);

  const attemptCosts: number[] = [];
  const successOdds: number[] = [];
  const successValues: number[] = [];

  for (const [index, node] of tree.nodes.entries()) {
    const level = index + 1;
    const isFinal = level === tree.nodes.length;

    expect(node.id).toBe(`level-${level}`);
    expect(node.levelLabel).toBe(`Level ${level}`);
    expect(node.branches.map((branch) => branch.label)).toEqual([
      "Stop",
      "Attempt",
      "Success",
      "Failure",
    ]);

    const [stop, attempt, success, failure] = node.branches;

    expect(stop).toMatchObject({
      id: `level-${level}-stop`,
      label: "Stop",
      text: "Leave.",
      terminal: { outcome: "leave", costs: [], effects: [] },
    });

    expect(attempt).toMatchObject({
      id: `level-${level}-attempt`,
      label: "Attempt",
      kind: "player_choice",
    });
    expect(attempt?.text).toMatch(/^Pay \d+ essence for a \d+% chance/u);
    expect(attempt?.costs).toHaveLength(1);
    expect(primaryCostKind(attempt!)).toBe("essence");
    expect(attempt?.costConvertedEssence).toBeGreaterThan(0);
    expect(attempt?.odds?.percent).toBeGreaterThan(0);
    attemptCosts.push(attempt!.costConvertedEssence);

    expect(success).toMatchObject({
      id: `level-${level}-success`,
      label: "Success",
      kind: "random_chance",
      terminal: { outcome: "claim" },
    });
    expect(success?.nextNodeId).toBeUndefined();
    expect(success?.effects.length).toBeGreaterThan(0);
    expect(success?.terminal?.effects).toEqual(success?.effects);
    expect(success?.effectConvertedEssence).toBeGreaterThan(0);
    expect(success?.odds?.percent).toBe(attempt?.odds?.percent);
    expect(
      (success!.effectConvertedEssence * success!.odds!.percent) / 100 -
        attempt!.costConvertedEssence,
    ).toBeGreaterThanOrEqual(5);
    successOdds.push(success!.odds!.percent);
    successValues.push(success!.effectConvertedEssence);

    expect(failure).toMatchObject({
      id: `level-${level}-failure`,
      label: "Failure",
      kind: "random_chance",
    });
    expect(failure?.odds?.percent).toBe(100 - success!.odds!.percent);

    if (isFinal) {
      expect(failure?.nextNodeId).toBeUndefined();
      expect(failure?.terminal).toMatchObject({ outcome: "failure" });
    } else {
      expect(failure?.nextNodeId).toBe(`level-${level + 1}`);
      expect(failure?.terminal).toBeUndefined();
    }
  }

  expect(attemptCosts).toEqual(
    [...attemptCosts].sort((left, right) => left - right),
  );
  expect(successOdds).toEqual(
    [...successOdds].sort((left, right) => left - right),
  );
  expect(successValues).toEqual(
    [...successValues].sort((left, right) => left - right),
  );
}

describe("probability_ladder fill", () => {
  it("uses a shape-local decision-tree contract for bounded chance ladders", () => {
    expect(probabilityLadderPlugin.definition).toMatchObject({
      topology: "decision_tree",
      rootOptionCount: { min: 0, max: 0 },
      supportedTags: ["sequence", "chance", "cost", "reward", "tree"],
      validationRules: [
        "tree_has_complete_visible_levels",
        "fixed_reward_can_be_won_once",
        "attempt_costs_share_family",
      ],
      repairPreferences: [
        "normalize_attempt_costs",
        "make_success_terminal",
        "simplify_ladder_level_count",
      ],
    });
    expect(probabilityLadderPlugin.fill).toEqual(expect.any(Function));
    expect(probabilityLadderPlugin.treeValidator).toEqual(expect.any(Function));
  });

  it("generates a complete visible chance ladder", async () => {
    const manifest = await forcedProbabilityLadderManifest(
      "migration:probability_ladder:mid:01",
      "mid",
    );

    expect(manifest.options).toEqual([]);
    expect(manifest.shapeId).toBe("probability_ladder");
    assertProbabilityLadderTree(manifest.tree!);
    expect(manifest.precommitted.random).toEqual([
      expect.objectContaining({
        kind: "probability_ladder",
        bounded: true,
        odds: manifest.tree!.nodes[0]!.branches[1]!.odds,
        visibilityPolicy: expect.objectContaining({
          outcomeVisibility: "visible",
          playerVisible: true,
        }),
      }),
    ]);
    expect(manifest.debug.validation.rules.map((rule) => rule.ruleId)).toContain(
      "decision_tree_invariants",
    );
  });

  it("generates valid ladders for every audited stage seed", async () => {
    for (const stage of auditStages) {
      for (const seedNumber of auditSeedNumbers) {
        const seed = `audit:probability_ladder:${stage}:${seedNumber}`;
        const manifest = await forcedProbabilityLadderManifest(seed, stage);

        expect(manifest.shapeId, seed).toBe("probability_ladder");
        assertProbabilityLadderTree(manifest.tree!);

        for (const node of manifest.tree?.nodes ?? []) {
          for (const branch of node.branches) {
            expect(branch.text, seed).not.toMatch(/\s,|,\s*,/u);
            expect(branch.text, seed).not.toMatch(/\bundefined\b/i);
          }
        }
      }
    }
  });

  it("is deterministic for a fixed seed and stage", async () => {
    const first = await forcedProbabilityLadderManifest(
      "migration:probability_ladder:late:deterministic",
      "late",
    );
    const second = await forcedProbabilityLadderManifest(
      "migration:probability_ladder:late:deterministic",
      "late",
    );

    expect(second.tree).toEqual(first.tree);
    expect(second.precommitted).toEqual(first.precommitted);
  });

  it("rejects ladders without visible success outcomes", () => {
    const bundle = makeTestContext({
      seed: "probability-ladder-missing-success",
    });
    const fill = probabilityLadderPlugin.fill(bundle);
    const tree = structuredClone(fill.tree!);

    for (const node of tree.nodes) {
      node.branches = node.branches.filter(
        (branch) => branch.label !== "Success",
      );
    }

    expect(runTreeValidator(tree, bundle)).toMatchObject({
      ok: false,
      rule: "probability_ladder_missing_success",
    });
  });

  it("rejects reward branches that do not end the Journey", () => {
    const bundle = makeTestContext({
      seed: "probability-ladder-nonterminal-success",
    });
    const fill = probabilityLadderPlugin.fill(bundle);
    const tree = structuredClone(fill.tree!);
    const firstSuccess = tree.nodes[0]!.branches[2]!;

    tree.nodes[0]!.branches[2] = {
      ...firstSuccess,
      terminal: undefined,
      nextNodeId: "level-2",
    };

    expect(runTreeValidator(tree, bundle)).toMatchObject({
      ok: false,
      rule: "fixed_reward_can_be_won_once",
    });
  });
});
