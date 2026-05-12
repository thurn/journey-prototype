import { describe, expect, it } from "vitest";
import {
  ONE_OPERATION_MANY_TARGETS_AUDITED_REWARD_IDS,
  ONE_OPERATION_MANY_TARGETS_REWARDS,
} from "../../src/journey/shapes/one_operation_many_targets/rewards.js";

describe("one_operation_many_targets rewards", () => {
  it("covers every audited non-numeric reward type", () => {
    const rewardTypeIds = new Set(
      ONE_OPERATION_MANY_TARGETS_REWARDS.map((reward) => reward.rewardTypeId),
    );

    expect(rewardTypeIds).toEqual(new Set(ONE_OPERATION_MANY_TARGETS_AUDITED_REWARD_IDS));
  });
});
