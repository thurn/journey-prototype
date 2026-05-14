import { afterEach, describe, expect, it, vi } from "vitest";
import type { JourneyContext } from "../../src/quest/context.js";
import type { DrawContext } from "../../src/util/rng.js";

describe("single_random_outcome reward pool", () => {
  afterEach(() => {
    vi.doUnmock("../../src/journey/shared/rewards.js");
    vi.resetModules();
  });

  it("throws when the weighted pool cannot fill the requested size", async () => {
    vi.resetModules();
    vi.doMock("../../src/journey/shared/rewards.js", () => ({
      REWARDS: [
        {
          id: "mock_reward_a",
          weight: 1,
          rollParams: () => ({}),
          viable: () => true,
          cec: () => 100,
          render: () => "Gain reward A",
        },
        {
          id: "mock_reward_b",
          weight: 1,
          rollParams: () => ({}),
          viable: () => true,
          cec: () => 100,
          render: () => "Gain reward B",
        },
      ],
    }));

    const { weightedRewardPool } = await import(
      "../../src/journey/shapes/single_random_outcome/pool.js"
    );

    expect(() =>
      weightedRewardPool({
        context: {} as JourneyContext,
        drawContext: {
          seed: "short-pool",
          contentVersion: "v1",
          rootJourneyIndex: 0,
        } as DrawContext,
        label: "short-pool",
        size: 3,
      }),
    ).toThrow("single_random_outcome fill could not roll enough viable shared rewards");
  });
});
