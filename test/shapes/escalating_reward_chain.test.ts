import { describe, expect, it } from "vitest";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import type {
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

const escalatingRewardChainPlugin = getShapePlugin("escalating_reward_chain");
const auditStages: readonly JourneyStage[] = ["early", "mid", "late"];
const auditSeedNumbers = Array.from({ length: 10 }, (_entry, index) =>
  String(index + 1).padStart(2, "0"),
);
const stagePathBudget: Record<JourneyStage, number> = {
  early: 105,
  mid: 340,
  late: 320,
};

let contentContextPromise:
  | ReturnType<typeof loadContentContext>
  | undefined;

async function contentContext() {
  contentContextPromise ??= loadContentContext(process.cwd());

  return contentContextPromise;
}

async function forcedEscalatingRewardChainManifest(
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
    forcedShapeId: "escalating_reward_chain",
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

function assertEscalatingRewardChainTree(tree: JourneyTree) {
  expect(tree.rootNodeId).toBe("level-1");
  expect(tree.nodes).toHaveLength(3);

  const costs: number[] = [];
  const rewards: number[] = [];

  for (const [index, node] of tree.nodes.entries()) {
    const level = index + 1;
    const isFinal = level === tree.nodes.length;

    expect(node.id).toBe(`level-${level}`);
    expect(node.levelLabel).toBe(`Level ${level}`);
    expect(node.branches.map((branch) => branch.label)).toEqual([
      "Stop",
      "Take",
    ]);

    const [stop, take] = node.branches;

    expect(stop).toMatchObject({
      id: `level-${level}-stop`,
      label: "Stop",
      text: "Leave.",
      terminal: { outcome: "leave", costs: [], effects: [] },
    });

    expect(take).toMatchObject({
      id: `level-${level}-take`,
      label: "Take",
      kind: "player_choice",
    });
    expect(take?.text).toMatch(/^Pay \d+ essence and /u);
    expect(take?.costs).toHaveLength(1);
    expect(primaryCostKind(take!)).toBe("essence");
    expect(take?.costConvertedEssence).toBeGreaterThan(0);
    expect(take?.effectConvertedEssence).toBeGreaterThan(0);
    expect(
      take!.effectConvertedEssence - take!.costConvertedEssence,
    ).toBeGreaterThanOrEqual(15);

    costs.push(take!.costConvertedEssence);
    rewards.push(take!.effectConvertedEssence);

    if (isFinal) {
      expect(take?.nextNodeId).toBeUndefined();
      expect(take?.terminal).toMatchObject({
        outcome: "claim",
        costs: take?.costs,
        effects: take?.effects,
      });
    } else {
      expect(take?.nextNodeId).toBe(`level-${level + 1}`);
      expect(take?.terminal).toBeUndefined();
    }
  }

  expect(costs).toEqual([...costs].sort((left, right) => left - right));
  expect(rewards).toEqual([...rewards].sort((left, right) => left - right));
}

function fullTakePathCost(tree: JourneyTree): number {
  return tree.nodes.reduce(
    (total, node) => total + node.branches[1]!.costConvertedEssence,
    0,
  );
}

describe("escalating_reward_chain fill", () => {
  it("uses a shape-local decision-tree contract for escalating rewards", () => {
    expect(escalatingRewardChainPlugin.definition).toMatchObject({
      topology: "decision_tree",
      rootOptionCount: { min: 0, max: 0 },
      supportedTags: ["sequence", "reward", "cost", "chain", "tree"],
      validationRules: [
        "tree_has_complete_visible_levels",
        "chain_rewards_share_family",
        "take_costs_scale_coherently",
      ],
    });
    expect(escalatingRewardChainPlugin.fill).toEqual(expect.any(Function));
  });

  it("generates valid escalating chains for every audited stage seed", async () => {
    for (const stage of auditStages) {
      for (const seedNumber of auditSeedNumbers) {
        const seed = `audit:escalating_reward_chain:${stage}:${seedNumber}`;
        const manifest = await forcedEscalatingRewardChainManifest(seed, stage);

        expect(manifest.shapeId, seed).toBe("escalating_reward_chain");
        expect(manifest.options, seed).toEqual([]);
        assertEscalatingRewardChainTree(manifest.tree!);
        expect(fullTakePathCost(manifest.tree!), seed).toBeLessThanOrEqual(
          stagePathBudget[stage],
        );

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
    const first = await forcedEscalatingRewardChainManifest(
      "migration:escalating_reward_chain:late:deterministic",
      "late",
    );
    const second = await forcedEscalatingRewardChainManifest(
      "migration:escalating_reward_chain:late:deterministic",
      "late",
    );

    expect(second.tree).toEqual(first.tree);
    expect(second.precommitted).toEqual(first.precommitted);
  });
});
