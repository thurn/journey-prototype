import { describe, expect, it } from "vitest";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import type {
  JourneyManifest,
  JourneyOption,
  JourneyStage,
} from "../../src/journey/manifest.js";
import { singleRewardPlugin } from "../../src/journey/shapes/single_reward/index.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import {
  createInitialJourneyState,
  simulateQuestStateForStage,
} from "../../src/quest/init.js";
import { makeTestContext } from "../helpers/journey-context.js";

const auditStages: readonly JourneyStage[] = ["early", "mid", "late"];
const auditSeedNumbers = Array.from({ length: 10 }, (_entry, index) =>
  String(index + 1).padStart(2, "0"),
);

let contentContextPromise:
  | ReturnType<typeof loadContentContext>
  | undefined;

async function contentContext() {
  contentContextPromise ??= loadContentContext(process.cwd());

  return contentContextPromise;
}

async function forcedSingleRewardManifest(seed: string, stage: JourneyStage) {
  const { content, contentVersion } = await contentContext();
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
    forcedShapeId: "single_reward",
    forcedStage: stage,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function payloadKinds(option: JourneyOption): string[] {
  return [...option.effects, ...option.costs, ...option.burdens]
    .flatMap((payload) =>
      isRecord(payload) && typeof payload.kind === "string" ? [payload.kind] : []
    );
}

function assertVisibleSingleBoon(option: JourneyOption, stage: JourneyStage) {
  expect(option.text).not.toMatch(/\b(?:Draft|Choose)\b/iu);
  expect(option.text).not.toMatch(/\b\d+ of \d+\b/u);
  expect(option.text).toMatch(
    /^Gain (?:\d+ essence|\d+ omens?|\{[^}]+\}|'.+')\.$/u,
  );
  expect(payloadKinds(option)).not.toEqual(
    expect.arrayContaining(["card_draft", "dreamsign_draft"]),
  );

  const essenceMatch = /^Gain (?<amount>\d+) essence\.$/u.exec(option.text);
  if (essenceMatch?.groups?.amount) {
    expect(Number(essenceMatch.groups.amount)).toBeGreaterThan(0);
  }

  const omenMatch = /^Gain (?<amount>\d+) omens\.$/u.exec(option.text);
  if (omenMatch?.groups?.amount) {
    expect(Number(omenMatch.groups.amount)).toBeGreaterThan(0);
  }

  for (const target of option.targets) {
    if (isRecord(target) && "selection" in target) {
      expect(target.selection).toBe("exact");
    }
  }
}

function assertSingleRewardManifest(manifest: JourneyManifest) {
  expect(manifest.shapeId).toBe("single_reward");
  expect(manifest.tree).toBeUndefined();
  expect(manifest.rewardPool).toBeUndefined();
  expect(manifest.options).toHaveLength(1);
  expect(manifest.options.map((option) => option.number)).toEqual([1]);
  expect(manifest.precommitted.random).toBeUndefined();
  expect(manifest.precommitted.delayed).toBeUndefined();
  expect(manifest.precommitted.routeEdits).toBeUndefined();
  expect(manifest.precommitted.sequenceMenus).toBeUndefined();

  for (const option of manifest.options) {
    assertVisibleSingleBoon(option, manifest.stage);
    expect(option.pickBehavior).toBe("record_and_generate_next");
    expect(option.costs).toEqual([]);
    expect(option.burdens).toEqual([]);
    expect(option.triggers).toEqual([]);
    expect(option.routeEffects).toEqual([]);
    expect(option.effects.length).toBeGreaterThan(0);
    expect(option.effectConvertedEssence).toBeGreaterThan(0);
    expect(option.costConvertedEssence).toBe(0);
    expect(option.burdenConvertedEssence).toBe(0);
    expect(option.uncertaintyConvertedEssence).toBe(0);
    expect(option.netConvertedEssence).toBe(option.effectConvertedEssence);
    expect(option.operations.every((operation) =>
      operation.role === "reward" || operation.role === "target"
    )).toBe(true);
  }
}

describe("single_reward fill", () => {
  it("uses a shape-local deterministic reward contract", () => {
    expect(singleRewardPlugin.definition).toMatchObject({
      topology: "single_reward",
      rootOptionCount: { min: 1, max: 1 },
      supportedTags: ["reward", "boon", "cleanse", "single"],
      validationRules: [
        "root_option_count_within_bounds",
        "single_option_is_deterministic_reward",
        "option_has_no_meaningful_cost_or_refusal_tension",
      ],
    });
  });

  it("is deterministic for the same draw context", () => {
    const bundle = makeTestContext({
      seed: "migration:single_reward:deterministic",
      stage: "mid",
    });
    const args = {
      context: bundle.context,
      drawContext: bundle.drawContext,
      stage: bundle.stage,
    };

    const first = singleRewardPlugin.fill(args);
    const second = singleRewardPlugin.fill(args);

    expect(first.options).toHaveLength(1);
    expect(first.options).toEqual(second.options);
    expect(first.precommitted).toEqual(second.precommitted);
    assertVisibleSingleBoon(first.options[0]!, bundle.stage);
  });

  it("generates valid deterministic reward rows for every audited stage seed", async () => {
    for (const stage of auditStages) {
      for (const seedNumber of auditSeedNumbers) {
        const seed = `audit:single_reward:${stage}:${seedNumber}`;
        const manifest = await forcedSingleRewardManifest(seed, stage);

        assertSingleRewardManifest(manifest);
        expect(manifest.stage).toBe(stage);
      }
    }
  });

  it("replays the same forced seed without changing reward structure", async () => {
    const seed = "migration:single_reward:replay";
    const first = await forcedSingleRewardManifest(seed, "mid");
    const second = await forcedSingleRewardManifest(seed, "mid");

    expect(first.options).toEqual(second.options);
    expect(first.precommitted).toEqual(second.precommitted);
    expect(first.references).toEqual(second.references);
  });

  it("keeps cap-limited essence rewards inside the positive value band", async () => {
    const manifest = await forcedSingleRewardManifest("inspect:single_reward", "mid");

    assertSingleRewardManifest(manifest);
  });
});
