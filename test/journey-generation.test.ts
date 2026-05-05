import { describe, expect, it } from "vitest";
import { loadContent } from "../src/content/loadToml.js";
import { buildConservativeJourneyForShape } from "../src/journey/fillers.js";
import { advanceSequenceJourney, generateNextJourney } from "../src/journey/generate.js";
import type { JourneyManifest } from "../src/journey/manifest.js";
import { repairOrFallbackJourney } from "../src/journey/repair.js";
import { JOURNEY_SHAPES, type JourneyShapeId } from "../src/journey/shapes.js";
import { validateJourneyManifest } from "../src/journey/validate.js";
import { buildJourneyContext } from "../src/quest/context.js";
import { createInitialJourneyState } from "../src/quest/init.js";
import {
  deterministicTieJitter,
  drawInt,
  shuffleDeterministic,
  weightedChoice,
  type DrawContext,
} from "../src/util/rng.js";
import { stableStringify } from "../src/util/stableJson.js";

async function context() {
  const content = await loadContent(process.cwd());
  const contentVersion = "test-content-version";
  const state = createInitialJourneyState({
    seed: "default",
    content,
    contentVersion,
  });

  return buildJourneyContext({
    projectRoot: process.cwd(),
    content,
    state,
    contentVersion,
  });
}

async function contextWithEmptyDreamsignPool(seed = "s17") {
  const content = await loadContent(process.cwd());
  const contentVersion = "test-content-version";
  const state = createInitialJourneyState({
    seed,
    content,
    contentVersion,
  });

  state.quest.dreamsignPoolIds = [];
  state.quest.dreamsignPoolSummary = {
    tidalPoolCount: 0,
    neutralCatalogCount: 0,
  };

  return buildJourneyContext({
    projectRoot: process.cwd(),
    content,
    state,
    contentVersion,
  });
}

function fillForShape(shapeId: JourneyShapeId, journeyContext: Awaited<ReturnType<typeof context>>) {
  return buildConservativeJourneyForShape({
    context: journeyContext,
    drawContext: {
      seed: journeyContext.state.quest.seed,
      contentVersion: journeyContext.contentVersion,
      rootJourneyIndex: journeyContext.state.generator.rootJourneyIndex,
    },
    journeyId: "J-000001",
    shapeId,
    stage: "early",
    selectedTags: ["cleanup", "dreamsign", "reward"],
    shapeScores: JOURNEY_SHAPES.map((shape, index) => ({
      shapeId: shape.id,
      score: 100 - index,
    })),
  });
}

describe("deterministic RNG helpers", () => {
  it("draws stable labeled values without mutating inputs", () => {
    const drawContext: DrawContext = {
      seed: "seed-a",
      contentVersion: "content-a",
      rootJourneyIndex: 1,
    };
    const items = ["a", "b", "c", "d"];

    expect(drawInt(drawContext, "amount", 1, 10)).toBe(
      drawInt(drawContext, "amount", 1, 10),
    );
    expect(drawInt(drawContext, "amount", 1, 10)).not.toBe(
      drawInt({ ...drawContext, rootJourneyIndex: 2 }, "amount", 1, 10),
    );
    expect(weightedChoice(drawContext, "choice", [
      { item: "low", weight: 1 },
      { item: "high", weight: 10 },
    ])).toBe(weightedChoice(drawContext, "choice", [
      { item: "low", weight: 1 },
      { item: "high", weight: 10 },
    ]));
    expect(shuffleDeterministic(drawContext, "shuffle", items)).toEqual(
      shuffleDeterministic(drawContext, "shuffle", items),
    );
    expect(items).toEqual(["a", "b", "c", "d"]);
    expect(deterministicTieJitter(drawContext, "tie", 2)).toBeGreaterThanOrEqual(-2);
    expect(deterministicTieJitter(drawContext, "tie", 2)).toBeLessThanOrEqual(2);
  });
});

