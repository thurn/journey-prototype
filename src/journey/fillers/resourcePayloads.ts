import type { JourneyContext } from "../../quest/context.js";
import { drawInt, shuffleDeterministic, type DrawContext } from "../../util/rng.js";
import {
  ESSENCE_VALUE_CONSTANTS,
  RESOURCE_EDGE_VALUE_CONSTANTS,
  valueEssenceGain,
  valueOmenGain,
  valueOmenLoss,
} from "../value.js";

export type ResourcePayload = Record<string, unknown>;

export type ResourceRewardCatalogEntry = {
  key: string;
  text: string;
  effects: ResourcePayload[];
  effect: number;
  uncertainty?: number;
};

export type ResourceCostCatalogEntry = {
  key: string;
  prefix: string;
  costs?: ResourcePayload[];
  burdens?: ResourcePayload[];
  cost?: number;
  burden?: number;
  uncertainty?: number;
};

type ResourcePayloadArgs = {
  kind: string;
  resource: "essence" | "omens" | "maxEssence";
  amount?: number;
  percentage?: number;
  minimum?: number;
  maximum?: number;
  capDelta?: number;
  basis?: "current" | "maximum" | "remaining" | "reward";
  timing?: string;
  extra?: Record<string, unknown>;
};

export function resourcePayload(args: ResourcePayloadArgs): ResourcePayload {
  return {
    kind: args.kind,
    resource: args.resource,
    timing: args.timing ?? "immediate",
    ...(args.amount !== undefined ? { amount: args.amount } : {}),
    ...(args.percentage !== undefined ? { percentage: args.percentage } : {}),
    ...(args.minimum !== undefined ? { minimum: args.minimum } : {}),
    ...(args.maximum !== undefined ? { maximum: args.maximum } : {}),
    ...(args.capDelta !== undefined ? { capDelta: args.capDelta } : {}),
    ...(args.basis ? { basis: args.basis } : {}),
    ...(args.extra ?? {}),
  };
}

function choose<T>(drawContext: DrawContext, label: string, values: readonly T[]): T {
  return values[drawInt(drawContext, label, 0, values.length - 1)]!;
}

function roundedPercentageAmount(total: number, percentage: number): number {
  return Math.max(0, Math.round(total * (percentage / 100)));
}

function capChangeValue(amount: number, direction: "gain" | "loss"): number {
  const multiplier = direction === "gain"
    ? RESOURCE_EDGE_VALUE_CONSTANTS.capGainMultiplier
    : RESOURCE_EDGE_VALUE_CONSTANTS.capLossMultiplier;

  return Math.round(amount * multiplier);
}

