import { rewardSlotOption, rewardSlots } from "../../fillers/shared.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_LABEL = "curated_reward_trio";

export function curatedRewardTrioFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext } = args;
  const rewards = rewardSlots(
    context,
    drawContext,
    `${SHAPE_LABEL}:positive-menu`,
  ).filter((reward) => reward.effect >= 170);
  const draftReward = rewards.find((reward) => reward.key.startsWith("draft"));
  const orderedRewards = [
    ...(draftReward ? [draftReward] : []),
    ...rewards.filter((reward) => reward.key !== draftReward?.key),
  ];

  return {
    options: orderedRewards
      .slice(0, 3)
      .map((reward, index) => rewardSlotOption(index + 1, reward)),
    precommitted: {},
  };
}
