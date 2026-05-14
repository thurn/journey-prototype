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
const legacyRewardIds = new Set(["gain_essence", "gain_omens"]);

type DelayedHook = {
  readonly triggerSelector?: {
    readonly label?: string;
  };
  readonly reward?: readonly [{
    readonly templateId?: string;
    readonly text?: string;
    readonly convertedEssence?: number;
  }];
};

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
    const rewardTemplateIds = new Set<string>();
    const triggerLabels = new Set<string>();

    for (const stage of auditStages) {
      for (const seedNumber of auditSeedNumbers) {
        const seed = `audit:reward_after_trigger:${stage}:${seedNumber}`;
        const manifest = await forcedRewardAfterTriggerManifest(seed, stage);
        const options = manifest.options.filter((option) =>
          option.pickBehavior !== "leave"
        );
        const hooks = manifest.precommitted.delayed as readonly DelayedHook[];

        expect(manifest.shapeId, seed).toBe("reward_after_trigger");
        expect(options, seed).toHaveLength(2);
        expect(hooks, seed).toHaveLength(2);
        expect(new Set(options.map((option) => option.text)).size, seed)
          .toBe(2);

        for (const option of options) {
          expect(option.triggers, seed).toHaveLength(1);
          expect(option.text, seed).toMatch(/^(After|At|When)\b/u);
          expect(option.text, seed).toMatch(/,\s+[a-z0-9']/u);
          expect(option.text, seed).toMatch(/\.$/u);
          expect(option.text.slice(0, -1), seed).not.toContain(".");
          expect(option.text, seed).not.toMatch(/\s,|,\s*,/u);
          expect(option.text, seed).not.toMatch(/\bundefined\b/i);
        }

        for (const hook of hooks) {
          const reward = hook.reward?.[0];
          expect(reward?.templateId, seed).toEqual(expect.any(String));
          expect(reward?.text, seed).toEqual(expect.any(String));
          expect(reward?.convertedEssence, seed).toEqual(expect.any(Number));

          rewardTemplateIds.add(reward!.templateId!);
          triggerLabels.add(hook.triggerSelector!.label!);
        }
      }
    }

    expect(rewardTemplateIds.size).toBeGreaterThanOrEqual(6);
    expect([...rewardTemplateIds].some((id) => !legacyRewardIds.has(id))).toBe(true);
    expect(triggerLabels.size).toBeGreaterThanOrEqual(6);
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
