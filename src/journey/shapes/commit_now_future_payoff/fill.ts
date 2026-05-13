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
import { buildPrecommittedOperations } from "../../operationBuilders.js";
import { COSTS } from "../../shared/costs.js";
import { REWARDS } from "../../shared/rewards.js";
import type { Cost, Reward, TemplateParams } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_ID = "commit_now_future_payoff";
const OPTION_COUNT = 3;
const MIN_REWARD_CEC = 75;
const MIN_NET_CEC = 25;
const MAX_COST_TO_REWARD_RATIO = 0.7;
const INITIAL_NET_SPREAD_LIMIT: Record<JourneyStage, number> = {
  early: 70,
  mid: 90,
  late: 115,
};
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
  "pay_max_essence",
  "purge_all_duplicate_cards",
  "remove_transfiguration_from_card",
  "remove_transfigurations_from_random_predicate",
  "remove_shop_sites_from_next_dreamscapes",
  "remove_dreamsign_sites_from_next_dreamscapes",
]);

const DREAMSIGN_REWARD_IDS = new Set([
  "gain_random_dreamsign",
  "gain_named_dreamsign",
  "choose_1_of_X_dreamsigns",
  "gain_copy_of_random_dreamsign",
  "gain_copy_of_chosen_dreamsign",
  "transform_dreamsign_to_named",
  "temporary_dreamsign_for_X_battles",
]);

const DREAMSIGN_COST_IDS = new Set([
  "purge_named_dreamsign",
  "purge_random_dreamsign",
  "purge_chosen_dreamsign",
  "transform_dreamsign_to_random",
]);

const DREAMWELL_REWARD_IDS = new Set([
  "set_starting_dreamwell_positive",
  "shuffle_positive_dreamwell_cards",
]);

const DREAMWELL_COST_IDS = new Set([
  "set_starting_dreamwell_negative",
  "shuffle_negative_dreamwell_cards",
]);

const CARD_FLOW_REWARD_IDS = new Set([
  "gain_random_predicate_cards",
  "draft_predicate_cards_from_4",
  "take_any_from_predicate_choices",
  "gain_named_card",
  "draft_2_predicate_cards_from_4",
  "draft_predicate_card_with_copies",
  "draft_predicate_card_with_transfiguration",
  "opening_hand_grant_for_X_battles",
  "temporary_card_copy_for_X_battles",
  "duplicate_named_card_X",
  "duplicate_chosen_cards",
  "duplicate_random_predicate",
  "draw_X_and_duplicate_chosen",
]);

const BATTLE_COST_IDS = new Set([
  "battle_reward_reduction_flat",
  "battle_reward_reduction_percent",
  "gain_named_banes_for_X_battles",
]);

const BATTLE_WINDOW_REWARD_IDS = new Set([
  "opening_hand_grant_for_X_battles",
  "temporary_card_copy_for_X_battles",
  "card_cost_reduction_for_X_battles",
  "temporary_dreamsign_for_X_battles",
]);

const PREMIUM_REWARD_IDS = new Set([
  "gain_copy_of_chosen_dreamsign",
  "gain_copy_of_random_dreamsign",
  "set_essence_to_percent_of_max",
  "purge_all_starters",
  "draft_predicate_card_with_copies",
  "draft_predicate_card_with_transfiguration",
]);

