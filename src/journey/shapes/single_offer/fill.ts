import {
  costSlots,
  costedRewardOption,
  option,
  rewardSlots,
} from "../../fillers/shared.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_ID = "single_offer";

export function singleOfferFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext, stage } = args;
  const reward = rewardSlots(
    context,
    drawContext,
    `${SHAPE_ID}:offer-reward`,
  ).filter((entry) => entry.routeEffects === undefined)[0]!;
  const costSlot = costSlots(
    context,
    drawContext,
    `${SHAPE_ID}:offer-cost`,
    { includeStatusBurdens: stage === "late" },
  )[0]!;

  return {
    options: [
      costedRewardOption(1, costSlot, reward),
      option({
        number: 2,
        text: "Leave with no effect.",
        pickBehavior: "leave",
      }),
    ],
    precommitted: {},
  };
}
