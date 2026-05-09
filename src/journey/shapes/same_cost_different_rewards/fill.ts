import { weightedChoice } from "../../../util/rng.js";
import {
  costSlots,
  costedRewardOption,
  rewardSlots,
  sharedBaneBurdenRewardFill,
  symmetryContract,
} from "../../fillers/shared.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_LABEL = "same_cost_different_rewards";

export function sameCostDifferentRewardsFill(
  args: ShapeFillArgs,
): FilledJourney {
  const { context, drawContext, stage } = args;

  const contractVariant = weightedChoice(
    drawContext,
    `${SHAPE_LABEL}:symmetric-contract`,
    [
      { item: "shared_cost", weight: 4 },
      { item: "shared_bane_burden", weight: 1 },
    ] as const,
  );

  if (contractVariant === "shared_bane_burden") {
    const sharedBaneFill = sharedBaneBurdenRewardFill({
      context,
      drawContext,
      label: SHAPE_LABEL,
      stage,
    });

    if (sharedBaneFill) {
      return {
        options: sharedBaneFill.options,
        precommitted: {
          routeEdits: sharedBaneFill.options.flatMap(
            (journeyOption) => journeyOption.routeEffects,
          ),
        },
        symmetryContracts: sharedBaneFill.symmetryContracts,
      };
    }
  }

  const sharedCost = costSlots(
    context,
    drawContext,
    `${SHAPE_LABEL}:shared-cost`,
  )[0]!;
  const rewards = rewardSlots(
    context,
    drawContext,
    `${SHAPE_LABEL}:rewards`,
  ).filter((reward) => reward.routeEffects === undefined);

  return {
    options: rewards
      .slice(0, 3)
      .map((reward, index) =>
        costedRewardOption(index + 1, sharedCost, reward),
      ),
    precommitted: {},
    symmetryContracts: [
      symmetryContract({
        contractKind: "shared_cost_different_rewards",
        sharedProperty: sharedCost.key,
        variedProperty: "reward family",
        sharedFirst: true,
        optionNumbers: [1, 2, 3],
        sharedPayloadKeys: [sharedCost.key],
        variedPayloadKeys: rewards.slice(0, 3).map((reward) => reward.key),
        weight: 4,
      }),
    ],
  };
}
