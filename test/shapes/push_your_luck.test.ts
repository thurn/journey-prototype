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

const pushYourLuckPlugin = getShapePlugin("push_your_luck");
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

async function forcedPushYourLuckManifest(seed: string, stage: JourneyStage) {
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
    forcedShapeId: "push_your_luck",
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

function manifestWithTree(tree: JourneyTree): JourneyManifest {
  return {
    shapeId: "push_your_luck",
    tree,
  } as JourneyManifest;
}

function runTreeValidator(tree: JourneyTree, bundle: TestContextBundle) {
  return pushYourLuckPlugin.treeValidator?.(
    manifestWithTree(tree),
    bundle.context,
    [],
  );
}

function pushBranches(tree: JourneyTree): JourneyTreeBranch[] {
  return tree.nodes.map((node) =>
    node.branches.find((branch) => branch.label === "Attempt"),
  ).filter((branch): branch is JourneyTreeBranch => Boolean(branch));
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

describe("push_your_luck fill", () => {
  it("uses a shape-local decision-tree contract with repeated rising odds", () => {
    expect(pushYourLuckPlugin.definition).toMatchObject({
      topology: "decision_tree",
      rootOptionCount: { min: 0, max: 0 },
      supportedTags: ["sequence", "chance", "cost", "reward", "stop", "tree"],
      validationRules: [
        "tree_has_complete_visible_levels",
        "push_attempts_repeat_cost_and_reward",
        "push_odds_rise_by_supported_step",
      ],
    });
  });

  it("generates a repeated-cost chance tree with rising odds", async () => {
    const manifest = await forcedPushYourLuckManifest(
      "migration:push_your_luck:mid:01",
      "mid",
    );

    expect(manifest.options).toEqual([]);
    expect(manifest.shapeId).toBe("push_your_luck");
    expect(manifest.tree?.rootNodeId).toBe("level-1");
    expect(manifest.tree?.nodes).toHaveLength(3);

    const attemptCosts: number[] = [];
    const attemptRewardTexts: string[] = [];
    const attemptRewardKinds = new Set<string>();
    const attemptOdds: number[] = [];

    for (const [index, node] of (manifest.tree?.nodes ?? []).entries()) {
      const level = index + 1;
      expect(node.id).toBe(`level-${index + 1}`);
      expect(node.branches.map((branch) => branch.label)).toEqual([
        "Leave",
        "Attempt",
      ]);

      const [leave, attempt] = node.branches;

      expect(leave).toMatchObject({
        id: `level-${level}-leave`,
        label: "Leave",
        text: "Leave.",
        terminal: { outcome: "leave", costs: [], effects: [] },
      });

      expect(attempt).toMatchObject({
        id: `level-${level}-attempt`,
        label: "Attempt",
        kind: "player_choice",
      });
      expect(attempt?.text).toMatch(
        /^Pay \d+ essence\. \d+% chance to gain /u,
      );
      expect(attempt?.text).not.toMatch(/banked|failure|Bane|Paranoia|Despair|Oblivion/iu);
      expect(attempt?.costs).toHaveLength(1);
      expect(primaryCostKind(attempt!)).toBe("essence");
      expect(attempt?.costConvertedEssence).toBeGreaterThan(0);
      expect(attempt?.effects.length).toBeGreaterThan(0);
      expect(attempt?.effectConvertedEssence).toBeGreaterThan(0);
      expect(attempt?.burdens).toEqual([]);
      expect(attempt?.odds?.percent).toBeGreaterThan(0);
      expect(attempt?.odds?.percent).toBeLessThanOrEqual(95);
      expect(attempt?.terminal?.outcome).toBe("claim");

      if (index < 2) {
        expect(attempt?.nextNodeId).toBe(`level-${index + 2}`);
      } else {
        expect(attempt?.nextNodeId).toBeUndefined();
      }

      attemptCosts.push(attempt!.costConvertedEssence);
      attemptRewardTexts.push(attempt!.text.replace(/^Pay \d+ essence\. \d+% chance to /u, ""));
      attemptRewardKinds.add(primaryEffectKind(attempt!) ?? "missing");
      attemptOdds.push(attempt!.odds!.percent);
    }

    expect(new Set(attemptCosts).size).toBe(1);
    expect(new Set(attemptRewardTexts).size).toBe(1);
    expect(attemptRewardKinds.size).toBe(1);
    expect(attemptOdds.slice(1).map((chance, index) => chance - attemptOdds[index]!))
      .toSatisfy((steps: number[]) =>
        steps.length > 0 &&
        steps.every((step) => [10, 20, 25].includes(step)),
      );
    expect(manifest.precommitted.random?.[0]).toMatchObject({
      kind: "push_choice",
      bounded: true,
      attempts: [
        expect.objectContaining({ id: "level-1-attempt" }),
        expect.objectContaining({ id: "level-2-attempt" }),
        expect.objectContaining({ id: "level-3-attempt" }),
      ],
      visibilityPolicy: expect.objectContaining({
        outcomeVisibility: "visible",
        playerVisible: true,
      }),
    });
  });

  it("generates valid progressive trees for every audited stage seed", async () => {
    for (const stage of auditStages) {
      for (const seedNumber of auditSeedNumbers) {
        const manifest = await forcedPushYourLuckManifest(
          `audit:push_your_luck:${stage}:${seedNumber}`,
          stage,
        );
        const tree = manifest.tree!;
        const attempts = pushBranches(tree);
        const rewardKinds = new Set(attempts.map(primaryEffectKind));
        const costs = attempts.map((branch) => branch.costConvertedEssence);
        const rewardTexts = attempts.map((branch) =>
          branch.text.replace(/^Pay \d+ essence\. \d+% chance to /u, ""),
        );
        const oddsProgression = attempts.map((branch) => branch.odds!.percent);

        expect(manifest.shapeId).toBe("push_your_luck");
        expect(tree.nodes).toHaveLength(3);
        expect(new Set(costs).size).toBe(1);
        expect(new Set(rewardTexts).size).toBe(1);
        expect(rewardKinds.size).toBe(1);
        expect(oddsProgression.slice(1).map((chance, index) => chance - oddsProgression[index]!))
          .toSatisfy((steps: number[]) =>
            steps.every((step) => [10, 20, 25].includes(step)),
          );

        for (const node of tree.nodes) {
          const [leave, attempt] = node.branches;

          expect(node.branches.map((branch) => branch.label)).toEqual([
            "Leave",
            "Attempt",
          ]);
          expect(leave?.text).toBe("Leave.");
          expect(attempt?.text).not.toMatch(/\s,|,\s*,/u);
          expect(attempt?.text).not.toMatch(/banked|failure|Bane|Paranoia|Despair|Oblivion/iu);

          expect(attempt?.text).toMatch(
            /^Pay \d+ essence\. \d+% chance to gain /u,
          );
        }
      }
    }
  });

  it("is deterministic for a fixed seed and stage", async () => {
    const first = await forcedPushYourLuckManifest(
      "migration:push_your_luck:late:deterministic",
      "late",
    );
    const second = await forcedPushYourLuckManifest(
      "migration:push_your_luck:late:deterministic",
      "late",
    );

    expect(second.tree).toEqual(first.tree);
    expect(second.precommitted).toEqual(first.precommitted);
  });

  it("rejects push trees with visible failure branches", () => {
    const bundle = makeTestContext({ seed: "push-your-luck-validator" });
    const fill = pushYourLuckPlugin.fill(bundle);
    const tree = structuredClone(fill.tree!);
    tree.nodes[0]!.branches.push({
      ...tree.nodes[0]!.branches[1]!,
      id: "level-1-failure",
      label: "Failure",
      kind: "random_chance",
      text: "End the Journey.",
      effects: [],
      costConvertedEssence: 0,
      effectConvertedEssence: 0,
      netConvertedEssence: 0,
      terminal: {
        text: "End the Journey.",
        outcome: "failure",
        operations: [],
        costs: [],
        effects: [],
        burdens: [],
        targets: [],
        routeEffects: [],
      },
    });

    expect(runTreeValidator(tree, bundle)).toMatchObject({
      ok: false,
      rule: "push_visible_branches_must_repeat",
    });
  });

  it("rejects push trees with changing costs or rewards", () => {
    const bundle = makeTestContext({ seed: "push-your-luck-disconnected" });
    const fill = pushYourLuckPlugin.fill(bundle);
    const tree = structuredClone(fill.tree!);
    const secondPush = tree.nodes[1]!.branches[1]!;
    tree.nodes[1]!.branches[1] = {
      ...secondPush,
      costConvertedEssence: secondPush.costConvertedEssence + 5,
    };

    expect(runTreeValidator(tree, bundle)).toMatchObject({
      ok: false,
      rule: "push_attempts_must_repeat",
    });
  });
});
