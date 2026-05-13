import { describe, expect, it } from "vitest";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import type {
  JourneyManifest,
  JourneyOption,
  JourneyStage,
} from "../../src/journey/manifest.js";
import { flatEscalatingTradePlugin } from "../../src/journey/shapes/flat_escalating_trade/index.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import {
  createInitialJourneyState,
  simulateQuestStateForStage,
} from "../../src/quest/init.js";

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

async function forcedFlatEscalatingTradeManifest(
  seed: string,
  stage: JourneyStage,
) {
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
    forcedShapeId: "flat_escalating_trade",
    forcedStage: stage,
  });
}

function essenceCost(option: JourneyOption): number {
  const cost = option.costs.find((entry) =>
    typeof entry === "object" &&
    entry !== null &&
    (entry as { kind?: unknown }).kind === "essence"
  ) as { amount?: unknown; escalationTier?: unknown } | undefined;

  expect(cost).toBeDefined();
  expect(cost!.escalationTier).toMatch(/^tier_\d+$/u);
  expect(typeof cost!.amount).toBe("number");
  return cost!.amount as number;
}

function omenReward(option: JourneyOption): number {
  const reward = option.effects.find((entry) =>
    typeof entry === "object" &&
    entry !== null &&
    (entry as { kind?: unknown }).kind === "gain_omens"
  ) as { amount?: unknown; escalationTier?: unknown } | undefined;

  expect(reward).toBeDefined();
  expect(reward!.escalationTier).toMatch(/^tier_\d+$/u);
  expect(typeof reward!.amount).toBe("number");
  return reward!.amount as number;
}

function assertStrictlyIncreasing(values: readonly number[]) {
  for (let index = 1; index < values.length; index += 1) {
    expect(values[index], values.join(",")).toBeGreaterThan(
      values[index - 1]!,
    );
  }
}

function netValues(manifest: JourneyManifest): number[] {
  return manifest.options.map((option) => option.netConvertedEssence);
}

function assertComparableNetValues(manifest: JourneyManifest) {
  const nets = netValues(manifest);
  const spread = Math.max(...nets) - Math.min(...nets);

  expect(spread, nets.join(",")).toBeLessThanOrEqual(35);
}

function assertFlatEscalatingTradeManifest(manifest: JourneyManifest) {
  expect(manifest.shapeId).toBe("flat_escalating_trade");
  expect(manifest.options).toHaveLength(3);
  expect(manifest.tree).toBeUndefined();
  expect(manifest.rewardPool).toBeUndefined();
  expect(manifest.precommitted.random).toBeUndefined();
  expect(manifest.precommitted.delayed).toBeUndefined();
  expect(manifest.precommitted.routeEdits).toBeUndefined();
  expect(manifest.precommitted.sequenceMenus).toBeUndefined();

  const costs = manifest.options.map(essenceCost);
  const rewards = manifest.options.map(omenReward);

  expect(manifest.options.map((option) => option.number)).toEqual([1, 2, 3]);
  assertStrictlyIncreasing(costs);
  assertStrictlyIncreasing(rewards);
  assertComparableNetValues(manifest);

  for (const option of manifest.options) {
    const price = essenceCost(option);
    const omens = omenReward(option);

    expect(option.text).toBe(
      `Pay ${price} essence. Gain ${omens} ${omens === 1 ? "omen" : "omens"}.`,
    );
    expect(option.pickBehavior).toBe("record_and_generate_next");
    expect(option.costConvertedEssence).toBe(price);
    expect(option.effectConvertedEssence).toBeGreaterThan(0);
    expect(option.burdens).toEqual([]);
    expect(option.triggers).toEqual([]);
    expect(option.routeEffects).toEqual([]);
  }

  expect(manifest.debug.symmetryContracts).toEqual([
    expect.objectContaining({
      contractKind: "flat_escalating_trade",
      sharedProperty: "essence-for-omens trade family",
      variedProperty: "strictly increasing price and omen reward",
      optionNumbers: [1, 2, 3],
    }),
  ]);
}

describe("flat_escalating_trade fill", () => {
  it("uses a shape-local escalating essence-for-omens contract", () => {
    expect(flatEscalatingTradePlugin.definition).toMatchObject({
      topology: "direct_menu",
      rootOptionCount: { min: 3, max: 4 },
      supportedTags: [
        "cost",
        "reward",
        "resource",
        "trade",
        "escalation",
        "menu",
      ],
      validationRules: [
        "root_option_count_within_bounds",
        "options_match_shape_topology",
        "option_values_are_comparable_for_shape",
        "symmetric_option_values_are_comparable",
        "root_costs_strictly_increase",
        "root_rewards_strictly_increase",
        "menu_remains_flat_not_tree",
      ],
      repairPreferences: [
        "normalize_escalating_costs",
        "align_reward_family",
        "rebalance_escalating_values",
      ],
      menuValueChecks: {
        positiveBands: false,
        symmetricBands: false,
        escalationOrRiskExempt: true,
      },
    });
  });

  it("generates valid escalating trades for every audited stage seed", async () => {
    for (const stage of auditStages) {
      for (const seedNumber of auditSeedNumbers) {
        const seed = `audit:flat_escalating_trade:${stage}:${seedNumber}`;
        const manifest = await forcedFlatEscalatingTradeManifest(seed, stage);

        assertFlatEscalatingTradeManifest(manifest);
        expect(manifest.stage).toBe(stage);
      }
    }
  });

  it("replays the same forced seed without changing trade tiers", async () => {
    const seed = "migration:flat_escalating_trade:replay";
    const first = await forcedFlatEscalatingTradeManifest(seed, "mid");
    const second = await forcedFlatEscalatingTradeManifest(seed, "mid");

    assertFlatEscalatingTradeManifest(first);
    expect(first.options).toEqual(second.options);
    expect(first.precommitted).toEqual(second.precommitted);
    expect(first.debug.symmetryContracts).toEqual(
      second.debug.symmetryContracts,
    );
  });

  it("makes late high tiers a larger essence commitment", async () => {
    for (const seedNumber of auditSeedNumbers) {
      const seed = `audit:flat_escalating_trade:late:${seedNumber}`;
      const manifest = await forcedFlatEscalatingTradeManifest(seed, "late");
      const costs = manifest.options.map(essenceCost);

      expect(costs.at(-1), seed).toBeGreaterThanOrEqual(350);
      assertComparableNetValues(manifest);
    }
  });
});
