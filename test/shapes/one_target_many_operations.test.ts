import { describe, expect, it } from "vitest";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import type { JourneyStage } from "../../src/journey/manifest.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import { createInitialJourneyState, simulateQuestStateForStage } from "../../src/quest/init.js";

async function contextFor(seed: string, stage: JourneyStage) {
  const { content, contentVersion } = await loadContentContext(process.cwd());
  const state = createInitialJourneyState({ seed, content, contentVersion });

  simulateQuestStateForStage({
    state,
    stage,
    drawContext: {
      seed,
      contentVersion,
      rootJourneyIndex: state.generator.rootJourneyIndex,
    },
  });

  return buildJourneyContext({
    projectRoot: process.cwd(),
    content,
    state,
    contentVersion,
  });
}

describe("one_target_many_operations generation", () => {
  it("renders deck-card acquisition as duplication", async () => {
    for (const seed of [
      "otmo-named-card-0",
      "otmo-named-card-1",
      "otmo-named-card-2",
      "otmo-named-card-3",
    ]) {
      const context = await contextFor(seed, "early");
      const manifest = generateNextJourney({
        context,
        forcedShapeId: "one_target_many_operations",
        forcedStage: "early",
      });

      expect(manifest.options.map((option) => option.text)).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/^Gain '[^']+'$/u)]),
      );
    }
  });

  it("does not offer temporary named-card copies", async () => {
    for (const seed of [
      "random:e334de9a-d7b0-4ab6-a194-2087241b1493",
      "otmo-no-temp-copy-0",
      "otmo-no-temp-copy-17",
      "otmo-no-temp-copy-42",
    ]) {
      const context = await contextFor(seed, "early");
      const manifest = generateNextJourney({
        context,
        forcedShapeId: "one_target_many_operations",
        forcedStage: "early",
      });

      expect(manifest.options.map((option) => option.text).join("\n")).not.toMatch(
        /Gain a temporary copy of/u,
      );
    }
  });

  it("does not substitute generated-object menus", async () => {
    for (const seed of [
      "audit:one_target_many_operations:mid:01",
      "audit:one_target_many_operations:mid:07",
      "audit:one_target_many_operations:late:07",
    ]) {
      const stage = seed.includes(":late:") ? "late" : "mid";
      const context = await contextFor(seed, stage);
      const manifest = generateNextJourney({
        context,
        forcedShapeId: "one_target_many_operations",
        forcedStage: stage,
      });

      expect(manifest.generatedObjects).toEqual([]);
      expect(manifest.options.map((option) => option.text).join("\n")).not.toMatch(
        new RegExp(["Transform a chosen", "eligible object"].join(" "), "u"),
      );
      expect(manifest.options.map((option) => option.text).join("\n")).not.toMatch(
        /generated object/u,
      );
    }
  });

  it("keeps zero-cost operation values comparable", async () => {
    for (const [seed, stage] of [
      ["audit:one_target_many_operations:early:09", "early"],
      ["audit:one_target_many_operations:mid:08", "mid"],
      ["audit:one_target_many_operations:mid:09", "mid"],
      ["audit:one_target_many_operations:late:03", "late"],
      ["audit:one_target_many_operations:late:06", "late"],
      ["audit:one_target_many_operations:late:10", "late"],
    ] as const) {
      const context = await contextFor(seed, stage);
      const manifest = generateNextJourney({
        context,
        forcedShapeId: "one_target_many_operations",
        forcedStage: stage,
      });
      const values = manifest.options.map((option) => option.netConvertedEssence);
      const lowest = Math.min(...values);
      const highest = Math.max(...values);

      expect(lowest, seed).toBeGreaterThanOrEqual(stage === "late" ? 60 : stage === "mid" ? 30 : 20);
      expect(highest, seed).toBeLessThanOrEqual(lowest * 1.6);
    }
  });

  it("renders root option labels with explicit nouns and sentence case", async () => {
    const seeds = [
      ["random:e334de9a-d7b0-4ab6-a194-2087241b1493", "early"],
      ["otmo-chosen-starter-237", "mid"],
    ] as const;

    for (const [seed, stage] of seeds) {
      const context = await contextFor(seed, stage);
      const manifest = generateNextJourney({
        context,
        forcedShapeId: "one_target_many_operations",
        forcedStage: stage,
      });

      for (const text of manifest.options.map((option) => option.text)) {
        expect(text).not.toMatch(/^cards/u);
        expect(text).not.toMatch(/\bit\b/u);
      }
    }
  });
});
