import { describe, expect, it } from "vitest";
// Import the validate barrel first so the shapes registry finishes loading
// before this shape plugin module is evaluated.
import "../../src/journey/validate/index.js";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import { chooseYourLossPlugin } from "../../src/journey/shapes/choose_your_loss/index.js";
import type { JourneyManifest, JourneyStage } from "../../src/journey/manifest.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import {
  createInitialJourneyState,
  simulateQuestStateForStage,
} from "../../src/quest/init.js";
import { makeTestContext } from "../helpers/journey-context.js";

type SharedCostPayload = {
  readonly kind: "shared_cost_template";
  readonly templateId: string;
  readonly params: unknown;
  readonly text: string;
  readonly convertedEssence: number;
  readonly family: string;
};

function sharedCostPayload(option: { readonly costs: readonly unknown[] }): SharedCostPayload {
  const payload = option.costs[0] as SharedCostPayload | undefined;

  if (!payload || payload.kind !== "shared_cost_template") {
    throw new Error("expected shared cost payload");
  }

  return payload;
}

async function chooseYourLossManifest(
  seed: string,
  stage: JourneyStage,
): Promise<JourneyManifest> {
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
    forcedShapeId: "choose_your_loss",
    forcedStage: stage,
  });
}

describe("choose_your_loss fill", () => {
  it("produces three shared-cost loss alternatives", () => {
    const fill = chooseYourLossPlugin.fill(
      makeTestContext({ seed: "choose-loss:shared-costs", stage: "mid" }),
    );

    expect(fill.options).toHaveLength(3);

    const templateIds = new Set<string>();
    const families = new Set<string>();

    for (const option of fill.options) {
      const payload = sharedCostPayload(option);

      expect(option.operations).toEqual([]);
      expect(option.effects).toEqual([]);
      expect(option.burdens).toEqual([]);
      expect(option.text).not.toContain("[LOCKED]");
      expect(payload.convertedEssence).toBeGreaterThan(0);
      expect(option.costConvertedEssence).toBe(payload.convertedEssence);
      expect(option.effectConvertedEssence).toBe(0);
      expect(option.netConvertedEssence).toBe(-payload.convertedEssence);
      expect(option.pickBehavior).toBe("record_and_generate_next");
      templateIds.add(payload.templateId);
      families.add(payload.family);
    }

    expect(templateIds.size).toBe(3);
    expect(families.size).toBeGreaterThanOrEqual(2);
  });

  it("is deterministic for the same draw context", () => {
    const args = makeTestContext({ seed: "choose-loss:deterministic", stage: "late" });
    const first = chooseYourLossPlugin.fill(args);
    const second = chooseYourLossPlugin.fill(args);

    expect(first).toEqual(second);
  });

  it("keeps audit-seed losses in comparable value bands", () => {
    const cases: Array<readonly [string, JourneyStage]> = [
      ["audit:choose_your_loss:early:01", "early"],
      ["audit:choose_your_loss:early:02", "early"],
      ["audit:choose_your_loss:mid:01", "mid"],
      ["audit:choose_your_loss:mid:02", "mid"],
      ["audit:choose_your_loss:late:01", "late"],
      ["audit:choose_your_loss:late:02", "late"],
    ];

    for (const [seed, stage] of cases) {
      const fill = chooseYourLossPlugin.fill(makeTestContext({ seed, stage }));
      const magnitudes = fill.options.map((option) =>
        Math.abs(option.netConvertedEssence)
      );
      const lowest = Math.min(...magnitudes);
      const highest = Math.max(...magnitudes);

      expect(lowest, seed).toBeGreaterThanOrEqual(40);
      expect(highest / lowest, seed).toBeLessThanOrEqual(3.5);
    }
  });

  it("generates three visible material losses for the audit seed grid", async () => {
    const excludedTemplateIds = new Set([
      "pay_max_essence",
      "purge_all_duplicate_cards",
      "remove_transfiguration_from_card",
      "remove_transfigurations_from_random_predicate",
    ]);
    const stages: readonly JourneyStage[] = ["early", "mid", "late"];

    for (const stage of stages) {
      for (let index = 1; index <= 10; index += 1) {
        const seed = `audit:choose_your_loss:${stage}:${String(index).padStart(2, "0")}`;
        const manifest = await chooseYourLossManifest(seed, stage);

        expect(manifest.options, seed).toHaveLength(3);

        for (const option of manifest.options) {
          const payload = sharedCostPayload(option);

          expect(excludedTemplateIds.has(payload.templateId), seed).toBe(false);
          expect(option.text, seed).not.toBe("Lose maximum essence.");
          expect(option.text, seed).not.toContain("transfiguration");
          expect(option.text, seed).not.toBe("Purge all duplicate cards from your deck.");

          if (payload.templateId === "purge_named_dreamsign") {
            expect(option.text, seed).toMatch(/^Purge Dreamsign '.+'\.$/u);
          }
        }
      }
    }
  });
});
