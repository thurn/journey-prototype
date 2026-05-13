import { describe, expect, it } from "vitest";
// Import the validate barrel first so the shapes registry finishes loading
// before this shape plugin module is evaluated.
import "../../src/journey/validate/index.js";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import type { JourneyManifest, JourneyStage } from "../../src/journey/manifest.js";
import { timedWindowMenuPlugin } from "../../src/journey/shapes/timed_window_menu/index.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import {
  createInitialJourneyState,
  simulateQuestStateForStage,
} from "../../src/quest/init.js";
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
    forcedShapeId: "timed_window_menu",
    forcedStage: stage,
  });
}

function fillForScope(scope: string, seed: string = `timed-window-menu:${scope}`) {
  return timedWindowMenuPlugin.fill({
    ...makeTestContext({ seed, stage: "mid" }),
    shapeArgs: { windowScope: scope },
  });
}

function netSpreadRatio(manifest: JourneyManifest): number {
  const values = manifest.options
    .map((option) => option.netConvertedEssence)
    .filter((value) => value > 0);

  return Math.max(...values) / Math.max(1, Math.min(...values));
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
      expect(option.text).not.toMatch(
        /^For the next (\d+) (battles|shops|dreamscapes), .*for the next \1 \2/u,
      );
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

  it("uses explicit route-window targets", () => {
    const fill = fillForScope("route");

    expect(fill.options).toHaveLength(3);
    for (const option of fill.options) {
      expect(option.text).not.toMatch(/\bif possible\b|\bone route\b/u);
      expect(option.text).toMatch(
        /generated route with an open site slot|first eligible upcoming dreamscape|site appearance/u,
      );
    }
  });

  it("varies shop-window rows across deterministic seeds", () => {
    const optionSets = new Set(
      [
        "audit:timed_window_menu:early:03",
        "audit:timed_window_menu:early:05",
        "audit:timed_window_menu:late:01",
        "audit:timed_window_menu:late:05",
      ].map((seed) =>
        fillForScope("shop", seed)
          .options.map((option) => option.text)
          .sort()
          .join("\n")
      ),
    );

    expect(optionSets.size).toBeGreaterThan(1);
  });

  it("keeps audited seeds free of repeated window wording and solved-value spreads", async () => {
    const stages: readonly JourneyStage[] = ["early", "mid", "late"];

    for (const stage of stages) {
      for (let index = 1; index <= 10; index += 1) {
        const seed = `audit:timed_window_menu:${stage}:${String(index).padStart(2, "0")}`;
        const manifest = await manifestFor(seed, stage);

        expect(manifest.options).toHaveLength(3);
        expect(netSpreadRatio(manifest), seed).toBeLessThanOrEqual(2.35);
        for (const option of manifest.options) {
          expect(option.text, seed).not.toMatch(
            /^For the next (\d+) (battles|shops|dreamscapes), .*for the next \1 \2/u,
          );
          expect(option.text, seed).not.toContain("Gain a random Dreamsign for the next");
        }
      }
    }
  });
});
