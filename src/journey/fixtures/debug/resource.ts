import type { JourneyContext } from "../../../quest/context.js";
import type { JourneyOption } from "../../manifest.js";
import { resourcePayload } from "../../fillers/resourcePayloads.js";
import { gainEssence, gainOmen, option } from "../../fillers/shared.js";

export function resourceEdgeCaseOptions(
  context: JourneyContext,
): JourneyOption[] {
  const resources = context.state.quest.resources;
  const restoreAmount = Math.max(0, resources.maxEssence - resources.essence);
  const percentageGain = Math.round(resources.maxEssence * 0.25);
  const percentageCost = Math.min(
    resources.essence,
    Math.ceil(resources.essence * 0.1),
  );
  const allRemaining = resources.essence;

  return [
    option({
      number: 1,
      text: "Restore essence to maximum. Gain 25 maximum essence.",
      effects: [
        resourcePayload({
          kind: "resource_restore_to_maximum",
          resource: "essence",
          amount: restoreAmount,
          basis: "maximum",
          extra: { resourceAmountKind: "restore_to_maximum" },
        }),
        resourcePayload({
          kind: "resource_cap_change",
          resource: "maxEssence",
          amount: 25,
          capDelta: 25,
          extra: { resourceAmountKind: "cap_change" },
        }),
      ],
      effect: 150,
    }),
    option({
      number: 2,
      text: `Pay ${percentageCost} essence (10% of current essence). Gain ${percentageGain} essence (25% of maximum).`,
      costs: [
        {
          kind: "essence",
          amount: percentageCost,
          resource: "essence",
          resourceAmountKind: "percentage_of_current",
          percentage: 10,
          basis: "current",
          timing: "immediate",
        },
      ],
      effects: [
        resourcePayload({
          kind: "resource_percentage",
          resource: "essence",
          amount: percentageGain,
          percentage: 25,
          basis: "maximum",
          extra: { resourceAmountKind: "percentage_of_maximum" },
        }),
      ],
      cost: 40,
      effect: 190,
    }),
    option({
      number: 3,
      text: `Pay all remaining essence (${allRemaining}). Gain a random 80-120 essence and 2 omens.`,
      costs: [
        {
          kind: "essence",
          amount: allRemaining,
          resource: "essence",
          resourceAmountKind: "all_remaining",
          basis: "remaining",
          allRemaining: true,
          timing: "immediate",
        },
      ],
      effects: [
        resourcePayload({
          kind: "resource_random_range",
          resource: "essence",
          amount: 100,
          minimum: 80,
          maximum: 120,
          extra: { resourceAmountKind: "random_range" },
        }),
        gainOmen(2),
      ],
      cost: 120,
      effect: 270,
      uncertainty: -10,
    }),
    option({
      number: 4,
      text: "Gain 260 essence. After next victory, pay 2 omens and reduce the next Journey reward by 25%.",
      effects: [gainEssence(260)],
      burdens: [
        resourcePayload({
          kind: "omen_loss",
          resource: "omens",
          amount: 2,
          timing: "after next victory",
          extra: { resourceAmountKind: "fixed", multiOmenCost: true },
        }),
        resourcePayload({
          kind: "resource_reward_reduction",
          resource: "essence",
          amount: 25,
          percentage: 25,
          basis: "reward",
          timing: "after next victory",
          extra: { resourceAmountKind: "reward_reduction" },
        }),
      ],
      effect: 290,
      burden: -140,
    }),
  ];
}