describe("generateNextJourney", () => {
  it("creates J-000001 and deterministic byte-stable manifest data", async () => {
    const journeyContext = await context();
    const first = generateNextJourney({ context: journeyContext });
    const second = generateNextJourney({ context: journeyContext });

    expect(first.journeyId).toBe("J-000001");
    expect(stableStringify(first)).toBe(stableStringify(second));
    expect(first.debug.optionValues).toHaveLength(first.options.length);
    expect(validateJourneyManifest(first, journeyContext)).toEqual({ ok: true });
  });

  it("keeps generated references resolvable and normal text mechanical", async () => {
    const journeyContext = await context();
    const manifest = generateNextJourney({ context: journeyContext });

    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({ ok: true });
    for (const option of manifest.options) {
      expect(option.text).not.toContain("Shape:");
      expect(option.text).not.toContain("Dream Journey");
    }
  });

  it("has a legal conservative filler path for every canonical shape", async () => {
    const journeyContext = await context();

    for (const shape of JOURNEY_SHAPES) {
      const manifest = fillForShape(shape.id, journeyContext);

      expect(validateJourneyManifest(manifest, journeyContext), shape.id).toEqual({
        ok: true,
      });
    }
  });

  it("does not throw with an empty Dreamsign pool", async () => {
    const journeyContext = await contextWithEmptyDreamsignPool();
    const manifest = generateNextJourney({ context: journeyContext });

    expect(validateJourneyManifest(manifest, journeyContext)).toEqual({ ok: true });

    const heterogeneous = fillForShape("heterogeneous_pair", journeyContext);

    expect(validateJourneyManifest(heterogeneous, journeyContext)).toEqual({ ok: true });
  });

  it("advances a sequential manifest without changing the Journey identity", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("take_up_to_n", journeyContext);
    const result = advanceSequenceJourney({
      context: journeyContext,
      manifest,
      selectedOptionNumber: 1,
    });

    expect(result.kind).toBe("advanced");
    if (result.kind !== "advanced") {
      throw new Error("expected an advanced sequence result");
    }

    expect(result.manifest.journeyId).toBe(manifest.journeyId);
    expect(result.manifest.rootJourneyIndex).toBe(manifest.rootJourneyIndex);
    expect(result.manifest.sequence).toMatchObject({ step: 2, status: "active" });
    expect(result.manifest.options).toEqual(manifest.precommitted.sequenceMenus?.step2);
    expect(validateJourneyManifest(result.manifest, journeyContext)).toEqual({ ok: true });
  });

  it("exposes terminal sequence status for next-root command transitions", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("escalating_search", journeyContext);
    const result = advanceSequenceJourney({
      context: journeyContext,
      manifest,
      selectedOptionNumber: 2,
    });

    expect(result).toMatchObject({
      kind: "left",
      journeyId: manifest.journeyId,
      rootJourneyIndex: manifest.rootJourneyIndex,
      sequence: { step: 1, status: "left" },
      shouldGenerateNextRoot: true,
    });
  });

  it("stores byte-stable pending data for an advanced sequence step", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("push_your_luck", journeyContext);
    const result = advanceSequenceJourney({
      context: journeyContext,
      manifest,
      selectedOptionNumber: 1,
    });
    const repeated = advanceSequenceJourney({
      context: journeyContext,
      manifest,
      selectedOptionNumber: 1,
    });

    expect(result.kind).toBe("advanced");
    expect(repeated.kind).toBe("advanced");
    if (result.kind !== "advanced" || repeated.kind !== "advanced") {
      throw new Error("expected an advanced sequence result");
    }

    expect(stableStringify(result.manifest)).toBe(stableStringify(repeated.manifest));
    expect(result.manifest.precommitted.random).toEqual([
      { bounded: true, kind: "visible_reward", outcome: { amount: 50, kind: "gain_essence" }, step: 1 },
      { bounded: true, kind: "visible_downside", outcome: { baneName: "Nightmare", count: 1, kind: "bane_gain" }, step: 2 },
    ]);
  });
});

