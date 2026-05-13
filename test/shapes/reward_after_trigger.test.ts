import { describe, expect, it } from "vitest";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import type { JourneyStage } from "../../src/journey/manifest.js";
import { getShapePlugin } from "../../src/journey/shapes.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import {
  createInitialJourneyState,
  simulateQuestStateForStage,
} from "../../src/quest/init.js";

const rewardAfterTriggerPlugin = getShapePlugin("reward_after_trigger");
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

async function forcedRewardAfterTriggerManifest(
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
    forcedShapeId: "reward_after_trigger",
    forcedStage: stage,
  });
}

describe("reward_after_trigger fill", () => {
  it("uses a shape-local delayed-hook contract", () => {
    expect(rewardAfterTriggerPlugin.definition).toMatchObject({
      topology: "delayed_hook",
      rootOptionCount: { min: 2, max: 2 },
      supportedTags: ["trigger", "delayed", "reward", "promise"],
      validationRules: expect.arrayContaining([
        "future_reward_has_visible_trigger",
        "future_reward_is_stored_not_applied",
      ]),
    });
    expect(rewardAfterTriggerPlugin.fill).toEqual(expect.any(Function));
  });

  it("generates distinct valid hooks for every audited stage seed", async () => {
    for (const stage of auditStages) {
      for (const seedNumber of auditSeedNumbers) {
        const seed = `audit:reward_after_trigger:${stage}:${seedNumber}`;
        const manifest = await forcedRewardAfterTriggerManifest(seed, stage);

        expect(manifest.shapeId, seed).toBe("reward_after_trigger");
        expect(manifest.options, seed).toHaveLength(2);
        expect(manifest.precommitted.delayed, seed).toHaveLength(2);
        expect(new Set(manifest.options.map((option) => option.text)).size, seed)
          .toBe(2);

        for (const option of manifest.options) {
          expect(option.triggers, seed).toHaveLength(1);
          expect(option.text, seed).not.toMatch(/\s,|,\s*,/u);
          expect(option.text, seed).not.toMatch(/\bundefined\b/i);
        }
      }
    }
  });

  it("is deterministic for a fixed seed and stage", async () => {
    const first = await forcedRewardAfterTriggerManifest(
      "migration:reward_after_trigger:late:deterministic",
      "late",
    );
    const second = await forcedRewardAfterTriggerManifest(
      "migration:reward_after_trigger:late:deterministic",
      "late",
    );

    expect(second.options).toEqual(first.options);
    expect(second.precommitted).toEqual(first.precommitted);
  });
});
