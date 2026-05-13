import { describe, expect, it } from "vitest";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import type {
  JourneyManifest,
  JourneyOption,
  JourneyStage,
  RandomPrecommittedOutcome,
} from "../../src/journey/manifest.js";
import { revealChoiceMenuPlugin } from "../../src/journey/shapes/reveal_choice_menu/index.js";
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

async function forcedRevealChoiceMenuManifest(
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
    forcedShapeId: "reveal_choice_menu",
    forcedStage: stage,
  });
}

function randomEnvelope(
  manifest: JourneyManifest,
  kind: RandomPrecommittedOutcome["kind"],
): RandomPrecommittedOutcome {
  const envelope = manifest.precommitted.random?.find((entry) =>
    entry.kind === kind
  );

  expect(envelope).toBeDefined();
  return envelope!;
}

function assertRevealOption(option: JourneyOption) {
  expect(option.number).toBe(1);
  expect(option.text).toMatch(
    /^Reveal \d+ rewards \(.+\)\. Choose one revealed reward\.$/u,
  );
  expect(option.effects).toEqual([
    expect.objectContaining({
      kind: "random_reward",
      table: "reveal_choice",
      revealCount: expect.any(Number),
    }),
  ]);
  expect(option.effectConvertedEssence).toBeGreaterThan(0);
  expect(option.uncertaintyConvertedEssence).toBeLessThan(0);
}

function assertRandomRevealedOption(option: JourneyOption) {
  expect(option.number).toBe(2);
  expect(option.text).toMatch(
    /^Reveal \d+ rewards\. Take the precommitted revealed reward: .+\. Gain \d+ omens? and gain \d+ \{[^}]+\}\.$/u,
  );
  expect(option.effects).toEqual(expect.arrayContaining([
    expect.objectContaining({
      kind: "random_reward",
      table: "visible_reveal_pool",
    }),
    expect.objectContaining({ kind: "gain_omens" }),
  ]));
  expect(option.burdens).toEqual([
    expect.objectContaining({ kind: "bane_gain" }),
  ]);
  expect(option.burdenConvertedEssence).toBeLessThan(0);
}

function assertHiddenRandomOption(option: JourneyOption) {
  expect(option.number).toBe(3);
  expect(option.text).toMatch(
    /^Gain one random reward from the visible pool: .+\.$/u,
  );
  expect(option.effects).toEqual([
    expect.objectContaining({
      kind: "random_reward",
      table: "visible_reveal_pool",
      poolId: expect.any(String),
    }),
  ]);
  expect(option.uncertaintyConvertedEssence).toBeLessThan(0);
}

function assertRevealChoiceMenuManifest(manifest: JourneyManifest) {
  expect(manifest.shapeId).toBe("reveal_choice_menu");
  expect(manifest.options).toHaveLength(3);
  expect(manifest.tree).toBeUndefined();
  expect(manifest.rewardPool).toBeUndefined();
  expect(manifest.precommitted.random).toHaveLength(5);
  expect(manifest.precommitted.delayed).toBeUndefined();
  expect(manifest.precommitted.routeEdits).toBeUndefined();
  expect(manifest.precommitted.sequenceMenus).toBeUndefined();

  const [reveal, randomRevealed, hiddenRandom] = manifest.options;

  assertRevealOption(reveal!);
  assertRandomRevealedOption(randomRevealed!);
  assertHiddenRandomOption(hiddenRandom!);

  const visiblePool = randomEnvelope(manifest, "visible_pool");

  expect(visiblePool).toMatchObject({
    summary: expect.any(String),
    rewards: expect.any(Array),
  });
  expect(visiblePool.summary).toMatch(/^Visible reward pool: .+\.$/u);
  expect(visiblePool.rewards).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: "bane_gain" })]),
  );
  expect(randomEnvelope(manifest, "reveal_rewards")).toMatchObject({
    optionNumber: 1,
    revealCount: expect.any(Number),
    rewards: expect.any(Array),
    presentation: "reveal_choice_menu_reveal",
  });
  expect(randomEnvelope(manifest, "choose_one_revealed_reward")).toMatchObject({
    optionNumber: 1,
    presentation: "reveal_choice_menu_choose_revealed",
  });
  expect(randomEnvelope(
    manifest,
    "choose_one_random_revealed_reward",
  )).toMatchObject({
    optionNumber: 2,
    committedReward: expect.any(Array),
    presentation: "reveal_choice_menu_choose_random_revealed",
  });
  expect(randomEnvelope(manifest, "gain_one_random_reward")).toMatchObject({
    optionNumber: 3,
    committedReward: expect.any(Array),
    presentation: "reveal_choice_menu_gain_random_reward",
  });
}

describe("reveal_choice_menu fill", () => {
  it("uses a shape-local visible reward pool contract", () => {
    expect(revealChoiceMenuPlugin.definition).toMatchObject({
      topology: "random_commit",
      rootOptionCount: { min: 3, max: 3 },
      supportedTags: ["random", "reveal", "choice", "reward", "menu"],
      validationRules: [
        "root_option_count_within_bounds",
        "options_match_shape_topology",
        "option_values_are_comparable_for_shape",
        "symmetric_option_values_are_comparable",
        "visible_reward_pool_is_precommitted",
        "reveal_choice_rows_have_matching_envelopes",
        "random_reward_outcomes_are_precommitted",
      ],
      repairPreferences: [
        "restore_visible_reward_pool",
        "split_combined_reveal_modes",
        "bound_random_reward_outcomes",
      ],
      menuValueChecks: {
        positiveBands: false,
        symmetricBands: false,
        escalationOrRiskExempt: true,
      },
    });
  });

  it("generates valid reveal menus for every audited stage seed", async () => {
    for (const stage of auditStages) {
      for (const seedNumber of auditSeedNumbers) {
        const seed = `audit:reveal_choice_menu:${stage}:${seedNumber}`;
        const manifest = await forcedRevealChoiceMenuManifest(seed, stage);

        assertRevealChoiceMenuManifest(manifest);
        expect(manifest.stage).toBe(stage);
      }
    }
  });

  it("keeps the compensated precommitted take competitive with the hidden pool draw", async () => {
    for (const stage of auditStages) {
      for (const seedNumber of auditSeedNumbers) {
        const seed = `audit:reveal_choice_menu:${stage}:${seedNumber}`;
        const manifest = await forcedRevealChoiceMenuManifest(seed, stage);
        const [, precommittedTake, hiddenPoolDraw] = manifest.options;

        expect(precommittedTake).toBeDefined();
        expect(hiddenPoolDraw).toBeDefined();
        expect(
          precommittedTake!.netConvertedEssence,
          `${seed}: ${precommittedTake!.text} / ${hiddenPoolDraw!.text}`,
        ).toBeGreaterThanOrEqual(hiddenPoolDraw!.netConvertedEssence - 25);
      }
    }
  });

  it("replays the same forced seed without changing reveal envelopes", async () => {
    const seed = "migration:reveal_choice_menu:replay";
    const first = await forcedRevealChoiceMenuManifest(seed, "mid");
    const second = await forcedRevealChoiceMenuManifest(seed, "mid");

    assertRevealChoiceMenuManifest(first);
    expect(first.options).toEqual(second.options);
    expect(first.precommitted).toEqual(second.precommitted);
    expect(first.references).toEqual(second.references);
  });
});