const PREMIUM_COST_IDS = new Set([
  "pay_omens",
  "pay_max_essence",
  "pay_all_remaining_essence",
  "pay_percent_essence",
  "purge_random_dreamsign",
  "purge_chosen_dreamsign",
  "purge_named_dreamsign",
  "gain_random_banes",
  "gain_named_banes",
  "lose_max_essence",
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

type RowCandidate = {
  readonly row: CommitmentRow;
  readonly weight: number;
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
    optionPrefix: "If you win within the next 2 battles",
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

function rewardFamilyIds(reward: RolledReward): readonly string[] {
  return consumedRewardIds(reward);
}

function consumedRewardIds(reward: RolledReward): readonly string[] {
  return [reward.template.id, ...rewardSubIds(reward)];
}

function consumedCostIds(cost: RolledCost): readonly string[] {
  return [cost.template.id];
}

function rowNet(row: CommitmentRow): number {
  return row.reward.cec - row.cost.cec;
}

function hasUsedTemplate(ids: readonly string[], used: ReadonlySet<string>): boolean {
  return ids.some((id) => used.has(id));
}

function rememberTemplates(ids: readonly string[], used: Set<string>): void {
  for (const id of ids) {
    used.add(id);
  }
}

function normalizeShapeText(text: string): string {
  return stripLockedPrefix(text)
    .replace(/\bdreamsign\b/giu, "Dreamsign")
    .replace(/\bStarter card\b/gu, "starter card")
    .replace(/\bStarter cards\b/gu, "starter cards")
    .replace(
      /\bShuffle (\d+) ('[^']+') copies into your dreamwell/gu,
      (_match, count: string, cardName: string) =>
        `Shuffle ${count} copies of ${cardName} into your dreamwell`,
    )
    .replace(
      /\bShuffle 1 ('[^']+') into your dreamwell/gu,
      (_match, cardName: string) => `Shuffle 1 copy of ${cardName} into your dreamwell`,
    )
    .replace(
      /\bShuffle (\d+) ('[^']+') into your dreamwell/gu,
      (_match, count: string, cardName: string) =>
        `Shuffle ${count} copies of ${cardName} into your dreamwell`,
    )
    .replace(/\bthis dreamscape\b/giu, "the resolving dreamscape");
}

function clauseForDelayedJoin(text: string): string {
  return text.replace(
    /^Draft 1 of 4 (.+) and apply (.+) to it$/u,
    "Draft 1 of 4 $1, apply $2 to it",
  );
}

function splitSentences(text: string): readonly string[] {
  return text
    .split(/\.\s+/u)
    .map((part) => part.trim().replace(/\.$/u, ""))
    .filter((part) => part.length > 0);
}

function joinDelayedRewardSentences(text: string): string {
  const parts = splitSentences(text).map((part) => lowerFirst(clauseForDelayedJoin(part)));

  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]}, and ${parts[1]}`;

  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

function rewardTextForDelay(reward: RolledReward): string {
  const normalized = normalizeShapeText(reward.text);
  const namedDreamsignText = reward.template.id === "gain_named_dreamsign"
    ? normalized.replace(/^Gain ('[^']+')$/u, "Gain a copy of $1")
    : normalized;

  return joinDelayedRewardSentences(namedDreamsignText);
}

function costTextForCommitment(cost: RolledCost): string {
  const normalized = normalizeShapeText(cost.text);

  return cost.template.id === "purge_named_dreamsign"
    ? normalized.replace(/^Purge ('[^']+')$/u, "Purge Dreamsign $1")
    : normalized;
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

function isDreamsignReward(reward: RolledReward): boolean {
  return rewardFamilyIds(reward).some((id) => DREAMSIGN_REWARD_IDS.has(id));
}

function isDreamsignCost(cost: RolledCost): boolean {
  return consumedCostIds(cost).some((id) => DREAMSIGN_COST_IDS.has(id));
}

function isDreamwellCost(cost: RolledCost): boolean {
  return consumedCostIds(cost).some((id) => DREAMWELL_COST_IDS.has(id));
}

function isDreamwellOrCardFlowReward(reward: RolledReward): boolean {
  return rewardFamilyIds(reward).some((id) =>
    DREAMWELL_REWARD_IDS.has(id) || CARD_FLOW_REWARD_IDS.has(id)
  );
}

function isBattleCost(cost: RolledCost): boolean {
  return consumedCostIds(cost).some((id) => BATTLE_COST_IDS.has(id));
}

function isBattleWindowReward(reward: RolledReward): boolean {
  return rewardFamilyIds(reward).some((id) => BATTLE_WINDOW_REWARD_IDS.has(id));
}

function isPremiumReward(reward: RolledReward): boolean {
  return rewardFamilyIds(reward).some((id) => PREMIUM_REWARD_IDS.has(id));
}

function isPremiumCost(cost: RolledCost): boolean {
  return consumedCostIds(cost).some((id) => PREMIUM_COST_IDS.has(id));
}

function familyPairWeight(cost: RolledCost, reward: RolledReward): number {
  let weight = 1;

  if (isDreamsignCost(cost)) {
    weight *= isDreamsignReward(reward) ? 6 : 0.45;
  }

  if (isDreamwellCost(cost)) {
    weight *= isDreamwellOrCardFlowReward(reward) ? 5 : 0.6;
  }

  if (isBattleCost(cost)) {
    weight *= isBattleWindowReward(reward) ? 4 : 0.8;
  }

  if (isPremiumReward(reward)) {
    weight *= isPremiumCost(cost) ? 1.8 : 0.55;
  }

  return weight;
}

function wouldExceedSpread(
  rows: readonly CommitmentRow[],
  row: CommitmentRow,
  spreadLimit: number,
): boolean {
  const nets = [...rows.map(rowNet), rowNet(row)];

  return Math.max(...nets) - Math.min(...nets) > spreadLimit;
}

function allPairCandidates(
  rewards: readonly RolledReward[],
  costs: readonly RolledCost[],
): readonly RowCandidate[] {
  const candidates: RowCandidate[] = [];

  for (const reward of rewards) {
    for (const cost of costs) {
      if (cost.cec > reward.cec * MAX_COST_TO_REWARD_RATIO) continue;
      if (reward.cec - cost.cec < MIN_NET_CEC) continue;

      candidates.push({
        row: { cost, reward },
        weight: reward.template.weight * cost.template.weight * familyPairWeight(cost, reward),
      });
    }
  }

  return candidates;
}

function filterViableRowCandidates(args: {
  readonly candidates: readonly RowCandidate[];
  readonly rows: readonly CommitmentRow[];
  readonly usedRewards: ReadonlySet<string>;
  readonly usedCosts: ReadonlySet<string>;
  readonly usedCostTexts: ReadonlySet<string>;
  readonly usedRewardFamilies: ReadonlySet<string>;
  readonly spreadLimit: number;
  readonly allowRepeatedDreamsignReward: boolean;
}): readonly RowCandidate[] {
  return args.candidates.filter(({ row }) => {
    if (hasUsedTemplate(consumedRewardIds(row.reward), args.usedRewards)) return false;
    if (hasUsedTemplate(consumedCostIds(row.cost), args.usedCosts)) return false;
    if (args.usedCostTexts.has(row.cost.text)) return false;
    if (!args.allowRepeatedDreamsignReward && isDreamsignReward(row.reward) && args.usedRewardFamilies.has("dreamsign")) {
      return false;
    }
    if (wouldExceedSpread(args.rows, row, args.spreadLimit)) return false;

    return true;
  });
}

function pickCommitmentRows(args: ShapeFillArgs): readonly CommitmentRow[] {
  const rewards = rollRewardCandidates(args);
  const costs = rollCostCandidates(args);
  const candidates = allPairCandidates(rewards, costs);
  const usedRewards = new Set<string>();
  const usedCosts = new Set<string>();
  const usedCostTexts = new Set<string>();
  const usedRewardFamilies = new Set<string>();
  const rows: CommitmentRow[] = [];
  let spreadLimit = INITIAL_NET_SPREAD_LIMIT[args.stage];

  for (let index = 0; index < OPTION_COUNT; index += 1) {
    let pairCandidates: readonly RowCandidate[] = [];
    let allowRepeatedDreamsignReward = false;

    while (pairCandidates.length === 0 && spreadLimit <= INITIAL_NET_SPREAD_LIMIT[args.stage] * 3) {
      pairCandidates = filterViableRowCandidates({
        candidates,
        rows,
        usedRewards,
        usedCosts,
        usedCostTexts,
        usedRewardFamilies,
        spreadLimit,
        allowRepeatedDreamsignReward,
      });

      if (pairCandidates.length > 0) break;
      if (!allowRepeatedDreamsignReward) {
        allowRepeatedDreamsignReward = true;
      } else {
        spreadLimit += 25;
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
    if (isDreamsignReward(row.reward)) {
      usedRewardFamilies.add("dreamsign");
    }
  }

  return rows;
}

function costPayload(cost: RolledCost): SharedCostPayload {
  return {
    kind: "shared_cost_template",
    templateId: cost.template.id,
    params: cost.params,
    text: costTextForCommitment(cost),
    timing: "immediate",
    convertedEssence: cost.cec,
  };
}

function rewardPayload(reward: RolledReward): SharedRewardPayload {
  return {
    kind: "shared_reward_template",
    templateId: reward.template.id,
    params: reward.params,
    text: rewardTextForDelay(reward),
    timing: "delayed",
    convertedEssence: reward.cec,
  };
}

function delayedHookContract(args: {
  readonly optionNumber: number;
  readonly row: CommitmentRow;
  readonly timing: TimingProfile;
}): DelayedHookContract & Record<string, unknown> {
  const rewardText = lowerFirst(rewardTextForDelay(args.row.reward)).replace(/\.$/u, "");
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
  const costText = lowerFirst(costTextForCommitment(row.cost));
  const rewardText = lowerFirst(rewardTextForDelay(row.reward));

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
  const precommitted = {
    delayed: rows.map((row, index) =>
      delayedHookContract({
        optionNumber: index + 1,
        row,
        timing,
      })
    ),
  };

  return {
    options: rows.map((row, index) => commitmentOption(index + 1, row, timing)),
    precommitted: {
      ...precommitted,
      operations: buildPrecommittedOperations(precommitted),
    },
  };
}
