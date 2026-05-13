import {
  type CostSlot,
  costSlots,
  costedRewardOption,
  option,
  type RewardSlot,
  rewardSlots,
} from "../../fillers/shared.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_ID = "single_offer";

function isDeterministicSlot(slot: { readonly key: string }): boolean {
  return !slot.key.includes("random-range");
}

function offerNet(costSlot: CostSlot, reward: RewardSlot): number {
  return (
    reward.effect -
    (costSlot.cost ?? 0) +
    (costSlot.burden ?? 0) +
    (reward.uncertainty ?? 0)
  );
}

function chooseViableOffer(args: {
  readonly costs: readonly CostSlot[];
  readonly rewards: readonly RewardSlot[];
}): { cost: CostSlot; reward: RewardSlot } {
  let best: { cost: CostSlot; reward: RewardSlot; net: number } | undefined;

  for (const reward of args.rewards) {
    for (const cost of args.costs) {
      const net = offerNet(cost, reward);
      if (!best || net > best.net) {
        best = { cost, reward, net };
      }
      if (net >= 0) {
        return { cost, reward };
      }
    }
  }

  if (!best) {
    throw new Error(`${SHAPE_ID} fill could not roll a viable offer`);
  }

  return { cost: best.cost, reward: best.reward };
}

export function singleOfferFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext, stage } = args;
  const rewards = rewardSlots(
    context,
    drawContext,
    `${SHAPE_ID}:offer-reward`,
  ).filter((entry) =>
    entry.routeEffects === undefined && isDeterministicSlot(entry)
  );
  const costs = costSlots(
    context,
    drawContext,
    `${SHAPE_ID}:offer-cost`,
    { includeStatusBurdens: stage === "late" },
  ).filter(isDeterministicSlot);
  const offer = chooseViableOffer({ costs, rewards });

  return {
    options: [
      costedRewardOption(1, offer.cost, offer.reward),
      option({
        number: 2,
        text: "Leave with no effect.",
        pickBehavior: "leave",
      }),
    ],
    precommitted: {},
  };
}
