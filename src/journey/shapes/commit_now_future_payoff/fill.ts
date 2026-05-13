import { weightedChoice, type DrawContext } from "../../../util/rng.js";
import type {
  BoundedDuration,
  DelayedHookContract,
  HookControlledScene,
  HookExpirationPolicy,
  HookTriggerSelector,
  HookVisibilityPolicy,
  JourneyOption,
  JourneyStage,
} from "../../manifest.js";
import { COSTS } from "../../shared/costs.js";
import { REWARDS } from "../../shared/rewards.js";
import type { Cost, Reward, TemplateParams } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_ID = "commit_now_future_payoff";
const OPTION_COUNT = 3;
const MIN_REWARD_CEC = 75;
const MIN_NET_CEC = 25;
const MAX_COST_TO_REWARD_RATIO = 0.7;
const REWARD_STAGE_CEILINGS: Record<JourneyStage, number> = {
  early: 300,
  mid: 440,
  late: 620,
};

const EXCLUDED_REWARD_IDS = new Set([
  "apply_named_transfiguration_to_all_predicate_cards",
]);

const EXCLUDED_COST_IDS = new Set([
  "gain_random_cards_from_pool",
  "gain_additional_starters",
  "meta_pay_2_costs",
  "remove_shop_sites_from_next_dreamscapes",
  "remove_dreamsign_sites_from_next_dreamscapes",
]);

type RolledReward = {
  readonly template: Reward;
  readonly params: TemplateParams;
  readonly cec: number;
  readonly text: string;
};

type RolledCost = {
  readonly template: Cost;
  readonly params: TemplateParams;
  readonly cec: number;
  readonly text: string;
};

type CommitmentRow = {
  readonly cost: RolledCost;
  readonly reward: RolledReward;
};

type TimingProfile = {
  readonly key: string;
  readonly optionPrefix: string;
  readonly triggerSelector: HookTriggerSelector;
  readonly duration: BoundedDuration;
  readonly expiration: HookExpirationPolicy;
};

type SharedRewardPayload = {
  readonly kind: "shared_reward_template";
  readonly templateId: string;
  readonly params: TemplateParams;
  readonly text: string;
  readonly timing: "delayed";
  readonly convertedEssence: number;
};

type SharedCostPayload = {
  readonly kind: "shared_cost_template";
  readonly templateId: string;
  readonly params: TemplateParams;
  readonly text: string;
  readonly timing: "immediate";
  readonly convertedEssence: number;
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
    key: "next-victory",
    optionPrefix: "After your next victory",
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
      label: "If you do not win within 2 battles, discard this hook with no reward.",
    },
  },
  {
    key: "two-battles",
    optionPrefix: "After two battles",
    triggerSelector: {
      triggerKind: "battle",
      label: "after two battles",
      count: 2,
    },
    duration: {
      durationKind: "battle_count",
      count: 2,
      label: "next 2 battles",
    },
    expiration: {
      policyKind: "forfeit_reward",
      label: "If two battles do not resolve, discard this hook with no reward.",
    },
  },
];

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function sentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

function stripLockedPrefix(text: string): string {
  return text.replace(/\[LOCKED\]\s*/gu, "");
}

function normalizedId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

function drawFor(base: DrawContext, group: number, attempt: number): DrawContext {
  return {
    ...base,
    sequenceStep: (base.sequenceStep ?? 0) * 100 + group,
    selectionAttempt: (base.selectionAttempt ?? 0) * 1000 + attempt,
  };
}

function rewardSubIds(reward: RolledReward): readonly string[] {
  if (reward.template.id === "meta_gain_2_rewards") {
    const params = reward.params as { readonly subIds?: readonly string[] };

    return params.subIds ?? [];
  }

  return [];
}

function consumedRewardIds(reward: RolledReward): readonly string[] {
  return [reward.template.id, ...rewardSubIds(reward)];
}

function consumedCostIds(cost: RolledCost): readonly string[] {
  return [cost.template.id];
}

