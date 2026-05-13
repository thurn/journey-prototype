import { describe, expect, it } from "vitest";
import { validateJourneyManifest } from "../../src/journey/validate/index.js";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import {
  createInitialJourneyState,
  simulateQuestStateForStage,
} from "../../src/quest/init.js";

async function shopRowManifest(seed: string) {
  const { content, contentVersion } = await loadContentContext(process.cwd());
  const state = createInitialJourneyState({
    seed,
    content,
    contentVersion,
  });

  simulateQuestStateForStage({
    state,
    stage: "mid",
    drawContext: {
      seed,
      contentVersion,
      rootJourneyIndex: 0,
    },
  });

  const context = buildJourneyContext({
    projectRoot: process.cwd(),
    content,
    state,
    contentVersion,
  });

  return {
    context,
    manifest: generateNextJourney({
      context,
      forcedShapeId: "shop_row",
      forcedStage: "mid",
    }),
  };
}

describe("shop_row fill", () => {
  it("builds deterministic priced reward rows from shared templates", async () => {
    const first = await shopRowManifest("shop-row-shared");
    const second = await shopRowManifest("shop-row-shared");

    expect(first.manifest.options).toHaveLength(3);
    expect(first.manifest.generatedObjects).toEqual([]);
    expect(first.manifest.options.map((option) => option.text)).toEqual(
      second.manifest.options.map((option) => option.text),
    );
    expect(new Set(first.manifest.options.map((option) => option.text)).size).toBe(3);

    for (const option of first.manifest.options) {
      expect(option.text).toMatch(/^Pay \d+ essence\. /u);
      expect(option.operations).toEqual([]);
      expect(option.costs).toEqual([]);
      expect(option.effects).toEqual([]);
      expect(option.costConvertedEssence).toBeGreaterThan(0);
      expect(option.effectConvertedEssence).toBeGreaterThan(0);
      expect(option.netConvertedEssence).toBe(
        option.effectConvertedEssence - option.costConvertedEssence,
      );
    }

    expect(validateJourneyManifest(first.manifest, first.context)).toEqual({
      ok: true,
    });
  });
});
