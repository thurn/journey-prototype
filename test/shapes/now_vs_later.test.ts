import { describe, expect, it } from "vitest";
// Import the validate barrel first so the shapes registry finishes loading
// before this shape plugin module is evaluated.
import "../../src/journey/validate/index.js";
import { loadContent } from "../../src/content/loadToml.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import type { JourneyManifest, JourneyStage } from "../../src/journey/manifest.js";
import { nowVsLaterPlugin } from "../../src/journey/shapes/now_vs_later/index.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import {
  createInitialJourneyState,
  simulateQuestStateForStage,
} from "../../src/quest/init.js";
import { makeTestContext } from "../helpers/journey-context.js";

const CONTENT_VERSION = "test-content-version";

const BROAD_DELAYED_REWARD_IDS = new Set([
  "apply_named_transfiguration_to_all_predicate_cards",
]);

type SharedRewardPayload = {
  readonly templateId?: string;
  readonly subIds?: readonly string[];
  readonly params?: { readonly subIds?: readonly string[] };
  readonly text?: string;
};

async function generatedNowVsLater(
  seed: string,
  stage: JourneyStage,
  rootJourneyIndex: number,
): Promise<JourneyManifest> {
  const content = await loadContent(process.cwd());
  const state = createInitialJourneyState({
    seed,
    content,
    contentVersion: CONTENT_VERSION,
  });
  state.generator.rootJourneyIndex = rootJourneyIndex;
  simulateQuestStateForStage({
    state,
    stage,
    drawContext: {
      seed,
      contentVersion: CONTENT_VERSION,
      rootJourneyIndex,
    },
  });
  const context = buildJourneyContext({
    projectRoot: process.cwd(),
    content,
    state,
    contentVersion: CONTENT_VERSION,
  });

  return generateNextJourney({
    context,
    forcedShapeId: "now_vs_later",
    forcedStage: stage,
  });
}

function delayedRewardPayload(manifest: JourneyManifest): SharedRewardPayload {
  const delayed = manifest.precommitted.delayed?.[0] as
    | { readonly reward?: readonly SharedRewardPayload[] }
    | undefined;
  const reward = delayed?.reward?.[0];

  if (!reward) {
    throw new Error("expected now_vs_later delayed reward payload");
  }

  return reward;
}

function consumedRewardIds(payload: SharedRewardPayload): readonly string[] {
  return [
    ...(payload.templateId === undefined ? [] : [payload.templateId]),
    ...(payload.subIds ?? []),
    ...(payload.params?.subIds ?? []),
  ];
}

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

  it("renders delayed current-dreamscape site rewards against the resolving dreamscape", async () => {
    for (const { seed, stage, rootJourneyIndex } of [
      { seed: "audit:now_vs_later:early", stage: "early", rootJourneyIndex: 6 },
      { seed: "audit:now_vs_later:mid", stage: "mid", rootJourneyIndex: 4 },
      { seed: "audit:now_vs_later:late", stage: "late", rootJourneyIndex: 8 },
    ] satisfies readonly { seed: string; stage: JourneyStage; rootJourneyIndex: number }[]) {
      const manifest = await generatedNowVsLater(seed, stage, rootJourneyIndex);
      const delayedText = delayedRewardPayload(manifest).text ?? manifest.options[1]!.text;

      expect(delayedText).not.toMatch(/\bthis dreamscape\b/iu);
      expect(manifest.options[1]!.text).not.toMatch(/\bthis dreamscape\b/iu);
    }
  });

  it("keeps broad all-predicate transfiguration rewards out of delayed hooks", async () => {
    for (const { seed, stage, rootJourneyIndex } of [
      { seed: "audit:now_vs_later:early", stage: "early", rootJourneyIndex: 10 },
      { seed: "audit:now_vs_later:mid", stage: "mid", rootJourneyIndex: 1 },
      { seed: "audit:now_vs_later:mid", stage: "mid", rootJourneyIndex: 3 },
    ] satisfies readonly { seed: string; stage: JourneyStage; rootJourneyIndex: number }[]) {
      const manifest = await generatedNowVsLater(seed, stage, rootJourneyIndex);
      const rewardIds = consumedRewardIds(delayedRewardPayload(manifest));

      expect(rewardIds.some((id) => BROAD_DELAYED_REWARD_IDS.has(id))).toBe(false);
      expect(manifest.options[1]!.netConvertedEssence).toBeGreaterThan(
        manifest.options[0]!.netConvertedEssence,
      );
    }
  });

  it("keeps future-window reward templates out of the immediate row", async () => {
    for (const { seed, stage, rootJourneyIndex } of [
      { seed: "audit:now_vs_later:late", stage: "late", rootJourneyIndex: 5 },
      { seed: "audit:now_vs_later:late", stage: "late", rootJourneyIndex: 9 },
    ] satisfies readonly { seed: string; stage: JourneyStage; rootJourneyIndex: number }[]) {
      const manifest = await generatedNowVsLater(seed, stage, rootJourneyIndex);
      const immediateText = manifest.options[0]!.text;

      expect(immediateText).not.toMatch(/\byour next \d+ shop/iu);
      expect(immediateText).not.toMatch(/\bfor the next \d+ battle/iu);
      expect(immediateText).not.toMatch(/\bfor the next \d+ dreamscape/iu);
      expect(immediateText).not.toMatch(/\bthe next dreamscape you visit\b/iu);
    }
  });
});