function hasUsedTemplate(ids: readonly string[], used: ReadonlySet<string>): boolean {
  return ids.some((id) => used.has(id));
}

function rememberTemplates(ids: readonly string[], used: Set<string>): void {
  for (const id of ids) {
    used.add(id);
  }
}

function rewardTextForDelay(text: string): string {
  return stripLockedPrefix(text).replace(/\bthis dreamscape\b/giu, "the resolving dreamscape");
}

function rewardFitsShape(reward: RolledReward, stage: JourneyStage): boolean {
  if (reward.cec < MIN_REWARD_CEC) return false;
  if (reward.cec > REWARD_STAGE_CEILINGS[stage]) return false;

  return consumedRewardIds(reward).every((id) => !EXCLUDED_REWARD_IDS.has(id));
}

function costFitsShape(cost: RolledCost): boolean {
  if (cost.cec <= 0) return false;
  if (cost.text.includes("[LOCKED]")) return false;

  return consumedCostIds(cost).every((id) => !EXCLUDED_COST_IDS.has(id));
}

function rollRewardCandidates(args: ShapeFillArgs): readonly RolledReward[] {
  const candidates: RolledReward[] = [];

  for (const template of REWARDS) {
    const params = template.rollParams(
      args.context,
      drawFor(args.drawContext, 1, template.id.length),
    ) as TemplateParams;

    if (!template.viable(params as never, args.context)) continue;

    const reward = {
      template,
      params,
      cec: template.cec(params as never, args.context),
      text: template.render(params as never, args.context),
    };

    if (!rewardFitsShape(reward, args.stage)) continue;
    candidates.push(reward);
  }

  if (candidates.length < OPTION_COUNT) {
    throw new Error(`${SHAPE_ID} fill could not roll enough viable shared rewards`);
  }

  return candidates;
}

function rollCostCandidates(args: ShapeFillArgs): readonly RolledCost[] {
  const candidates: RolledCost[] = [];

  for (const template of COSTS) {
    const params = template.rollParams(
      args.context,
      drawFor(args.drawContext, 2, template.id.length),
    ) as TemplateParams;

    if (!template.viable(params as never, args.context)) continue;

    const cost = {
      template,
      params,
      cec: template.cec(params as never, args.context),
      text: template.render(params as never, args.context),
    };

    if (!costFitsShape(cost)) continue;
    candidates.push(cost);
  }

  if (candidates.length < OPTION_COUNT) {
    throw new Error(`${SHAPE_ID} fill could not roll enough viable shared costs`);
  }

  return candidates;
}

function pickCommitmentRows(args: ShapeFillArgs): readonly CommitmentRow[] {
  const rewards = rollRewardCandidates(args);
  const costs = rollCostCandidates(args);
  const usedRewards = new Set<string>();
  const usedCosts = new Set<string>();
  const usedCostTexts = new Set<string>();
  const rows: CommitmentRow[] = [];

  for (let index = 0; index < OPTION_COUNT; index += 1) {
    const pairCandidates: Array<{ readonly row: CommitmentRow; readonly weight: number }> = [];

    for (const reward of rewards) {
      if (hasUsedTemplate(consumedRewardIds(reward), usedRewards)) continue;

      for (const cost of costs) {
        if (hasUsedTemplate(consumedCostIds(cost), usedCosts)) continue;
        if (usedCostTexts.has(cost.text)) continue;
        if (cost.cec > reward.cec * MAX_COST_TO_REWARD_RATIO) continue;
        if (reward.cec - cost.cec < MIN_NET_CEC) continue;

        pairCandidates.push({
          row: { cost, reward },
          weight: reward.template.weight * cost.template.weight,
        });
      }
    }

    if (pairCandidates.length === 0) {
      throw new Error(`${SHAPE_ID} fill could not pair commitment option ${index + 1}`);
    }

    const row = weightedChoice(
      args.drawContext,
      `${SHAPE_ID}:pair:${index}`,
      pairCandidates.map((candidate) => ({
        item: candidate.row,
        weight: candidate.weight,
      })),
    );

    rows.push(row);
    rememberTemplates(consumedRewardIds(row.reward), usedRewards);
    rememberTemplates(consumedCostIds(row.cost), usedCosts);
    usedCostTexts.add(row.cost.text);
  }

  return rows;
}

