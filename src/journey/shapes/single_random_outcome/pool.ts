import type { JourneyContext } from "../../../quest/context.js";
import {
  weightedChoice,
  type DrawContext,
} from "../../../util/rng.js";
import type {
  JourneyOption,
  JourneyRewardPool,
  JourneyStage,
  RandomOutcomeVisibility,
  RandomPrecommittedOutcome,
  RandomVisibilityPolicy,
} from "../../manifest.js";
import { getCost } from "../../shared/costs.js";
import { REWARDS } from "../../shared/rewards.js";
import type { Reward, TemplateParams } from "../../shared/types.js";

const PAY_ESSENCE_COST = getCost("pay_essence");

export type SharedRewardOutcome = {
  readonly kind: "shared_reward_template";
  readonly templateId: string;
  readonly params: TemplateParams;
  readonly text: string;
  readonly convertedEssence: number;
};

export type SharedCostOutcome = {
  readonly kind: "shared_cost_template";
  readonly templateId: "pay_essence";
  readonly params: { readonly x: number };
  readonly text: string;
  readonly convertedEssence: number;
};

export type RandomPoolCandidate = {
  readonly key: string;
  readonly text: string;
  readonly payloads: readonly SharedRewardOutcome[];
  readonly value: number;
  readonly weight: number;
};

export function randomVisibility(
  outcomeVisibility: RandomOutcomeVisibility,
  disclosure: string,
  playerVisible: boolean,
  revealTiming?: string,
): RandomVisibilityPolicy {
  return {
    outcomeVisibility,
    disclosure,
    playerVisible,
    ...(revealTiming ? { revealTiming } : {}),
  };
}

export function emptyOption(args: {
  readonly number: number;
  readonly text: string;
  readonly symbols: readonly string[];
  readonly costs?: readonly unknown[];
  readonly effects?: readonly unknown[];
  readonly costConvertedEssence?: number;
  readonly effectConvertedEssence: number;
  readonly uncertaintyConvertedEssence?: number;
}): JourneyOption {
  const costConvertedEssence = args.costConvertedEssence ?? 0;
  const burdenConvertedEssence = 0;
  const uncertaintyConvertedEssence = args.uncertaintyConvertedEssence ?? 0;

  return {
    number: args.number,
    symbols: [...args.symbols],
    text: args.text,
    operations: [],
    costs: [...(args.costs ?? [])],
    effects: [...(args.effects ?? [])],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence,
    effectConvertedEssence: args.effectConvertedEssence,
    burdenConvertedEssence,
    uncertaintyConvertedEssence,
    netConvertedEssence:
      args.effectConvertedEssence -
      costConvertedEssence -
      burdenConvertedEssence +
      uncertaintyConvertedEssence,
    pickBehavior: "record_and_generate_next",
  };
}

export function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

export function stripTerminalPeriod(text: string): string {
  return text.replace(/\.$/u, "");
}

function rewardSubIds(template: Reward, params: TemplateParams): readonly string[] {
  if (template.id === "meta_gain_2_rewards") {
    return (params as { readonly subIds?: readonly string[] }).subIds ?? [];
  }

  return [];
}

function consumedRewardIds(candidate: RandomPoolCandidate): readonly string[] {
  const reward = candidate.payloads[0]!;

  return [
    reward.templateId,
    ...((reward.params as { readonly subIds?: readonly string[] }).subIds ?? []),
  ];
}

function materializeReward(
  context: JourneyContext,
  draw: DrawContext,
  template: Reward,
  attempt: number,
): RandomPoolCandidate | undefined {
  const params = template.rollParams(context, {
    ...draw,
    selectionAttempt:
      ((draw.selectionAttempt ?? 0) * 100) + attempt * 100 + template.id.length,
  }) as TemplateParams;

  if (!template.viable(params, context)) {
    return undefined;
  }

  const cec = template.cec(params, context);
  if (cec <= 0) {
    return undefined;
  }

  const text = template.render(params, context);

  return {
    key: [template.id, ...rewardSubIds(template, params)].join(":"),
    text,
    payloads: [
      {
        kind: "shared_reward_template",
        templateId: template.id,
        params,
        text,
        convertedEssence: cec,
      },
    ],
    value: cec,
    weight: template.weight,
  };
}

