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

const prizeLadderPlugin = getShapePlugin("prize_ladder");
const auditStages: readonly JourneyStage[] = ["early", "mid", "late"];
const auditSeedNumbers = Array.from({ length: 10 }, (_entry, index) =>
  String(index + 1).padStart(2, "0"),
);
const stageEssenceBudget: Record<JourneyStage, number> = {
  early: 120,
  mid: 400,
  late: 400,
};
const stagePathMargin: Record<JourneyStage, number> = {
  early: 15,
  mid: 80,
  late: 30,
};

let contentContextPromise:
  | ReturnType<typeof loadContentContext>
  | undefined;

async function contentContext() {
  contentContextPromise ??= loadContentContext(process.cwd());

  return contentContextPromise;
}

async function forcedPrizeLadderManifest(seed: string, stage: JourneyStage) {
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
    forcedShapeId: "prize_ladder",
    forcedStage: stage,
  });
}

function primaryEffectKind(branch: JourneyTreeBranch): string | undefined {
  const primaryEffect = branch.effects[0];

  if (
    primaryEffect &&
    typeof primaryEffect === "object" &&
    "kind" in primaryEffect &&
    typeof primaryEffect.kind === "string"
  ) {
    return primaryEffect.kind;
  }

  return undefined;
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
    shapeId: "prize_ladder",
    tree,
  } as JourneyManifest;
}

function runTreeValidator(tree: JourneyTree, bundle: TestContextBundle) {
  return prizeLadderPlugin.treeValidator?.(
    manifestWithTree(tree),
    bundle.context,
    [],
  );
}

function assertPrizeLadderTree(tree: JourneyTree) {
  expect(tree.rootNodeId).toBe("level-1");
  expect(tree.nodes).toHaveLength(3);

  const rewardKinds = new Set<string>();
  const costKinds = new Set<string>();
  const stopValues: number[] = [];
  const continueCosts: number[] = [];

  for (const [index, node] of tree.nodes.entries()) {
    const level = index + 1;
    const isFinal = level === tree.nodes.length;

    expect(node.id).toBe(`level-${level}`);
    expect(node.levelLabel).toBe(`Level ${level}`);
    expect(node.branches.map((branch) => branch.label)).toEqual([
      "Stop",
      isFinal ? "Claim" : "Continue",
    ]);

    const stop = node.branches[0]!;
    const advance = node.branches[1]!;

    expect(stop.nextNodeId).toBeUndefined();
    expect(stop.costs).toEqual([]);
    expect(stop.terminal).toMatchObject({
      outcome: "end",
      costs: [],
      effects: stop.effects,
    });
    expect(stop.effects.length).toBeGreaterThan(0);
    expect(stop.effectConvertedEssence).toBeGreaterThan(0);
    rewardKinds.add(primaryEffectKind(stop) ?? "missing");
    stopValues.push(stop.effectConvertedEssence);

    expect(advance.costs).toHaveLength(1);
    expect(primaryCostKind(advance)).toBe("essence");
    expect(advance.costConvertedEssence).toBeGreaterThan(0);
    expect(advance.text).toMatch(/^Pay \d+ essence/u);
    costKinds.add(primaryCostKind(advance) ?? "missing");
    continueCosts.push(advance.costConvertedEssence);

    if (isFinal) {
      expect(advance.nextNodeId).toBeUndefined();
      expect(advance.terminal).toMatchObject({
        outcome: "claim",
        costs: advance.costs,
        effects: advance.effects,
      });
      expect(advance.effects.length).toBeGreaterThan(0);
      expect(advance.effectConvertedEssence).toBeGreaterThan(
        stop.effectConvertedEssence,
      );
      expect(
        advance.effectConvertedEssence - advance.costConvertedEssence,
      ).toBeGreaterThan(stop.effectConvertedEssence);
      rewardKinds.add(primaryEffectKind(advance) ?? "missing");
    } else {
      expect(advance.nextNodeId).toBe(`level-${level + 1}`);
      expect(advance.terminal).toBeUndefined();
      expect(advance.effects).toEqual([]);
      expect(advance.effectConvertedEssence).toBe(0);
    }
  }

  expect(rewardKinds.size).toBe(1);
  expect(costKinds).toEqual(new Set(["essence"]));
  expect(stopValues).toEqual([...stopValues].sort((left, right) => left - right));
  expect(continueCosts).toEqual(
    [...continueCosts].sort((left, right) => left - right),
  );
}

function fullClaimPathCost(tree: JourneyTree): number {
  return tree.nodes.reduce(
    (total, node) => total + node.branches[1]!.costConvertedEssence,
    0,
  );
}

function levelThreeBranches(tree: JourneyTree): {
  readonly stop: JourneyTreeBranch;
  readonly claim: JourneyTreeBranch;
} {
  const levelThree = tree.nodes[2]!;

  return {
    stop: levelThree.branches[0]!,
    claim: levelThree.branches[1]!,
  };
}