describe("validateJourneyManifest", () => {
  it("rejects unresolved named card and Dreamsign references", async () => {
    const journeyContext = await context();
    const manifest = generateNextJourney({ context: journeyContext });
    const invalid: JourneyManifest = {
      ...manifest,
      references: {
        ...manifest.references,
        cardIds: [...manifest.references.cardIds, "not-a-real-card"],
        dreamsignIds: [...manifest.references.dreamsignIds, "not-a-real-dreamsign"],
      },
    };

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "unresolved_reference",
    });
  });

  it("rejects malformed option entries instead of throwing", async () => {
    const journeyContext = await contextWithEmptyDreamsignPool();
    const manifest = fillForShape("heterogeneous_pair", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      options: [manifest.options[0]!, undefined as unknown as JourneyManifest["options"][number]],
    };

    expect(() => validateJourneyManifest(invalid, journeyContext)).not.toThrow();
    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "invalid_option",
    });
  });

  it("requires paired-return precommitted metadata", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("paired_return", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      precommitted: {
        delayed: manifest.precommitted.delayed,
      },
    };

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "missing_precommitted_outcomes",
    });
  });

  it("requires random outcomes to be precommitted", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("single_random_outcome", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      precommitted: {},
    };

    expect(manifest.precommitted.random).toHaveLength(1);
    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "missing_precommitted_outcomes",
    });
  });

  it("requires delayed hook outcomes to be precommitted", async () => {
    const journeyContext = await context();
    const manifest = fillForShape("reward_after_trigger", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      precommitted: {},
    };

    expect(manifest.precommitted.delayed).toHaveLength(1);
    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "missing_precommitted_outcomes",
    });
  });

  it("keeps route edits manifest-only and requires committed route metadata", async () => {
    const journeyContext = await context();
    const routeBefore = stableStringify(journeyContext.state.quest.route);
    const manifest = fillForShape("alter_dreamscapes", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      precommitted: {},
    };

    expect(stableStringify(journeyContext.state.quest.route)).toBe(routeBefore);
    expect(manifest.options.flatMap((option) => option.routeEffects)).toHaveLength(2);
    expect(manifest.precommitted.routeEdits).toEqual([
      {
        fromSite: "Shop",
        kind: "current_route_replacement",
        source: "simulated_manifest_only",
        timing: "current dreamscape",
        toSite: "Purge",
      },
      {
        fromSite: "Shop",
        kind: "future_route_replacement",
        source: "simulated_manifest_only",
        timing: "next dreamscape",
        toSite: "Purge",
      },
    ]);
    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "missing_precommitted_outcomes",
    });
  });

  it.each([
    "Journey name: The Glass Orchard. Gain 45 essence.",
    "Event name: The Glass Orchard. Gain 45 essence.",
    "The Glass Orchard: Gain 45 essence.",
  ])("rejects normal output text requiring narrative names: %s", async (text) => {
    const journeyContext = await context();
    const manifest = fillForShape("single_reward", journeyContext);
    const invalid: JourneyManifest = {
      ...manifest,
      options: manifest.options.map((option) => ({ ...option, text })),
    };

    expect(validateJourneyManifest(invalid, journeyContext)).toMatchObject({
      ok: false,
      rule: "normal_output_narrative_name",
    });
  });
});

describe("repairOrFallbackJourney", () => {
  it("records deterministic repairs when validation fails", async () => {
    const journeyContext = await context();
    const base = fillForShape("single_offer", journeyContext);
    const invalid: JourneyManifest = {
      ...base,
      options: base.options.map((option) =>
        option.number === 1
          ? {
              ...option,
              costs: [{ kind: "essence", amount: 9999, timing: "immediate" }],
              costConvertedEssence: 9999,
              netConvertedEssence:
                option.effectConvertedEssence -
                9999 +
                option.burdenConvertedEssence +
                option.uncertaintyConvertedEssence,
            }
          : option,
      ),
    };
    const failed = validateJourneyManifest(invalid, journeyContext);

    expect(failed).toMatchObject({
      ok: false,
      rule: "unpayable_immediate_cost",
    });

    const repaired = repairOrFallbackJourney(invalid, journeyContext, failed);
    const repairedAgain = repairOrFallbackJourney(invalid, journeyContext, failed);

    expect(validateJourneyManifest(repaired, journeyContext)).toEqual({ ok: true });
    expect(stableStringify(repaired)).toBe(stableStringify(repairedAgain));
    expect(repaired.debug.repairs.length).toBeGreaterThan(0);
    expect(repaired.debug.repairs.at(-1)).toMatchObject({
      failedRule: "unpayable_immediate_cost",
      result: "repaired",
    });
  });
});