function rewardCandidates(
  context: JourneyContext,
  draw: DrawContext,
): readonly RandomPoolCandidate[] {
  const candidates: RandomPoolCandidate[] = [];
  const usedKeys = new Set<string>();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    for (const template of REWARDS) {
      const candidate = materializeReward(context, draw, template, attempt);
      if (!candidate || usedKeys.has(candidate.key)) {
        continue;
      }

      usedKeys.add(candidate.key);
      candidates.push(candidate);
    }
  }

  return candidates;
}

export function weightedRewardPool(args: {
  readonly context: JourneyContext;
  readonly drawContext: DrawContext;
  readonly label: string;
  readonly size: number;
}): RandomPoolCandidate[] {
  const available = [...rewardCandidates(args.context, args.drawContext)];
  const selected: RandomPoolCandidate[] = [];
  const usedIds = new Set<string>();

  while (selected.length < args.size && available.length > 0) {
    const viable = available.filter((candidate) =>
      consumedRewardIds(candidate).every((id) => !usedIds.has(id)),
    );
    if (viable.length === 0) {
      break;
    }

    const chosen = weightedChoice(
      args.drawContext,
      `${args.label}:reward:${selected.length + 1}`,
      viable.map((candidate) => ({ item: candidate, weight: candidate.weight })),
    );

    selected.push(chosen);
    for (const id of consumedRewardIds(chosen)) {
      usedIds.add(id);
    }
    available.splice(available.indexOf(chosen), 1);
  }

  if (selected.length < args.size) {
    throw new Error("single_random_outcome fill could not roll enough viable shared rewards");
  }

  return selected;
}

export function averageValue(candidates: readonly RandomPoolCandidate[]): number {
  return Math.round(
    candidates.reduce((total, candidate) => total + candidate.value, 0) /
      Math.max(1, candidates.length),
  );
}

export function flattenPayloads(
  candidates: readonly RandomPoolCandidate[],
): SharedRewardOutcome[] {
  return candidates.flatMap((candidate) => [...candidate.payloads]);
}

export function visibleRewardPool(args: {
  readonly context: JourneyContext;
  readonly drawContext: DrawContext;
  readonly label: string;
  readonly stage: JourneyStage;
  readonly size: number;
}): {
  readonly candidates: RandomPoolCandidate[];
  readonly rewardPool: JourneyRewardPool;
  readonly visiblePoolEnvelope: RandomPrecommittedOutcome;
} {
  const candidates = weightedRewardPool({ ...args, size: args.size });
  const rewards = flattenPayloads(candidates);
  const poolId = `${args.label}:visible-reward-pool`;
  const summary = `Randomly gain one of ${candidates
    .map((candidate) => stripTerminalPeriod(lowerFirst(candidate.text)))
    .join(", ")}.`;
  const expectedConvertedEssence = averageValue(candidates);

  return {
    candidates,
    rewardPool: {
      summary,
      replacement: "with_replacement",
      operations: [],
      rewards,
    },
    visiblePoolEnvelope: {
      kind: "visible_pool",
      poolId,
      summary,
      rewards,
      replacement: "with_replacement",
      visibilityPolicy: randomVisibility(
        "visible",
        "The full reward pool and replacement policy are visible before choosing.",
        true,
      ),
      expectedConvertedEssence,
      riskPremiumConvertedEssence: -8,
      worstCaseBurdenConvertedEssence: 0,
      presentation: "visible_shared_reward_pool",
    },
  };
}

export function essenceCost(
  context: JourneyContext,
  amount: number,
): SharedCostOutcome {
  const params = { x: amount };

  return {
    kind: "shared_cost_template",
    templateId: "pay_essence",
    params,
    text: PAY_ESSENCE_COST.render(params, context),
    convertedEssence: PAY_ESSENCE_COST.cec(params, context),
  };
}
