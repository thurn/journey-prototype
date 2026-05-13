import { describe, expect, it } from "vitest";
import { loadContentContext } from "../../src/commands/shared.js";
import { generateNextJourney } from "../../src/journey/generate.js";
import type { JourneyStage } from "../../src/journey/manifest.js";
import {
  ONE_OPERATION_MANY_TARGETS_AUDITED_REWARD_IDS,
  ONE_OPERATION_MANY_TARGETS_REWARDS,
} from "../../src/journey/shapes/one_operation_many_targets/rewards.js";
import { buildJourneyContext } from "../../src/quest/context.js";
import { createInitialJourneyState, simulateQuestStateForStage } from "../../src/quest/init.js";

async function contextFor(seed: string, stage: JourneyStage) {
  const { content, contentVersion } = await loadContentContext(process.cwd());
  const state = createInitialJourneyState({ seed, content, contentVersion });

  simulateQuestStateForStage({
    state,
    stage,
    drawContext: {
      seed,
      contentVersion,
      rootJourneyIndex: state.generator.rootJourneyIndex,
    },
  });

  return buildJourneyContext({
    projectRoot: process.cwd(),
    content,
    state,
    contentVersion,
  });
}

describe("one_operation_many_targets rewards", () => {
  it("covers every audited non-numeric reward type", () => {
    const rewardTypeIds = new Set(
      ONE_OPERATION_MANY_TARGETS_REWARDS.map((reward) => reward.rewardTypeId),
    );

    expect(rewardTypeIds).toEqual(new Set(ONE_OPERATION_MANY_TARGETS_AUDITED_REWARD_IDS));
  });

  it("keeps single-target maintenance templates out of late forced-shape offers", async () => {
    const context = await contextFor("audit:one_operation_many_targets:late:02", "late");
    const manifest = generateNextJourney({
      context,
      forcedShapeId: "one_operation_many_targets",
      forcedStage: "late",
    });
    const rewardTypeIds = manifest.options.flatMap((option) =>
      option.operations.flatMap((operation) => {
        const rewardTypeId = operation.payload.rewardTypeId;
        return typeof rewardTypeId === "string" ? [rewardTypeId] : [];
      }),
    );

    expect(rewardTypeIds).not.toContain("apply_named_transfiguration_to_card_name");
    expect(rewardTypeIds).not.toContain("opening_hand_grant_for_X_battles");
    expect(rewardTypeIds).not.toContain("modify_random_cards_to_types");
  });

  it("renders singular random card type changes with singular grammar", () => {
    const template = ONE_OPERATION_MANY_TARGETS_REWARDS.find((reward) =>
      reward.rewardTypeId === "modify_random_cards_to_types"
    );
    const target = template?.targets({ count: 1 }, {} as never)[0];

    expect(template?.render({ count: 1 }, target!, {} as never)).toBe(
      "Modify 1 random card to become Warriors",
    );
  });

  it("builds compound reward pairs from seeded pools", async () => {
    const template = ONE_OPERATION_MANY_TARGETS_REWARDS.find((reward) =>
      reward.rewardTypeId === "meta_gain_2_rewards"
    );
    const earlyContext = await contextFor("audit:one_operation_many_targets:early:09", "early");
    const lateContext = await contextFor("audit:one_operation_many_targets:late:05", "late");

    const earlyParams = template!.rollParams(earlyContext, {
      seed: earlyContext.state.quest.seed,
      contentVersion: earlyContext.contentVersion,
      rootJourneyIndex: earlyContext.state.generator.rootJourneyIndex,
    }, "early");
    const lateParams = template!.rollParams(lateContext, {
      seed: lateContext.state.quest.seed,
      contentVersion: lateContext.contentVersion,
      rootJourneyIndex: lateContext.state.generator.rootJourneyIndex,
    }, "late");

    expect(template!.targets(earlyParams, earlyContext).slice(0, 3).map((target) => target.text))
      .not.toEqual(template!.targets(lateParams, lateContext).slice(0, 3).map((target) => target.text));
  });
});
