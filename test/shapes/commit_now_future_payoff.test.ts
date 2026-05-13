import { describe, expect, it } from "vitest";
// Import the validate barrel first so the shapes registry finishes loading
// before this shape plugin module is evaluated.
import "../../src/journey/validate/index.js";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import type { JourneyManifest, JourneyStage } from "../../src/journey/manifest.js";
import { commitNowFuturePayoffPlugin } from "../../src/journey/shapes/commit_now_future_payoff/index.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import {
  createInitialJourneyState,
  simulateQuestStateForStage,
} from "../../src/quest/init.js";
import { makeTestContext } from "../helpers/journey-context.js";

type SharedTemplatePayload = {
  readonly kind?: string;
  readonly templateId?: string;
  readonly timing?: string;
};

async function manifestFor(seed: string, stage: JourneyStage): Promise<JourneyManifest> {
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
    forcedShapeId: "commit_now_future_payoff",
    forcedStage: stage,
  });
}

describe("commit_now_future_payoff fill", () => {
  it("pairs immediate commitments with visible delayed payoffs", () => {
    const args = makeTestContext({ seed: "commit-now-future-payoff:topology" });
    const fill = commitNowFuturePayoffPlugin.fill(args);

    expect(fill.options).toHaveLength(3);
    expect(fill.precommitted.delayed).toHaveLength(3);

    for (const option of fill.options) {
      expect(option.text).toMatch(/^Commit now:/u);
      expect(option.operations).toEqual([]);
      expect(option.triggers).toEqual([]);
      expect(option.costs[0]).toMatchObject({
        kind: "shared_cost_template",
        timing: "immediate",
      });
      expect(option.netConvertedEssence).toBeGreaterThan(0);
      expect(option.effectConvertedEssence).toBeGreaterThan(
        option.costConvertedEssence,
      );
    }
  });

  it("stores one delayed shared reward hook per option", () => {
    const args = makeTestContext({ seed: "commit-now-future-payoff:hooks" });
    const fill = commitNowFuturePayoffPlugin.fill(args);

    for (const [index, delayed] of (fill.precommitted.delayed ?? []).entries()) {
      const hook = delayed as Record<string, unknown>;
      const rewards = hook.reward as readonly SharedTemplatePayload[] | undefined;
      const costs = hook.cost as readonly SharedTemplatePayload[] | undefined;

      expect(hook).toMatchObject({
        kind: "delayed_hook_contract",
        sourceShapeId: "commit_now_future_payoff",
        optionNumber: index + 1,
        hookBudgetCost: 1,
      });
      expect(rewards?.[0]).toMatchObject({
        kind: "shared_reward_template",
        timing: "delayed",
      });
      expect(costs?.[0]).toMatchObject({
        kind: "shared_cost_template",
        timing: "immediate",
      });
      expect(typeof rewards?.[0]?.templateId).toBe("string");
      expect(typeof costs?.[0]?.templateId).toBe("string");
    }
  });

  it("is deterministic for the same draw context", () => {
    const args = makeTestContext({ seed: "commit-now-future-payoff:deterministic" });

    expect(commitNowFuturePayoffPlugin.fill(args)).toEqual(
      commitNowFuturePayoffPlugin.fill(args),
    );
  });

  it("renders a visible payoff window for every commitment row", async () => {
    const manifest = await manifestFor("audit:commit_now_future_payoff:early:01", "early");
    const payoffWindow = /(?:If you win within the next 2 battles|After two battles|At the next dreamscape),/u;

    expect(manifest.options).toHaveLength(3);
    for (const option of manifest.options) {
      expect(option.text).toMatch(payoffWindow);
    }
  });

  it("keeps multi-action delayed rewards under one timing clause", async () => {
    const fill = commitNowFuturePayoffPlugin.fill(
      makeTestContext({ seed: "commit-now-future-payoff:multi:4" }),
    );
    const multiAction = fill.options.find((option) => option.text.includes(", and "));

    expect(multiAction).toBeDefined();
    expect(multiAction!.text).toMatch(/^Commit now: .+ At the next dreamscape, .+, and .+\.$/u);
    expect(multiAction!.text.split("At the next dreamscape, ")[1]!.slice(0, -1))
      .not.toContain(".");
  });

  it("excludes target-dependent transfiguration-removal commitments", async () => {
    const excludedTemplateIds = new Set([
      "pay_max_essence",
      "purge_all_duplicate_cards",
      "remove_transfiguration_from_card",
      "remove_transfigurations_from_random_predicate",
    ]);
    const cases: Array<{ readonly seed: string; readonly stage: JourneyStage }> = [
      { seed: "audit:commit_now_future_payoff:early:03", stage: "early" },
      { seed: "audit:commit_now_future_payoff:late:06", stage: "late" },
      { seed: "audit:commit_now_future_payoff:mid:05", stage: "mid" },
    ];

    for (const { seed, stage } of cases) {
      const manifest = await manifestFor(seed, stage);
      const costTemplateIds = manifest.options.flatMap((option) =>
        option.costs.map((cost) => (cost as { readonly templateId?: string }).templateId),
      );

      for (const templateId of excludedTemplateIds) {
        expect(costTemplateIds, seed).not.toContain(templateId);
      }

      expect(manifest.options.map((option) => option.text).join("\n")).not.toMatch(
        /remove the transfiguration/u,
      );
    }
  });

  it("keeps cited audit offer net values within a tighter band", async () => {
    const cases: Array<{ readonly seed: string; readonly stage: JourneyStage }> = [
      { seed: "audit:commit_now_future_payoff:early:02", stage: "early" },
      { seed: "audit:commit_now_future_payoff:late:10", stage: "late" },
    ];

    for (const { seed, stage } of cases) {
      const manifest = await manifestFor(seed, stage);
      const nets = manifest.options.map((option) => option.netConvertedEssence);
      const spread = Math.max(...nets) - Math.min(...nets);

      expect(spread).toBeLessThanOrEqual(stage === "early" ? 70 : 115);
    }
  });
});
