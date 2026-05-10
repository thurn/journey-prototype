import {
  rewardFamilyTag,
  rewardSlotOption,
  rewardSlots,
  symmetryContract,
} from "../../fillers/shared.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_LABEL = "curated_reward_trio";

export function curatedRewardTrioFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext, shapeArgs } = args;
  const familyRestriction =
    typeof shapeArgs?.familyRestriction === "string"
      ? shapeArgs.familyRestriction
      : undefined;

  let rewards = rewardSlots(
    context,
    drawContext,
    `${SHAPE_LABEL}:positive-menu`,
  ).filter((reward) => reward.effect >= 170);

  if (familyRestriction) {
    rewards = rewards.filter(
      (reward) => rewardFamilyTag(reward.key) === familyRestriction,
    );
  }

  const draftReward = rewards.find((reward) => reward.key.startsWith("draft"));
  const orderedRewards = [
    ...(draftReward ? [draftReward] : []),
    ...rewards.filter((reward) => reward.key !== draftReward?.key),
  ];

  const options = orderedRewards
    .slice(0, 3)
    .map((reward, index) => rewardSlotOption(index + 1, reward));

  if (familyRestriction && options.length === 3) {
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