export function resourceRewardCatalog(
  context: JourneyContext,
  drawContext: DrawContext,
  label: string,
): ResourceRewardCatalogEntry[] {
  const resources = context.state.quest.resources;
  const essenceGain = choose(drawContext, `${label}:fixed-essence-gain`, [
    220,
    260,
    300,
  ] as const);
  const maxGain = choose(drawContext, `${label}:max-essence-gain`, [
    120,
    140,
    160,
  ] as const);
  const restoreAmount = Math.max(0, resources.maxEssence - resources.essence);
  const percentage = choose(drawContext, `${label}:set-percentage`, [
    60,
    65,
  ] as const);
  const percentageAmount = roundedPercentageAmount(resources.maxEssence, percentage);
  const randomMinimum = choose(drawContext, `${label}:random-reward-minimum`, [
    220,
    240,
    260,
  ] as const);
  const randomMaximum = randomMinimum + choose(
    drawContext,
    `${label}:random-reward-width`,
    [30, 40, 60] as const,
  );
  const randomAmount = drawInt(
    drawContext,
    `${label}:random-reward-committed`,
    randomMinimum,
    randomMaximum,
  );
  const omenReward = choose(drawContext, `${label}:fixed-omen-reward`, [
    4,
  ] as const);

  return shuffleDeterministic(drawContext, `${label}:resource-rewards`, [
    {
      key: `resource:fixed-essence-gain:${essenceGain}`,
      text: `Gain ${essenceGain} essence.`,
      effects: [
        resourcePayload({
          kind: "gain_essence",
          resource: "essence",
          amount: essenceGain,
          extra: { resourceAmountKind: "fixed" },
        }),
      ],
      effect: Math.max(320, valueEssenceGain(essenceGain, context)),
    },
    {
      key: `resource:max-essence-gain:${maxGain}`,
      text: `Gain ${maxGain} maximum essence.`,
      effects: [
        resourcePayload({
          kind: "resource_cap_change",
          resource: "maxEssence",
          amount: maxGain,
          capDelta: maxGain,
          extra: { resourceAmountKind: "cap_change" },
        }),
      ],
      effect: Math.max(320, capChangeValue(maxGain, "gain")),
    },
    {
      key: "resource:restore-to-maximum",
      text: "Restore essence to maximum.",
      effects: [
        resourcePayload({
          kind: "resource_restore_to_maximum",
          resource: "essence",
          amount: restoreAmount,
          basis: "maximum",
          extra: { resourceAmountKind: "restore_to_maximum" },
        }),
      ],
      effect: restoreAmount > 0
        ? 320
        : Math.max(320, ESSENCE_VALUE_CONSTANTS.restoreToFullFallback.mid),
    },
    {
      key: `resource:set-current-to-percent:${percentage}`,
      text: `Set essence to ${percentage}% of maximum.`,
      effects: [
        resourcePayload({
          kind: "resource_percentage",
          resource: "essence",
          amount: percentageAmount,
          percentage,
          basis: "maximum",
          extra: {
            resourceAmountKind: "percentage_of_maximum",
            resourceSetMode: "set_current_to_percentage",
          },
        }),
      ],
      effect: Math.max(
        320,
        Math.round(
          percentageAmount *
            RESOURCE_EDGE_VALUE_CONSTANTS.percentageOfMaximumMultiplier,
        ),
      ),
    },
    {
      key: `resource:random-range-reward:${randomMinimum}-${randomMaximum}`,
      text: `Gain ${randomMinimum}-${randomMaximum} random essence.`,
      effects: [
        resourcePayload({
          kind: "resource_random_range",
          resource: "essence",
          amount: randomAmount,
          minimum: randomMinimum,
          maximum: randomMaximum,
          extra: { resourceAmountKind: "random_range" },
        }),
      ],
      effect: Math.max(320, Math.round((randomMinimum + randomMaximum) / 2)),
      uncertainty: -10,
    },
    {
      key: `resource:fixed-omen-reward:${omenReward}`,
      text: `Gain ${omenReward} omens.`,
      effects: [
        resourcePayload({
          kind: "gain_omens",
          resource: "omens",
          amount: omenReward,
          extra: { resourceAmountKind: "fixed" },
        }),
      ],
      effect: Math.max(320, valueOmenGain(omenReward)),
    },
  ]);
}

