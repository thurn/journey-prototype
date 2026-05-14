import { weightedChoice, type DrawContext } from "../../../util/rng.js";
import type {
  BoundedDuration,
  DelayedHookContract,
  HookControlledScene,
  HookExpirationPolicy,
  HookTriggerSelector,
  HookVisibilityPolicy,
  JourneyOption,
} from "../../manifest.js";
import { buildPrecommittedOperations } from "../../operationBuilders.js";
import { REWARDS } from "../../shared/rewards.js";
import type { Reward } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_ID = "now_vs_later";
const DELAYED_REWARD_MULTIPLIER = 1.45;
const DELAYED_REWARD_MINIMUM_GAP = 40;
const DELAYED_REWARD_MAX_RATIO = 5;
const DELAYED_REWARD_MAXIMUM_GAP = 500;

const BROAD_DELAYED_REWARD_IDS = new Set([
  "apply_named_transfiguration_to_all_predicate_cards",
]);

const DEFERRED_IMMEDIATE_REWARD_IDS = new Set([
  "add_site_to_next_dreamscape",
  "boost_site_appearance_chance",
  "card_cost_reduction_for_X_battles",
  "next_X_shop_rerolls_free",
  "opening_hand_grant_for_X_battles",
  "shop_omen_discount",
  "temporary_card_copy_for_X_battles",
  "temporary_dreamsign_for_X_battles",
]);

type RolledReward = {
  readonly template: Reward;
  readonly params: unknown;
  readonly cec: number;
  readonly text: string;
};

type TimingProfile = {
  readonly key: string;
  readonly optionPrefix: string;
  readonly triggerSelector: HookTriggerSelector;
  readonly duration: BoundedDuration;
  readonly expiration: HookExpirationPolicy;
};

const TIMING_PROFILES: readonly TimingProfile[] = [
  {
    key: "next-dreamscape",
    optionPrefix: "At the next dreamscape",
    triggerSelector: {
      triggerKind: "dreamscape",
      label: "the next dreamscape",
      count: 1,
    },
    duration: {
      durationKind: "dreamscape_count",
      count: 1,
      label: "next dreamscape",
    },
    expiration: {
      policyKind: "forfeit_reward",
      label: "If the next dreamscape does not resolve, discard this hook with no reward.",
    },
  },
  {
    key: "two-dreamscapes",
    optionPrefix: "After two dreamscapes",
    triggerSelector: {
      triggerKind: "dreamscape",
      label: "after two dreamscapes",
      count: 2,
    },
    duration: {
      durationKind: "dreamscape_count",
      count: 2,
      label: "within 2 dreamscapes",
    },
    expiration: {
      policyKind: "forfeit_reward",
      label: "If two dreamscapes pass without resolution, discard this hook with no reward.",
    },
  },
  {
    key: "next-victory",
    optionPrefix: "After your next battle victory",
    triggerSelector: {
      triggerKind: "victory",
      label: "your next victory",
      count: 1,
    },
    duration: {
      durationKind: "battle_count",
      count: 2,
      label: "next 2 battles",
    },
    expiration: {
      policyKind: "forfeit_reward",
      label: "If the next 2 battles are not victories, discard this hook with no reward.",
    },
  },
];

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function sentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

function normalizedId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

function rewardSubIds(rolled: RolledReward): readonly string[] {
  if (rolled.template.id === "meta_gain_2_rewards") {
    const params = rolled.params as { subIds?: readonly string[] };
    return params.subIds ?? [];
  }

  return [];
}

function consumedRewardIds(rolled: RolledReward): readonly string[] {
  return [rolled.template.id, ...rewardSubIds(rolled)];
}

function sharesRewardTemplate(left: RolledReward, right: RolledReward): boolean {
  const leftIds = new Set(consumedRewardIds(left));

  return consumedRewardIds(right).some((id) => leftIds.has(id));
}

function hasConsumedRewardId(rolled: RolledReward, excludedIds: ReadonlySet<string>): boolean {
  return consumedRewardIds(rolled).some((id) => excludedIds.has(id));
}

function isImmediateRewardEligible(rolled: RolledReward): boolean {
  return !hasConsumedRewardId(rolled, DEFERRED_IMMEDIATE_REWARD_IDS);
}

function isDelayedRewardEligible(rolled: RolledReward): boolean {
  return !hasConsumedRewardId(rolled, BROAD_DELAYED_REWARD_IDS);
}

function rollRewards(args: ShapeFillArgs): readonly RolledReward[] {
  const { context, drawContext } = args;
  const rewards: RolledReward[] = [];

  for (const template of REWARDS) {
    const params = template.rollParams(context, {
      ...drawContext,
      selectionAttempt:
        ((drawContext.selectionAttempt ?? 0) * 100) + template.id.length,
    });

    if (!template.viable(params, context)) {
      continue;
    }

    const cec = template.cec(params, context);

    if (cec <= 0) {
      continue;
    }

    rewards.push({
      template,
      params,
      cec,
      text: template.render(params, context),
    });
  }

  if (rewards.length < 2) {
    throw new Error("now_vs_later fill requires at least two viable shared rewards");
  }

  return rewards;
}

function pickImmediateReward(
  rewards: readonly RolledReward[],
  drawContext: DrawContext,
): RolledReward {
  const eligibleRewards = rewards.filter(isImmediateRewardEligible);
  const basePool = eligibleRewards.length > 0 ? eligibleRewards : rewards;
  const highestCec = Math.max(...basePool.map((reward) => reward.cec));
  const pool = basePool.filter((reward) => reward.cec <= highestCec / DELAYED_REWARD_MULTIPLIER);
  const candidates = pool.length > 0 ? pool : basePool;

  return weightedChoice(
    drawContext,
    `${SHAPE_ID}:immediate-reward`,
    candidates.map((reward) => ({
      item: reward,
      weight: reward.template.weight,
    })),
  );
}

