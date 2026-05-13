import { describe, expect, it } from "vitest";
// Import the validate barrel first so the shapes registry finishes loading
// before this shape plugin module is evaluated.
import "../../src/journey/validate/index.js";
import { commitNowFuturePayoffPlugin } from "../../src/journey/shapes/commit_now_future_payoff/index.js";
import { makeTestContext } from "../helpers/journey-context.js";

type SharedTemplatePayload = {
  readonly kind?: string;
  readonly templateId?: string;
  readonly timing?: string;
};

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
});
