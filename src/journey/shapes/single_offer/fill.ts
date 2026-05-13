import {
  type CostSlot,
  costSlots,
  costedRewardOption,
  option,
  type RewardSlot,
  rewardSlots,
} from "../../fillers/shared.js";
import type { JourneyStage } from "../../manifest.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_ID = "single_offer";

const GENERIC_PERSISTENT_PROHIBITION_COST_KEYS = new Set([
  "status-no-essence-gain",
  "status-no-deck-modification",
  "status-no-transfiguring",
]);

const STAGE_OFFER_BANDS: Record<
  JourneyStage,
  {
    readonly minimumNet: number;
    readonly targetNet: number;
    readonly maximumNet: number;
  }
> = {
  early: { minimumNet: 20, targetNet: 95, maximumNet: 190 },
  mid: { minimumNet: -20, targetNet: 90, maximumNet: 170 },
  late: { minimumNet: -40, targetNet: 130, maximumNet: 180 },
};

type OfferCandidate = {
  readonly cost: CostSlot;
  readonly reward: RewardSlot;
  readonly net: number;
  readonly distanceFromTarget: number;
  readonly downside: number;
};

function isDeterministicSlot(slot: { readonly key: string }): boolean {
  return !slot.key.includes("random-range");
}

function hasFixedVisibleReward(slot: RewardSlot): boolean {
  return (
    slot.key === "essence" ||
    slot.key === "omens" ||
    slot.key.startsWith("resource:fixed-essence-gain:") ||
    slot.key.startsWith("resource:max-essence-gain:") ||
    slot.key === "resource:restore-to-maximum" ||
    slot.key.startsWith("resource:set-current-to-percent:") ||
    slot.key.startsWith("resource:fixed-omen-reward:") ||
    slot.key.startsWith("named-card:") ||
    slot.key.startsWith("named-card-operation:") ||
    slot.key.startsWith("named-dreamsign:") ||
    slot.key.startsWith("starter-door-named-transform:") ||
    slot.key === "next-victory-replacement:essence" ||
    slot.key === "next-victory-replacement:route"
  );
}

function isSingleOfferReward(slot: RewardSlot, stage: JourneyStage): boolean {
  if (slot.routeEffects !== undefined || !hasFixedVisibleReward(slot)) {
    return false;
  }

  if (stage === "early") {
    return !slot.key.startsWith("next-victory-replacement:");
  }

  return true;
}

function isSingleOfferCost(slot: CostSlot): boolean {
  return !GENERIC_PERSISTENT_PROHIBITION_COST_KEYS.has(slot.key) &&
    slot.key !== "status-deck-size-floor" &&
    slot.key !== "status-exact-deck-size";
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function immediateEssenceCost(slot: CostSlot): number {
  return (slot.costs ?? []).reduce<number>((total, payload) => {
    const record = recordValue(payload);
    const amount = record?.amount;

    return record?.kind === "essence" &&
        (record.resource === undefined || record.resource === "essence") &&
        typeof amount === "number"
      ? total + amount
      : total;
  }, 0);
}

function maximumEssenceDelta(slot: CostSlot): number {
  return (slot.burdens ?? []).reduce<number>((total, payload) => {
    const record = recordValue(payload);
    const capDelta = record?.capDelta;

    return record?.kind === "resource_cap_change" &&
        record.resource === "maxEssence" &&
        typeof capDelta === "number"
      ? total + capDelta
      : total;
  }, 0);
}

function fixedEssenceRewardAmount(slot: RewardSlot): number | undefined {
  if (
    slot.effects.length !== 1 ||
    !/^Gain \d+ essence\.$/u.test(slot.text)
  ) {
    return undefined;
  }

  const record = recordValue(slot.effects[0]);

  return record?.kind === "gain_essence" && typeof record.amount === "number"
    ? record.amount
    : undefined;
}

function rewardWithRealizableEssence(
  reward: RewardSlot,
  cost: CostSlot,
  context: ShapeFillArgs["context"],
): RewardSlot {
  const rawAmount = fixedEssenceRewardAmount(reward);

  if (rawAmount === undefined) {
    return reward;
  }

  const resources = context.state.quest.resources;
  const essenceAfterCost = Math.max(
    0,
    resources.essence - immediateEssenceCost(cost),
  );
  const maxAfterCost = Math.max(
    0,
    resources.maxEssence + maximumEssenceDelta(cost),
  );
  const realizableAmount = Math.max(
    0,
    Math.min(rawAmount, maxAfterCost - essenceAfterCost),
  );

  if (realizableAmount === rawAmount && reward.effect === realizableAmount) {
    return reward;
  }

  return {
    ...reward,
    text: `Gain ${realizableAmount} essence.`,
    effects: reward.effects.map((payload) => {
      const record = recordValue(payload);

      return record?.kind === "gain_essence"
        ? {
            ...record,
            amount: realizableAmount,
            rawAmount,
            resourceAmountKind: "fixed",
          }
        : payload;
    }),
    effect: realizableAmount,
  };
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
  readonly context: ShapeFillArgs["context"];
  readonly stage: JourneyStage;
}): { cost: CostSlot; reward: RewardSlot } {
  const band = STAGE_OFFER_BANDS[args.stage];
  const candidates: OfferCandidate[] = [];
  const fallbackCandidates: OfferCandidate[] = [];

  for (const reward of args.rewards) {
    for (const cost of args.costs) {
      const adjustedReward = rewardWithRealizableEssence(
        reward,
        cost,
        args.context,
      );
      const net = offerNet(cost, adjustedReward);
      const candidate = {
        cost,
        reward: adjustedReward,
        net,
        distanceFromTarget: Math.abs(net - band.targetNet),
        downside: (cost.cost ?? 0) + Math.abs(Math.min(cost.burden ?? 0, 0)),
      };

      fallbackCandidates.push(candidate);

      if (
        net >= band.minimumNet &&
        net <= band.maximumNet &&
        candidate.downside > 0
      ) {
        candidates.push(candidate);
      }
    }
  }

  const sortedCandidates = [
    ...(candidates.length > 0 ? candidates : fallbackCandidates),
  ].sort((left, right) =>
    left.distanceFromTarget - right.distanceFromTarget ||
    right.downside - left.downside ||
    left.net - right.net
  );
  const best = sortedCandidates[0];

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
    stage,
  ).filter((entry) =>
    isDeterministicSlot(entry) && isSingleOfferReward(entry, stage)
  );
  const costs = costSlots(
    context,
    drawContext,
    `${SHAPE_ID}:offer-cost`,
    { includeStatusBurdens: stage === "late" },
  ).filter((entry) => isDeterministicSlot(entry) && isSingleOfferCost(entry));
  const offer = chooseViableOffer({ costs, rewards, context, stage });

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
