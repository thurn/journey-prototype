import { describe, expect, it } from "vitest";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import type {
  JourneyManifest,
  JourneyOption,
  JourneyStage,
} from "../../src/journey/manifest.js";
import { singleRewardPlugin } from "../../src/journey/shapes/single_reward/index.js";
import { POSITIVE_MENU_VALUE_CONSTANTS } from "../../src/journey/value.js";
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

function assertComparablePositiveOptions(options: readonly JourneyOption[]) {
  const positiveNets = options
    .map((option) => option.netConvertedEssence)
    .filter((net) => net > 0);
  const lowest = Math.min(...positiveNets);
  const highest = Math.max(...positiveNets);
  const minimumComparableValue = Math.max(
    highest - POSITIVE_MENU_VALUE_CONSTANTS.maximumComparableSpread,
    highest * POSITIVE_MENU_VALUE_CONSTANTS.minimumComparableRatio,
  );

  expect(lowest).toBeGreaterThanOrEqual(minimumComparableValue);
}

function assertSingleRewardManifest(manifest: JourneyManifest) {
  expect(manifest.shapeId).toBe("single_reward");
  expect(manifest.tree).toBeUndefined();
  expect(manifest.rewardPool).toBeUndefined();
  expect(manifest.options).toHaveLength(2);
  expect(manifest.options.map((option) => option.number)).toEqual([1, 2]);
  expect(manifest.precommitted.random).toBeUndefined();
  expect(manifest.precommitted.delayed).toBeUndefined();
  expect(manifest.precommitted.routeEdits).toBeUndefined();
  expect(manifest.precommitted.sequenceMenus).toBeUndefined();
  assertComparablePositiveOptions(manifest.options);

  for (const option of manifest.options) {
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
      rootOptionCount: { min: 2, max: 2 },
      supportedTags: ["reward", "boon", "cleanse", "single"],
      validationRules: [
        "root_option_count_within_bounds",
        "single_option_is_deterministic_reward",
        "option_has_no_meaningful_cost_or_refusal_tension",
      ],
      repairPreferences: [
        "remove_cost_or_burden",
        "collapse_extra_options",
        "replace_with_simple_reward",
      ],
      payloadCompatibility: expect.arrayContaining([
        expect.objectContaining({
          familyId: "resource",
          variants: ["adapter-compatible-resource-operations"],
          legality: "legal",
        }),
        expect.objectContaining({
          familyId: "random",
          variants: [],
          legality: "unsupported",
        }),
        expect.objectContaining({
          familyId: "decision_tree",
          variants: [],
          legality: "unsupported",
        }),
      ]),
      menuValueChecks: {
        positiveBands: true,
        symmetricBands: false,
        escalationOrRiskExempt: false,
      },
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

    expect(first.options).toEqual(second.options);
    expect(first.precommitted).toEqual(second.precommitted);
    assertComparablePositiveOptions(first.options);
  });

  it("generates valid deterministic reward rows for every audited stage seed", async () => {
    for (const stage of auditStages) {
      for (const seedNumber of auditSeedNumbers) {
        const seed = `audit:single_reward:${stage}:${seedNumber}`;
        const manifest = await forcedSingleRewardManifest(seed, stage);

        assertSingleRewardManifest(manifest);
        expect(manifest.stage).toBe(stage);
        expect(manifest.debug.validation.ok, seed).toBe(true);
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
    expect(first.distinctness).toEqual(second.distinctness);
  });

  it("keeps cap-limited essence rewards inside the positive value band", async () => {
    const manifest = await forcedSingleRewardManifest("inspect:single_reward", "mid");

    assertSingleRewardManifest(manifest);
    expect(manifest.debug.validation.ok).toBe(true);
  });
});
