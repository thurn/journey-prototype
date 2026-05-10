import { weightedChoice } from "../../../util/rng.js";
import {
  costSlots,
  costedRewardOption,
  rewardFamilyTag,
  rewardSlots,
  sharedBaneBurdenRewardFill,
  symmetryContract,
} from "../../fillers/shared.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_LABEL = "same_cost_different_rewards";

export function sameCostDifferentRewardsFill(
  args: ShapeFillArgs,
): FilledJourney {
  const { context, drawContext, stage, shapeArgs } = args;
  const familyRestriction =
    typeof shapeArgs?.familyRestriction === "string"
      ? shapeArgs.familyRestriction
      : undefined;

  if (familyRestriction) {
    const sharedCost = costSlots(
      context,
      drawContext,
      `${SHAPE_LABEL}:shared-cost`,
    )[0]!;
    const restricted = rewardSlots(
      context,
      drawContext,
      `${SHAPE_LABEL}:rewards`,
    ).filter(
      (reward) =>
        reward.routeEffects === undefined &&
        rewardFamilyTag(reward.key) === familyRestriction,
    );
    const chosen = restricted.slice(0, 3);
    const options = chosen.map((reward, index) =>
      costedRewardOption(index + 1, sharedCost, reward),
    );

    if (options.length === 3) {
      return {
        options,
        precommitted: {},
        symmetryContracts: [
          symmetryContract({
            contractKind: "homogeneous_family_trio",
            sharedProperty: "rewardFamily",
            variedProperty: "rewardSpecific",
            sharedFirst: true,
            optionNumbers: options.map((opt) => opt.number),
            sharedPayloadKeys: [`rewardFamily=${familyRestriction}`],
          }),
        ],
      };
    }

    return {
      options,
      precommitted: {},
    };
  }

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