export function resourceCostCatalog(
  context: JourneyContext,
  drawContext: DrawContext,
  label: string,
): ResourceCostCatalogEntry[] {
  const resources = context.state.quest.resources;
  const entries: ResourceCostCatalogEntry[] = [];
  const fixedEssence = Math.min(
    resources.essence,
    choose(drawContext, `${label}:fixed-essence-loss`, [30, 60, 90] as const),
  );
  const maxLoss = choose(drawContext, `${label}:max-essence-loss`, [
    25,
    40,
    60,
    80,
  ] as const);
  const percentage = choose(drawContext, `${label}:percentage-cost`, [
    25,
    40,
    60,
  ] as const);
  const percentageAmount = Math.min(
    resources.essence,
    Math.ceil(resources.essence * (percentage / 100)),
  );
  const randomMinimum = Math.min(
    resources.essence,
    choose(drawContext, `${label}:random-cost-minimum`, [25, 40, 55] as const),
  );
  const randomMaximum = Math.min(
    resources.essence,
    randomMinimum +
      choose(drawContext, `${label}:random-cost-width`, [30, 45, 60] as const),
  );
  const randomAmount = drawInt(
    drawContext,
    `${label}:random-cost-committed`,
    randomMinimum,
    randomMaximum,
  );

  if (fixedEssence > 0) {
    entries.push({
      key: `resource:fixed-essence-loss:${fixedEssence}`,
      prefix: `Pay ${fixedEssence} essence.`,
      costs: [
        resourcePayload({
          kind: "essence",
          resource: "essence",
          amount: fixedEssence,
          extra: { resourceAmountKind: "fixed" },
        }),
      ],
      cost: fixedEssence,
    });
  }

  entries.push(
    {
      key: `resource:max-essence-loss:${maxLoss}`,
      prefix: `Lose ${maxLoss} maximum essence.`,
      burdens: [
        resourcePayload({
          kind: "resource_cap_change",
          resource: "maxEssence",
          amount: maxLoss,
          capDelta: -maxLoss,
          extra: { resourceAmountKind: "cap_change" },
        }),
      ],
      burden: capChangeValue(maxLoss, "loss"),
    },
    {
      key: "resource:spend-all-essence",
      prefix: `Spend all essence (${resources.essence}).`,
      costs: [
        resourcePayload({
          kind: "essence",
          resource: "essence",
          amount: resources.essence,
          basis: "remaining",
          extra: { resourceAmountKind: "all_remaining", allRemaining: true },
        }),
      ],
      cost: resources.essence,
    },
    {
      key: "resource:pay-maximum-essence",
      prefix: `Pay maximum available essence (${resources.essence}).`,
      costs: [
        resourcePayload({
          kind: "essence",
          resource: "essence",
          amount: resources.essence,
          maximum: resources.maxEssence,
          basis: "maximum",
          extra: { resourceAmountKind: "maximum" },
        }),
      ],
      cost: resources.essence,
    },
    {
      key: "resource:pay-all-remaining-essence",
      prefix: `Pay all remaining essence (${resources.essence}).`,
      costs: [
        resourcePayload({
          kind: "essence",
          resource: "essence",
          amount: resources.essence,
          basis: "remaining",
          extra: { resourceAmountKind: "all_remaining", allRemaining: true },
        }),
      ],
      cost: resources.essence,
    },
  );

  if (percentageAmount > 0) {
    entries.push({
      key: `resource:percentage-essence-cost:${percentage}`,
      prefix: `Pay ${percentage}% of current essence (${percentageAmount}).`,
      costs: [
        resourcePayload({
          kind: "essence",
          resource: "essence",
          amount: percentageAmount,
          percentage,
          basis: "current",
          extra: { resourceAmountKind: "percentage_of_current" },
        }),
      ],
      cost: percentageAmount,
    });
  }

  if (randomMinimum > 0) {
    entries.push({
      key: `resource:random-range-cost:${randomMinimum}-${randomMaximum}`,
      prefix: `Pay ${randomMinimum}-${randomMaximum} random essence (${randomAmount}).`,
      costs: [
        resourcePayload({
          kind: "essence",
          resource: "essence",
          amount: randomAmount,
          minimum: randomMinimum,
          maximum: randomMaximum,
          extra: { resourceAmountKind: "random_range" },
        }),
      ],
      cost: Math.round(
        ((randomMinimum + randomMaximum) / 2) *
          RESOURCE_EDGE_VALUE_CONSTANTS.randomRangeExpectedMultiplier,
      ),
      uncertainty: -10,
    });
  }

  if (resources.omens >= 2) {
    const omenAmount = Math.min(
      resources.omens,
      choose(drawContext, `${label}:fixed-omen-cost`, [2, 3] as const),
    );

    entries.push({
      key: `resource:fixed-omen-cost:${omenAmount}`,
      prefix: `Pay ${omenAmount} omens.`,
      costs: [
        resourcePayload({
          kind: "omens",
          resource: "omens",
          amount: omenAmount,
          extra: { resourceAmountKind: "fixed" },
        }),
      ],
      cost: Math.abs(valueOmenLoss(omenAmount)),
    });
  }

  return shuffleDeterministic(drawContext, `${label}:resource-costs`, entries);
}
