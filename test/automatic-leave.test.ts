import { describe, expect, it } from "vitest";
import { loadContentContext } from "../src/commands/shared.js";
import { generateNextJourney } from "../src/journey/generate.js";
import type {
  JourneyManifest,
  JourneyOption,
  JourneyStage,
  JourneyTreeBranch,
} from "../src/journey/manifest.js";
import type { JourneyShapeId } from "../src/journey/shapes.js";
import { buildJourneyContext } from "../src/quest/context.js";
import {
  createInitialJourneyState,
  simulateQuestStateForStage,
} from "../src/quest/init.js";

let contentContextPromise:
  | ReturnType<typeof loadContentContext>
  | undefined;

async function contentContext() {
  contentContextPromise ??= loadContentContext(process.cwd());

  return contentContextPromise;
}

async function forcedManifest(
  shapeId: JourneyShapeId,
  seed: string,
  stage: JourneyStage = "late",
): Promise<JourneyManifest> {
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
    forcedShapeId: shapeId,
    forcedStage: stage,
  });
}

function leaveOptions(manifest: JourneyManifest): JourneyOption[] {
  return manifest.options.filter((option) => option.pickBehavior === "leave");
}

function leaveBranches(manifest: JourneyManifest): JourneyTreeBranch[] {
  return manifest.tree?.nodes.flatMap((node) =>
    node.branches.filter((branch) => branch.terminal?.outcome === "leave")
  ) ?? [];
}

describe("automatic leave options", () => {
  it("adds one canonical leave option to flat generated Journeys", async () => {
    const manifest = await forcedManifest(
      "random_rewards",
      "automatic-leave:flat",
    );

    expect(leaveOptions(manifest)).toEqual([
      expect.objectContaining({
        number: 4,
        text: "Leave.",
        pickBehavior: "leave",
        costs: [],
        effects: [],
        burdens: [],
        netConvertedEssence: 0,
      }),
    ]);
    expect(manifest.options.map((option) => option.number)).toEqual([
      1,
      2,
      3,
      4,
    ]);
  });

  it("normalizes shape-local refusal rows into one canonical leave option", async () => {
    const manifest = await forcedManifest(
      "single_offer",
      "automatic-leave:single-offer",
    );

    expect(leaveOptions(manifest)).toEqual([
      expect.objectContaining({
        number: 2,
        text: "Leave.",
        pickBehavior: "leave",
      }),
    ]);
  });

  it("keeps choose_your_loss mandatory-only", async () => {
    const manifest = await forcedManifest(
      "choose_your_loss",
      "automatic-leave:choose-your-loss",
    );

    expect(leaveOptions(manifest)).toEqual([]);
    expect(manifest.options).toHaveLength(3);
  });

  it("adds canonical leave branches to tree levels that need them", async () => {
    const manifest = await forcedManifest(
      "prize_ladder",
      "automatic-leave:prize-ladder",
    );

    expect(manifest.tree?.nodes).toHaveLength(3);
    expect(leaveBranches(manifest)).toHaveLength(3);

    for (const node of manifest.tree?.nodes ?? []) {
      expect(node.branches.at(-1)).toMatchObject({
        id: `${node.id}-leave`,
        label: "Leave",
        text: "Leave.",
        kind: "player_choice",
        terminal: {
          text: "Leave.",
          outcome: "leave",
          costs: [],
          effects: [],
        },
      });
    }
  });
});
