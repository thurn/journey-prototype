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

async function forcedPushYourLuckManifest(seed: string, stage: JourneyStage) {
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

describe("push_your_luck fill", () => {
  it("uses a shape-local decision-tree contract with visible random hazards", () => {
    expect(pushYourLuckPlugin.definition).toMatchObject({
      topology: "decision_tree",
      rootOptionCount: { min: 0, max: 0 },
      supportedTags: ["sequence", "risk", "random", "reward", "stop", "tree"],
      validationRules: [
        "tree_has_complete_visible_levels",
        "push_failure_ends_journey",
        "push_rewards_are_mechanically_connected",
      ],
      repairPreferences: [
        "make_failure_terminal",
        "align_reward_family",
        "cap_push_levels",
      ],
      payloadCompatibility: expect.arrayContaining([
        expect.objectContaining({
          familyId: "random",
          variants: ["adapter-compatible-random-envelope"],
          legality: "legal",
        }),
        expect.objectContaining({
          familyId: "decision_tree",
          variants: ["complete-decision-tree"],
          legality: "legal",
        }),
      ]),
    });
  });

  it("generates a complete stop-push-failure tree with connected rewards", async () => {
    const manifest = await forcedPushYourLuckManifest(
      "migration:push_your_luck:mid:01",
      "mid",
    );

    expect(manifest.options).toEqual([]);
    expect(manifest.shapeId).toBe("push_your_luck");
    expect(manifest.tree?.rootNodeId).toBe("level-1");
    expect(manifest.tree?.nodes).toHaveLength(3);

    const rewardKinds = new Set<string>();

    for (const [index, node] of (manifest.tree?.nodes ?? []).entries()) {
      expect(node.id).toBe(`level-${index + 1}`);
      expect(node.branches.map((branch) => branch.label)).toEqual([
        "Stop",
        "Push",
        "Failure",
      ]);

      const stop = node.branches[0]!;
      const push = node.branches[1]!;
      const failure = node.branches[2]!;

      expect(stop.terminal?.outcome).toBe(index === 0 ? "leave" : "end");
      expect(failure).toMatchObject({
        kind: "random_chance",
        terminal: expect.objectContaining({ outcome: "failure" }),
      });
      expect(failure.nextNodeId).toBeUndefined();
      expect(failure.odds?.percent).toBe(100 - (push.odds?.percent ?? 0));

      expect(push.kind).toBe("player_choice");
      expect(push.effects.length).toBeGreaterThan(0);
      expect(push.odds?.percent).toBeGreaterThan(0);
      expect(push.odds?.percent).toBeLessThan(100);
      rewardKinds.add(primaryEffectKind(push) ?? "missing");

      if (index < 2) {
        expect(push.nextNodeId).toBe(`level-${index + 2}`);
        expect(push.terminal).toBeUndefined();
      } else {
        expect(push.nextNodeId).toBeUndefined();
        expect(push.terminal?.outcome).toBe("claim");
      }
    }

    expect(rewardKinds.size).toBe(1);
    expect(manifest.precommitted.random?.[0]).toMatchObject({
      kind: "push_choice",
      bounded: true,
      hazard: {
        branches: [
          expect.objectContaining({ id: "level-1-failure" }),
          expect.objectContaining({ id: "level-2-failure" }),
          expect.objectContaining({ id: "level-3-failure" }),
        ],
      },
      visibilityPolicy: expect.objectContaining({
        outcomeVisibility: "visible",
        playerVisible: true,
      }),
    });
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

  it("rejects push trees where a failure can continue", () => {
    const bundle = makeTestContext({ seed: "push-your-luck-validator" });
    const fill = pushYourLuckPlugin.fill(bundle);
    const tree = structuredClone(fill.tree!);
    tree.nodes[0]!.branches[2] = {
      ...tree.nodes[0]!.branches[2]!,
      nextNodeId: "level-2",
    };

    expect(runTreeValidator(tree, bundle)).toMatchObject({
      ok: false,
      rule: "push_failure_must_end",
    });
  });

  it("rejects push trees with disconnected reward families", () => {
    const bundle = makeTestContext({ seed: "push-your-luck-disconnected" });
    const fill = pushYourLuckPlugin.fill(bundle);
    const tree = structuredClone(fill.tree!);
    const firstPush = tree.nodes[0]!.branches[1]!;
    const secondPush = tree.nodes[1]!.branches[1]!;
    tree.nodes[0]!.branches[1] = {
      ...firstPush,
      effects: [{ kind: "alpha_reward" }],
    };
    tree.nodes[1]!.branches[1] = {
      ...secondPush,
      effects: [{ kind: "beta_reward" }],
    };

    expect(runTreeValidator(tree, bundle)).toMatchObject({
      ok: false,
      rule: "push_rewards_must_connect",
    });
  });
});