function pickDelayedReward(
  rewards: readonly RolledReward[],
  immediate: RolledReward,
  drawContext: DrawContext,
): RolledReward {
  const threshold = Math.max(
    immediate.cec * DELAYED_REWARD_MULTIPLIER,
    immediate.cec + DELAYED_REWARD_MINIMUM_GAP,
  );
  const upperBound = Math.max(
    threshold,
    immediate.cec * DELAYED_REWARD_MAX_RATIO,
    immediate.cec + DELAYED_REWARD_MAXIMUM_GAP,
  );
  const distinct = rewards.filter((reward) =>
    isDelayedRewardEligible(reward) && !sharesRewardTemplate(immediate, reward),
  );
  const eligible = distinct.filter((reward) => reward.cec >= threshold && reward.cec <= upperBound);
  const fallback = distinct.length > 0
    ? distinct
    : rewards.filter((reward) => isDelayedRewardEligible(reward));
  const candidates = eligible.length > 0
    ? eligible
    : fallback.filter((reward) => reward.cec > immediate.cec);
  const pool = candidates.length > 0
    ? candidates
    : fallback
      .filter((reward) => reward !== immediate)
      .sort((left, right) => right.cec - left.cec)
      .slice(0, 1);

  if (pool.length === 0) {
    throw new Error("now_vs_later fill could not select a delayed reward");
  }

  return weightedChoice(
    drawContext,
    `${SHAPE_ID}:delayed-reward:${immediate.template.id}`,
    pool.map((reward) => ({
      item: reward,
      weight: reward.template.weight,
    })),
  );
}

function emptyOption(
  number: number,
  text: string,
  symbols: readonly string[],
  effectConvertedEssence: number,
  uncertaintyConvertedEssence = 0,
): JourneyOption {
  const netConvertedEssence = effectConvertedEssence + uncertaintyConvertedEssence;

  return {
    number,
    symbols: [...symbols],
    text,
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence,
    netConvertedEssence,
    pickBehavior: "record_and_generate_next",
  };
}

function rewardPayload(reward: RolledReward, timing: "immediate" | "delayed"): Record<string, unknown> {
  const text = timing === "delayed" ? delayedRewardText(reward) : reward.text;

  return {
    kind: "shared_reward_template",
    templateId: reward.template.id,
    params: reward.params,
    text,
    timing,
    expectedConvertedEssence: reward.cec,
  };
}

function delayedRewardText(reward: RolledReward): string {
  return reward.text.replace(/\bthis dreamscape\b/giu, "the resolving dreamscape");
}

function delayedHookContract(args: {
  readonly reward: RolledReward;
  readonly timing: TimingProfile;
  readonly expectedConvertedEssence: number;
}): DelayedHookContract & Record<string, unknown> {
  const rewardText = lowerFirst(delayedRewardText(args.reward)).replace(/\.$/u, "");
  const controlledScene: HookControlledScene = {
    sceneKind: "reward",
    label: rewardText,
  };
  const visibilityPolicy: HookVisibilityPolicy = {
    outcomeVisibility: "visible",
    disclosure: "The delayed trigger, expiration window, and committed reward are shown before choosing.",
  };

  return {
    kind: "delayed_hook_contract",
    hookId: normalizedId(`${SHAPE_ID}-2-${args.timing.key}-${args.reward.template.id}`),
    optionNumber: 2,
    trigger: args.timing.triggerSelector.label,
    triggerSelector: args.timing.triggerSelector,
    trackedCondition: `Track ${args.timing.triggerSelector.label} for option 2.`,
    resolution: `${args.timing.optionPrefix}, ${rewardText}.`,
    expiration: args.timing.expiration,
    duration: args.timing.duration,
    controlledScene,
    visibilityPolicy,
    hookBudgetCost: 1,
    reward: [rewardPayload(args.reward, "delayed")],
    sourceShapeId: SHAPE_ID,
    timingKey: args.timing.key,
    rewardMetadata: {
      rewardKey: args.reward.template.id,
      baseConvertedEssence: args.reward.cec,
      expectedConvertedEssence: args.expectedConvertedEssence,
      timingMultiplier: DELAYED_REWARD_MULTIPLIER,
    },
  };
}

export function nowVsLaterFill(args: ShapeFillArgs): FilledJourney {
  const rewards = rollRewards(args);
  const immediate = pickImmediateReward(rewards, args.drawContext);
  const delayed = pickDelayedReward(rewards, immediate, args.drawContext);
  const timing = weightedChoice(
    args.drawContext,
    `${SHAPE_ID}:timing`,
    TIMING_PROFILES.map((profile) => ({ item: profile, weight: 1 })),
  );
  const delayedCec = Math.max(
    delayed.cec,
    Math.ceil(immediate.cec * DELAYED_REWARD_MULTIPLIER),
    immediate.cec + DELAYED_REWARD_MINIMUM_GAP,
  );
  const delayedUncertainty = delayedCec - delayed.cec;
  const precommit = delayedHookContract({
    reward: delayed,
    timing,
    expectedConvertedEssence: delayedCec,
  });
  const precommitted = {
    delayed: [precommit],
  };

  return {
    options: [
      emptyOption(
        1,
        sentence(immediate.text),
        ["reward", "now"],
        immediate.cec,
      ),
      emptyOption(
        2,
        sentence(`${timing.optionPrefix}, ${lowerFirst(delayedRewardText(delayed))}`),
        ["reward", "delayed"],
        delayed.cec,
        delayedUncertainty,
      ),
    ],
    precommitted: {
      ...precommitted,
      operations: buildPrecommittedOperations(precommitted),
    },
  };
}
