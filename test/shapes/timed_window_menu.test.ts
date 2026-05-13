import { describe, expect, it } from "vitest";
// Import the validate barrel first so the shapes registry finishes loading
// before this shape plugin module is evaluated.
import "../../src/journey/validate/index.js";
import { timedWindowMenuPlugin } from "../../src/journey/shapes/timed_window_menu/index.js";
import { makeTestContext } from "../helpers/journey-context.js";

type TimedWindowPayload = {
  readonly kind?: string;
  readonly templateId?: string;
  readonly timingWindow?: {
    readonly scope?: string;
    readonly label?: string;
    readonly duration?: {
      readonly durationKind?: string;
      readonly count?: number;
    };
  };
};

function rewardPayload(option: { readonly effects: readonly unknown[] }): TimedWindowPayload {
  const payload = option.effects[0] as TimedWindowPayload | undefined;

  if (!payload || payload.kind !== "shared_reward_template") {
    throw new Error("expected shared timed-window reward payload");
  }

  return payload;
}

describe("timed_window_menu fill", () => {
  it("produces three shared rewards in one visible timing window", () => {
    const fill = timedWindowMenuPlugin.fill(
      makeTestContext({ seed: "timed-window-menu:shared-window", stage: "mid" }),
    );

    expect(fill.options).toHaveLength(3);

    const windowKeys = new Set<string>();
    const templateIds = new Set<string>();

    for (const option of fill.options) {
      const payload = rewardPayload(option);
      const duration = payload.timingWindow?.duration;

      expect(option.operations).toEqual([]);
      expect(option.costs).toEqual([]);
      expect(option.text).toMatch(/^For the next \d+ (battles|shops|dreamscapes),/u);
      expect(option.effectConvertedEssence).toBeGreaterThan(0);
      expect(option.netConvertedEssence).toBeGreaterThan(0);
      expect(payload.templateId).toEqual(expect.any(String));
      expect(duration?.count).toBeGreaterThanOrEqual(2);

      windowKeys.add(
        `${payload.timingWindow?.scope}:${payload.timingWindow?.label}:${duration?.durationKind}:${duration?.count}`,
      );
      templateIds.add(String(payload.templateId));
    }

    expect(windowKeys.size).toBe(1);
    expect(templateIds.size).toBe(3);
  });

  it("falls back to a viable scope for the QA seed", () => {
    const fill = timedWindowMenuPlugin.fill(
      makeTestContext({ seed: "qa-timed-window-menu", stage: "late" }),
    );

    expect(fill.options).toHaveLength(3);
    expect(fill.options.every((option) => option.netConvertedEssence > 0)).toBe(true);
  });

  it("is deterministic for the same draw context", () => {
    const args = makeTestContext({ seed: "timed-window-menu:deterministic", stage: "early" });

    expect(timedWindowMenuPlugin.fill(args)).toEqual(timedWindowMenuPlugin.fill(args));
  });
});
