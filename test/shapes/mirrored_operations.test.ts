import { describe, expect, it } from "vitest";
// Import the validate barrel first so the shapes registry finishes loading
// before our shape plugin module is evaluated. This avoids a known circular
// import (shared.ts -> validate/tree.ts -> shapes.ts -> registry -> shapes/*/index.ts -> shared.ts).
import { validateJourneyManifest } from "../../src/journey/validate/index.js";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import { mirroredOperationsPlugin } from "../../src/journey/shapes/mirrored_operations/index.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import { createInitialJourneyState, simulateQuestStateForStage } from "../../src/quest/init.js";
import type { JourneyStage } from "../../src/journey/manifest.js";

async function realContext(seed: string, stage: JourneyStage = "early") {
  const { content, contentVersion } = await loadContentContext(process.cwd());
  const state = createInitialJourneyState({
    seed,
    content,
    contentVersion,
  });
  simulateQuestStateForStage({
    state,
    stage,
    drawContext: {
      seed,
      contentVersion,
      rootJourneyIndex: 0,
    },
  });

  return buildJourneyContext({
    projectRoot: process.cwd(),
    content,
    state,
    contentVersion,
  });
}

describe("mirrored_operations fill", () => {
  it("uses the validation-bypassing plugin shape", () => {
    expect(mirroredOperationsPlugin.definition).toMatchObject({
      id: "mirrored_operations",
      rootOptionCount: { min: 3, max: 3 },
      bypassStandardValidation: true,
      validationRules: [
        "manifest_schema_version",
        "manifest_version_metadata",
        "journey_id_format",
        "root_option_count_within_bounds",
      ],
      repairPreferences: [],
    });
  });

  it("is deterministic for the same draw context", async () => {
    const context = await realContext("mo-det");
    const drawContext = {
      seed: context.state.quest.seed,
      contentVersion: context.contentVersion,
      rootJourneyIndex: 0,
    };
    const first = mirroredOperationsPlugin.fill({
      context,
      drawContext,
      stage: "early",
    });
    const second = mirroredOperationsPlugin.fill({
      context,
      drawContext,
      stage: "early",
    });

    expect(first.options.map((option) => option.text)).toEqual(
      second.options.map((option) => option.text),
    );
  });

  it("produces three text-and-value options without typed operations", async () => {
    const context = await realContext("mo-options");
    const manifest = generateNextJourney({
      context,
      forcedShapeId: "mirrored_operations",
      forcedStage: "early",
    });

    expect(manifest.options).toHaveLength(3);
    for (const option of manifest.options) {
      expect(option.text.length).toBeGreaterThan(0);
      expect(option.operations).toEqual([]);
      expect(option.costs).toEqual([]);
      expect(option.effects).toEqual([]);
      expect(option.effectConvertedEssence).toBeGreaterThan(0);
    }
    expect(validateJourneyManifest(manifest, context)).toEqual({ ok: true });
  });
});