describe("prize_ladder fill", () => {
  it("uses a shape-local decision-tree contract for deterministic ladders", () => {
    expect(prizeLadderPlugin.definition).toMatchObject({
      topology: "decision_tree",
      rootOptionCount: { min: 0, max: 0 },
      supportedTags: ["sequence", "ladder", "cost", "reward", "tree"],
      validationRules: [
        "tree_has_complete_visible_levels",
        "stop_rewards_scale_coherently",
        "continue_costs_share_family",
      ],
    });
    expect(prizeLadderPlugin.treeValidator).toEqual(expect.any(Function));
  });

  it("generates a complete stop-continue-claim ladder", async () => {
    const manifest = await forcedPrizeLadderManifest(
      "migration:prize_ladder:mid:01",
      "mid",
    );

    expect(manifest.options).toEqual([]);
    expect(manifest.shapeId).toBe("prize_ladder");
    assertPrizeLadderTree(manifest.tree!);
  });

  it("generates valid progressive trees for every audited stage seed", async () => {
    for (const stage of auditStages) {
      for (const seedNumber of auditSeedNumbers) {
        const seed = `audit:prize_ladder:${stage}:${seedNumber}`;
        const manifest = await forcedPrizeLadderManifest(seed, stage);

        expect(manifest.shapeId, seed).toBe("prize_ladder");
        assertPrizeLadderTree(manifest.tree!);

        for (const node of manifest.tree?.nodes ?? []) {
          for (const branch of node.branches) {
            expect(branch.text, seed).not.toMatch(/\s,|,\s*,/u);
            expect(branch.text, seed).not.toMatch(/\bundefined\b/i);
          }
        }
      }
    }
  });

  it("keeps every audited claim path reachable with a final net premium", async () => {
    for (const stage of auditStages) {
      for (const seedNumber of auditSeedNumbers) {
        const seed = `audit:prize_ladder:${stage}:${seedNumber}`;
        const manifest = await forcedPrizeLadderManifest(seed, stage);
        const tree = manifest.tree!;
        const { stop, claim } = levelThreeBranches(tree);

        expect(fullClaimPathCost(tree), seed).toBeLessThanOrEqual(
          stageEssenceBudget[stage] - stagePathMargin[stage],
        );
        expect(
          claim.effectConvertedEssence - claim.costConvertedEssence,
          seed,
        ).toBeGreaterThanOrEqual(stop.effectConvertedEssence + 25);
      }
    }
  });

  it("scales cited audit ladder costs by stage", async () => {
    const early = await forcedPrizeLadderManifest(
      "audit:prize_ladder:early:07",
      "early",
    );
    const mid = await forcedPrizeLadderManifest(
      "audit:prize_ladder:mid:04",
      "mid",
    );
    const late = await forcedPrizeLadderManifest(
      "audit:prize_ladder:late:02",
      "late",
    );

    expect(fullClaimPathCost(early.tree!)).toBeLessThan(
      fullClaimPathCost(mid.tree!),
    );
    expect(fullClaimPathCost(mid.tree!)).toBeLessThan(
      fullClaimPathCost(late.tree!),
    );
  });

  it("is deterministic for a fixed seed and stage", async () => {
    const first = await forcedPrizeLadderManifest(
      "migration:prize_ladder:late:deterministic",
      "late",
    );
    const second = await forcedPrizeLadderManifest(
      "migration:prize_ladder:late:deterministic",
      "late",
    );

    expect(second.tree).toEqual(first.tree);
    expect(second.precommitted).toEqual(first.precommitted);
  });

  it("rejects ladders with disconnected reward families", () => {
    const bundle = makeTestContext({ seed: "prize-ladder-disconnected" });
    const fill = prizeLadderPlugin.fill(bundle);
    const tree = structuredClone(fill.tree!);
    const firstStop = tree.nodes[0]!.branches[0]!;
    const secondStop = tree.nodes[1]!.branches[0]!;

    tree.nodes[0]!.branches[0] = {
      ...firstStop,
      effects: [{ kind: "alpha_reward" }],
    };
    tree.nodes[1]!.branches[0] = {
      ...secondStop,
      effects: [{ kind: "beta_reward" }],
    };

    expect(runTreeValidator(tree, bundle)).toMatchObject({
      ok: false,
      rule: "prize_ladder_rewards_must_connect",
    });
  });

  it("rejects ladders with mixed continuation cost families", () => {
    const bundle = makeTestContext({ seed: "prize-ladder-mixed-costs" });
    const fill = prizeLadderPlugin.fill(bundle);
    const tree = structuredClone(fill.tree!);
    const secondContinue = tree.nodes[1]!.branches[1]!;

    tree.nodes[1]!.branches[1] = {
      ...secondContinue,
      costs: [{ kind: "omens", amount: 1, timing: "immediate" }],
    };

    expect(runTreeValidator(tree, bundle)).toMatchObject({
      ok: false,
      rule: "prize_ladder_costs_must_share_family",
    });
  });
});