function costPayload(cost: RolledCost): SharedCostPayload {
  return {
    kind: "shared_cost_template",
    templateId: cost.template.id,
    params: cost.params,
    text: stripLockedPrefix(cost.text),
    timing: "immediate",
    convertedEssence: cost.cec,
  };
}

function rewardPayload(reward: RolledReward): SharedRewardPayload {
  return {
    kind: "shared_reward_template",
    templateId: reward.template.id,
    params: reward.params,
    text: rewardTextForDelay(reward.text),
    timing: "delayed",
    convertedEssence: reward.cec,
  };
}

function delayedHookContract(args: {
  readonly optionNumber: number;
  readonly row: CommitmentRow;
  readonly timing: TimingProfile;
}): DelayedHookContract & Record<string, unknown> {
  const rewardText = lowerFirst(rewardTextForDelay(args.row.reward.text)).replace(/\.$/u, "");
  const controlledScene: HookControlledScene = {
    sceneKind: "reward",
    label: rewardText,
  };
  const visibilityPolicy: HookVisibilityPolicy = {
    outcomeVisibility: "visible",
    disclosure: "The immediate commitment, delayed trigger, expiration window, and future payoff are shown before choosing.",
  };

  return {
    kind: "delayed_hook_contract",
    hookId: normalizedId(
      `${SHAPE_ID}-${args.optionNumber}-${args.timing.key}-${args.row.reward.template.id}`,
    ),
    optionNumber: args.optionNumber,
    trigger: args.timing.triggerSelector.label,
    triggerSelector: args.timing.triggerSelector,
    trackedCondition: `Track ${args.timing.triggerSelector.label} for option ${args.optionNumber}.`,
    resolution: `${args.timing.optionPrefix}, ${rewardText}.`,
    expiration: args.timing.expiration,
    duration: args.timing.duration,
    controlledScene,
    visibilityPolicy,
    hookBudgetCost: 1,
    cost: [costPayload(args.row.cost)],
    reward: [rewardPayload(args.row.reward)],
    sourceShapeId: SHAPE_ID,
    timingKey: args.timing.key,
    payoffMetadata: {
      costTemplateId: args.row.cost.template.id,
      rewardTemplateId: args.row.reward.template.id,
      costConvertedEssence: args.row.cost.cec,
      rewardConvertedEssence: args.row.reward.cec,
      netConvertedEssence: args.row.reward.cec - args.row.cost.cec,
    },
  };
}

function commitmentOption(
  number: number,
  row: CommitmentRow,
  timing: TimingProfile,
): JourneyOption {
  const costText = lowerFirst(stripLockedPrefix(row.cost.text));
  const rewardText = lowerFirst(rewardTextForDelay(row.reward.text));

  return {
    number,
    symbols: ["commitment", "cost", "future", "reward"],
    text: `${sentence(`Commit now: ${costText}`)} ${sentence(`${timing.optionPrefix}, ${rewardText}`)}`,
    operations: [],
    costs: [costPayload(row.cost)],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: row.cost.cec,
    effectConvertedEssence: row.reward.cec,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: row.reward.cec - row.cost.cec,
    pickBehavior: "record_and_generate_next",
  };
}

export function commitNowFuturePayoffFill(args: ShapeFillArgs): FilledJourney {
  const rows = pickCommitmentRows(args);
  const timing = weightedChoice(
    args.drawContext,
    `${SHAPE_ID}:timing`,
    TIMING_PROFILES.map((profile) => ({ item: profile, weight: 1 })),
  );

  return {
    options: rows.map((row, index) => commitmentOption(index + 1, row, timing)),
    precommitted: {
      delayed: rows.map((row, index) =>
        delayedHookContract({
          optionNumber: index + 1,
          row,
          timing,
        })
      ),
    },
  };
}
