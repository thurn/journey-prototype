import { describe, expect, it } from "vitest";
// Import the validate barrel first so the shapes registry finishes loading
// before this shape plugin module is evaluated.
import "../../src/journey/validate/index.js";
import { nowVsLaterPlugin } from "../../src/journey/shapes/now_vs_later/index.js";
import { makeTestContext } from "../helpers/journey-context.js";

describe("now_vs_later fill", () => {
  it("produces one immediate option and one larger delayed option", () => {
    const args = makeTestContext({ seed: "now-vs-later:topology" });
    const fill = nowVsLaterPlugin.fill(args);

    expect(fill.options).toHaveLength(2);
    expect(fill.options[0]!.text).toMatch(/\bnow\b/u);
    expect(fill.options[1]!.text).toMatch(/\bWait\b/u);
    expect(fill.options[1]!.netConvertedEssence).toBeGreaterThan(
      fill.options[0]!.netConvertedEssence,
    );
    expect(fill.precommitted.delayed).toHaveLength(1);
  });

  it("is deterministic for the same draw context", () => {
    const args = makeTestContext({ seed: "now-vs-later:deterministic" });
    const first = nowVsLaterPlugin.fill(args);
    const second = nowVsLaterPlugin.fill(args);

    expect(first).toEqual(second);
  });

  it("stores the delayed shared reward in hook metadata", () => {
    const args = makeTestContext({ seed: "now-vs-later:precommit" });
    const fill = nowVsLaterPlugin.fill(args);
    const delayed = fill.precommitted.delayed?.[0] as
      | Record<string, unknown>
      | undefined;
    const rewards = delayed?.reward as readonly Record<string, unknown>[] | undefined;

    expect(delayed).toMatchObject({
      kind: "delayed_hook_contract",
      sourceShapeId: "now_vs_later",
      optionNumber: 2,
      hookBudgetCost: 1,
    });
    expect(rewards?.[0]).toMatchObject({
      kind: "shared_reward_template",
      timing: "delayed",
    });
    expect(typeof rewards?.[0]?.templateId).toBe("string");
  });
});
