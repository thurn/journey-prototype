import type { JourneyContext } from "../../../quest/context.js";
import { drawInt, weightedChoice, type DrawContext } from "../../../util/rng.js";
import type {
  JourneyRewardPool,
  JourneyStage,
  JourneyTree,
  JourneyTreeBranch,
  RandomPrecommittedOutcome,
  RandomPoolReplacementPolicy,
} from "../../manifest.js";
import { buildPrecommittedOperations } from "../../operationBuilders.js";
import { getCost } from "../../shared/costs.js";
import { cardMatches } from "../../shared/content.js";
import { getPredicate } from "../../shared/predicates.js";
import { REWARDS } from "../../shared/rewards.js";
import type { Reward, TemplateParams } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const LEVEL_COUNT_BANDS = {
  early: [3],
  mid: [3, 4],
  late: [3, 4],
} as const satisfies Record<JourneyStage, readonly number[]>;

const POOL_SIZE_BANDS = {
  early: [5],
  mid: [5, 6],
  late: [6],
} as const satisfies Record<JourneyStage, readonly number[]>;

const MIN_DRAW_COST_BY_STAGE = {
  early: 35,
  mid: 45,
  late: 55,
} as const satisfies Record<JourneyStage, number>;
const DRAW_COST_STEP = 5;
const MIN_POOL_REWARD_CEC = 35;
const MAX_POOL_REWARD_CEC_BY_STAGE = {
  early: 130,
  mid: 260,
  late: 460,
} as const satisfies Record<JourneyStage, number>;
const LEVEL_COST_STEP_BY_STAGE = {
  early: 15,
  mid: 20,
  late: 25,
} as const satisfies Record<JourneyStage, number>;
const POOL_ID = "random-pool-draws";
const PAY_ESSENCE = getCost("pay_essence");

const EXCLUDED_TEMPLATE_IDS = new Set([
  "apply_named_transfiguration_to_all_predicate_cards",
  "gain_essence_random_range",
  "gain_random_dreamsign",
  "meta_gain_2_rewards",
  "purge_X_banes",
  "purge_all_banes",
  "replace_site_type",
]);

const EARLY_EXCLUDED_TEMPLATE_IDS = new Set([
  "apply_chosen_transfiguration_to_chosen_card",
  "boost_site_appearance_chance",
  "draw_X_and_duplicate_chosen",
  "draft_2_predicate_cards_from_4",
  "draft_predicate_card_with_copies",
  "draft_predicate_card_with_transfiguration",
  "gain_copy_of_chosen_dreamsign",
  "gain_copy_of_random_dreamsign",
  "gain_essence_to_max",
  "increase_max_essence",
  "set_essence_to_percent_of_max",
  "shop_essence_discount",
  "transform_chosen_predicate_into_named",
  "transform_dreamsign_to_named",
]);

const MID_EXCLUDED_TEMPLATE_IDS = new Set([
  "gain_copy_of_chosen_dreamsign",
  "gain_copy_of_random_dreamsign",
  "gain_essence_to_max",
]);

const NESTED_RANDOM_TEMPLATE_IDS = new Set([
  "apply_named_transfiguration_to_random_predicate_cards",
  "apply_random_transfigurations_to_random_cards",
  "duplicate_random_predicate",
  "gain_random_predicate_cards",
  "modify_random_cards_to_types",
  "purge_random_starter",
  "purge_random_starter_with_predicate_replacement",
  "temporary_dreamsign_for_X_battles",
  "transfigure_all_starters",
  "transfigure_random_starters",
]);

const DECK_TARGETED_PREDICATE_TEMPLATE_IDS = new Set([
  "apply_named_transfiguration_to_chosen_predicate_cards",
  "apply_named_transfiguration_to_random_predicate_cards",
  "card_cost_reduction_for_X_battles",
  "duplicate_random_predicate",
  "purge_chosen_predicate_cards",
  "purge_chosen_predicate_with_replacement",
  "transform_chosen_predicate_into_named",
]);

type SharedRewardOutcome = {
  readonly kind: "shared_reward_template";
  readonly templateId: string;
  readonly params: TemplateParams;
  readonly text: string;
  readonly convertedEssence: number;
};

type PoolCandidate = {
  readonly key: string;
  readonly poolIndex: number;
  readonly template: Reward;
  readonly params: TemplateParams;
  readonly text: string;
  readonly payload: SharedRewardOutcome;
  readonly convertedEssence: number;
  readonly weight: number;
  readonly nestedRandom: boolean;
};

function pickVariant<T>(
  draw: DrawContext,
  label: string,
  variants: readonly T[],
): T {
  return variants[drawInt(draw, label, 0, variants.length - 1)]!;
}

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function stripTerminalPeriod(text: string): string {
  return text.replace(/\.$/u, "");
}

function templateSubIds(templateId: string, params: TemplateParams): readonly string[] {
  if (templateId === "meta_gain_2_rewards") {
    return (params as { readonly subIds?: readonly string[] }).subIds ?? [];
  }

  return [];
}

function paramsRecord(params: TemplateParams): Record<string, unknown> {
  return params as Record<string, unknown>;
}

function numericParam(params: TemplateParams, key: string): number | undefined {
  const value = paramsRecord(params)[key];

  return typeof value === "number" ? value : undefined;
}

function predicateIdParam(params: TemplateParams): string | undefined {
  const value = paramsRecord(params).predicateId;

  return typeof value === "string" ? value : undefined;
}

function deckHasPredicateTargets(
  context: JourneyContext,
  params: TemplateParams,
): boolean {
  const predicateId = predicateIdParam(params);
  if (!predicateId) {
    return true;
  }

  const predicate = getPredicate(predicateId);
  const needed = numericParam(params, "count") ?? 1;

  return cardMatches(context, {
    ...(predicate.cardPredicate ?? {}),
    source: "deck",
  }).length >= needed;
}

function rewardAllowedForStage(args: {
  readonly context: JourneyContext;
  readonly stage: JourneyStage;
  readonly templateId: string;
  readonly params: TemplateParams;
}): boolean {
  if (EXCLUDED_TEMPLATE_IDS.has(args.templateId)) {
    return false;
  }

  if (DECK_TARGETED_PREDICATE_TEMPLATE_IDS.has(args.templateId) &&
    !deckHasPredicateTargets(args.context, args.params)
  ) {
    return false;
  }

  if (args.templateId === "shop_omen_discount" &&
    (numericParam(args.params, "count") ?? 1) > 1 &&
    args.stage === "early"
  ) {
    return false;
  }

  if (args.templateId === "take_any_from_predicate_choices" &&
    (numericParam(args.params, "choices") ?? 0) > 3 &&
    args.stage === "early"
  ) {
    return false;
  }

  if (args.templateId === "duplicate_chosen_cards" &&
    (numericParam(args.params, "count") ?? 1) > (args.stage === "late" ? 2 : 1)
  ) {
    return false;
  }

  if (args.templateId === "duplicate_named_card_X" &&
    (numericParam(args.params, "count") ?? 1) > (args.stage === "late" ? 2 : 1)
  ) {
    return false;
  }

  if (args.templateId === "transfigure_random_starters" &&
    (numericParam(args.params, "count") ?? 1) > (args.stage === "early" ? 1 : 2)
  ) {
    return false;
  }

  if (args.templateId === "apply_random_transfigurations_to_random_cards" &&
    (numericParam(args.params, "count") ?? 1) > (args.stage === "late" ? 2 : 1)
  ) {
    return false;
  }

  if (args.templateId === "make_random_cards_reclaim" &&
    (numericParam(args.params, "count") ?? 1) > (args.stage === "late" ? 2 : 1)
  ) {
    return false;
  }

  if (args.templateId === "increase_max_essence" &&
    (numericParam(args.params, "amount") ?? 0) > (args.stage === "late" ? 100 : 75)
  ) {
    return false;
  }

  if (args.templateId === "gain_omens" &&
    (numericParam(args.params, "x") ?? 1) > (args.stage === "late" ? 2 : 1)
  ) {
    return false;
  }

  if (args.stage === "early" && EARLY_EXCLUDED_TEMPLATE_IDS.has(args.templateId)) {
    return false;
  }

  if (args.stage === "mid" && MID_EXCLUDED_TEMPLATE_IDS.has(args.templateId)) {
    return false;
  }

  return true;
}

function consumedTemplateIds(candidate: PoolCandidate): readonly string[] {
  return [
    candidate.template.id,
    ...templateSubIds(candidate.template.id, candidate.params),
  ];
}

function materializeReward(
  context: JourneyContext,
  draw: DrawContext,
  stage: JourneyStage,
  template: Reward,
  attempt: number,
): PoolCandidate | undefined {
  const params = template.rollParams(context, {
    ...draw,
    selectionAttempt:
      (draw.selectionAttempt ?? 0) * 1000 + attempt * 100 + template.id.length,
  }) as TemplateParams;

  if (!template.viable(params as never, context)) {
    return undefined;
  }

  const convertedEssence = template.cec(params as never, context);
  if (
    convertedEssence < MIN_POOL_REWARD_CEC ||
    convertedEssence > MAX_POOL_REWARD_CEC_BY_STAGE[stage]
  ) {
    return undefined;
  }

  if (!rewardAllowedForStage({
    context,
    stage,
    templateId: template.id,
    params,
  })) {
    return undefined;
  }

  const text = template.render(params as never, context);
  const key = [template.id, ...templateSubIds(template.id, params)].join(":");

  return {
    key,
    poolIndex: 0,
    template,
    params,
    text,
    payload: {
      kind: "shared_reward_template",
      templateId: template.id,
      params,
      text,
      convertedEssence,
    },
    convertedEssence,
    weight: template.weight,
    nestedRandom: NESTED_RANDOM_TEMPLATE_IDS.has(template.id),
  };
}

function rewardCandidates(
  context: JourneyContext,
  draw: DrawContext,
  stage: JourneyStage,
): PoolCandidate[] {
  const candidates: PoolCandidate[] = [];
  const usedKeys = new Set<string>();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    for (const template of REWARDS) {
      const candidate = materializeReward(context, draw, stage, template, attempt);
      if (!candidate || usedKeys.has(candidate.key)) {
        continue;
      }

      usedKeys.add(candidate.key);
      candidates.push(candidate);
    }
  }

  return candidates;
}

function selectRewardPool(args: {
  readonly context: JourneyContext;
  readonly drawContext: DrawContext;
  readonly stage: JourneyStage;
  readonly size: number;
}): PoolCandidate[] {
  const available = rewardCandidates(args.context, args.drawContext, args.stage);
  const selected: PoolCandidate[] = [];
  const usedIds = new Set<string>();

  while (selected.length < args.size && available.length > 0) {
    const viable = available.filter((candidate) =>
      consumedTemplateIds(candidate).every((id) => !usedIds.has(id)) &&
      (!candidate.nestedRandom || !selected.some((entry) => entry.nestedRandom)),
    );
    if (viable.length === 0) {
      break;
    }

    const chosen = weightedChoice(
      args.drawContext,
      `random_pool_draws:pool:${selected.length + 1}`,
      viable.map((candidate) => ({ item: candidate, weight: candidate.weight })),
    );

    selected.push({ ...chosen, poolIndex: selected.length + 1 });
    for (const id of consumedTemplateIds(chosen)) {
      usedIds.add(id);
    }
    available.splice(available.indexOf(chosen), 1);
  }

  if (selected.length < Math.min(3, args.size)) {
    throw new Error("random_pool_draws fill could not roll enough viable shared rewards");
  }

  return selected;
}

function averageConvertedEssence(candidates: readonly PoolCandidate[]): number {
  return Math.round(
    candidates.reduce((total, candidate) => total + candidate.convertedEssence, 0) /
      Math.max(1, candidates.length),
  );
}

function strongestConvertedEssence(candidates: readonly PoolCandidate[]): number {
  return Math.max(...candidates.map((candidate) => candidate.convertedEssence));
}

function roundCost(value: number): number {
  return Math.max(
    DRAW_COST_STEP,
    Math.round(value / DRAW_COST_STEP) * DRAW_COST_STEP,
  );
}

function costAmountsForDraws(
  context: JourneyContext,
  stage: JourneyStage,
  averageReward: number,
  strongestReward: number,
  levelCount: number,
): readonly number[] {
  const availableEssence = Math.max(0, context.state.quest.resources.essence);
  const baseTarget = Math.max(
    MIN_DRAW_COST_BY_STAGE[stage],
    strongestReward * 0.55 + averageReward * 0.2,
  );
  const affordableBase = availableEssence >= MIN_DRAW_COST_BY_STAGE[stage]
    ? Math.min(baseTarget, Math.max(MIN_DRAW_COST_BY_STAGE[stage], availableEssence * 0.75))
    : baseTarget;

  return Array.from({ length: levelCount }, (_, index) =>
    roundCost(affordableBase + index * LEVEL_COST_STEP_BY_STAGE[stage]),
  );
}

function replacementSentence(replacement: RandomPoolReplacementPolicy): string {
  return replacement === "with_replacement"
    ? "Outcomes draw with replacement."
    : "Outcomes draw without replacement.";
}

function outcomeLabel(candidate: PoolCandidate): string {
  return `#${candidate.poolIndex} ${stripTerminalPeriod(lowerFirst(candidate.text))}`;
}

function poolSummary(
  candidates: readonly PoolCandidate[],
  replacement: RandomPoolReplacementPolicy,
): string {
  return [
    "Randomly gain one:",
    ...candidates.map((candidate) => `${candidate.poolIndex}. ${stripTerminalPeriod(candidate.text)}`),
    `Replacement policy: ${replacementSentence(replacement)}`,
  ].join("\n");
}

function visiblePoolDebugSummary(candidates: readonly PoolCandidate[]): string {
  return [
    "Randomly gain one:",
    ...candidates.map((candidate) => `${candidate.poolIndex}. ${stripTerminalPeriod(candidate.text)}`),
    "Replacement policy:",
  ].join("\n");
}

function pickCommittedDraws(args: {
  readonly drawContext: DrawContext;
  readonly candidates: readonly PoolCandidate[];
  readonly drawCount: number;
  readonly replacement: RandomPoolReplacementPolicy;
}): readonly SharedRewardOutcome[][] {
  if (args.replacement === "with_replacement") {
    return Array.from({ length: args.drawCount }, (_, index) => {
      const picked = weightedChoice(
        args.drawContext,
        `random_pool_draws:committed:${index + 1}`,
        args.candidates.map((candidate) => ({
          item: candidate,
          weight: candidate.weight,
        })),
      );

      return [picked.payload];
    });
  }

  const available = [...args.candidates];
  const committed: SharedRewardOutcome[][] = [];

  while (committed.length < args.drawCount && available.length > 0) {
    const picked = weightedChoice(
      args.drawContext,
      `random_pool_draws:committed:${committed.length + 1}`,
      available.map((candidate) => ({
        item: candidate,
        weight: candidate.weight,
      })),
    );

    committed.push([picked.payload]);
    available.splice(available.indexOf(picked), 1);
  }

  return committed;
}

function emptyTerminal(outcome: "claim" | "leave", text: string) {
  return {
    text,
    outcome,
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    routeEffects: [],
  };
}

function stopBranch(level: number): JourneyTreeBranch {
  return {
    id: `level-${level}-stop`,
    label: "Stop",
    kind: "player_choice",
    text: "Leave.",
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence: 0,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: 0,
    terminal: emptyTerminal("leave", "Leave."),
  };
}

function drawBranch(args: {
  readonly context: JourneyContext;
  readonly level: number;
  readonly levelCount: number;
  readonly costAmount: number;
  readonly averageReward: number;
  readonly replacement: RandomPoolReplacementPolicy;
}): JourneyTreeBranch {
  const final = args.level === args.levelCount;
  const replacementText = args.replacement === "with_replacement"
    ? "with replacement"
    : "without replacement";
  const text = `Pay ${args.costAmount} essence and gain one random reward from the visible pool ${replacementText}. ${
    final ? "End the Journey." : `Go to Level ${args.level + 1}.`
  }`;
  const costConvertedEssence = PAY_ESSENCE.cec(
    { x: args.costAmount },
    args.context,
  );
  const uncertaintyConvertedEssence = args.replacement === "with_replacement" ? -12 : -8;

  return {
    id: `level-${args.level}-draw`,
    label: "Draw",
    kind: "player_choice",
    text,
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence,
    effectConvertedEssence: args.averageReward,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence,
    netConvertedEssence:
      args.averageReward - costConvertedEssence + uncertaintyConvertedEssence,
    ...(final
      ? { terminal: emptyTerminal("claim", "End the Journey.") }
      : { nextNodeId: `level-${args.level + 1}` }),
  };
}

function buildTree(args: {
  readonly context: JourneyContext;
  readonly levelCount: number;
  readonly costAmounts: readonly number[];
  readonly averageReward: number;
  readonly replacement: RandomPoolReplacementPolicy;
}): JourneyTree {
  return {
    rootNodeId: "level-1",
    nodes: Array.from({ length: args.levelCount }, (_, index) => {
      const level = index + 1;

      return {
        id: `level-${level}`,
        levelLabel: `Level ${level}`,
        branches: [
          stopBranch(level),
          drawBranch({
            context: args.context,
            level,
            levelCount: args.levelCount,
            costAmount: args.costAmounts[index]!,
            averageReward: args.averageReward,
            replacement: args.replacement,
          }),
        ],
      };
    }),
  };
}

export function randomPoolDrawsFill(args: ShapeFillArgs): FilledJourney {
  const levelCount = pickVariant(
    args.drawContext,
    "random_pool_draws:levels",
    LEVEL_COUNT_BANDS[args.stage],
  );
  const poolSize = pickVariant(
    args.drawContext,
    "random_pool_draws:pool-size",
    POOL_SIZE_BANDS[args.stage],
  );
  const candidates = selectRewardPool({
    context: args.context,
    drawContext: args.drawContext,
    stage: args.stage,
    size: poolSize,
  });
  const averageReward = averageConvertedEssence(candidates);
  const strongestReward = strongestConvertedEssence(candidates);
  const costAmounts = costAmountsForDraws(
    args.context,
    args.stage,
    averageReward,
    strongestReward,
    levelCount,
  );
  const replacement = pickVariant(
    args.drawContext,
    "random_pool_draws:replacement",
    ["with_replacement", "without_replacement"] as const,
  );
  const summary = poolSummary(candidates, replacement);
  const debugVisibleSummary = visiblePoolDebugSummary(candidates);
  const rewards = candidates.map((candidate) => candidate.payload);
  const committedDraws = pickCommittedDraws({
    drawContext: args.drawContext,
    candidates,
    drawCount: levelCount,
    replacement,
  });
  const committedLabels = committedDraws.map((draws) => {
    const [draw] = draws;
    const candidate = candidates.find((entry) => entry.payload === draw);

    return candidate ? outcomeLabel(candidate) : "unknown outcome";
  });
  const rewardPool: JourneyRewardPool = {
    summary,
    replacement,
    operations: [],
    rewards,
  };
  const visiblePool: RandomPrecommittedOutcome = {
    kind: "visible_pool",
    poolId: POOL_ID,
    summary: debugVisibleSummary,
    rewards,
    replacement,
    visibilityPolicy: {
      outcomeVisibility: "visible",
      disclosure:
        "The full reward pool and replacement policy are visible before drawing",
      playerVisible: true,
    },
    expectedConvertedEssence: averageReward,
    riskPremiumConvertedEssence: replacement === "with_replacement" ? -8 : -5,
    worstCaseBurdenConvertedEssence: 0,
    presentation: "random_pool_draws_visible_pool",
  };
  const repeatedDraws: RandomPrecommittedOutcome = {
    kind: "repeated_pool_draws",
    poolId: POOL_ID,
    drawCount: levelCount,
    rewards,
    committedDraws,
    replacement,
    visibilityPolicy: {
      outcomeVisibility: "pre_rolled",
      disclosure:
        `Committed draw order: ${committedLabels.join(" -> ")}`,
      playerVisible: true,
    },
    expectedConvertedEssence: averageReward * levelCount,
    riskPremiumConvertedEssence: replacement === "with_replacement" ? -12 : -8,
    worstCaseBurdenConvertedEssence: 0,
    presentation: "random_pool_draws_repeated_draws",
  };
  const precommitted = {
    random: [visiblePool, repeatedDraws],
  };

  return {
    options: [],
    tree: buildTree({
      context: args.context,
      levelCount,
      costAmounts,
      averageReward,
      replacement,
    }),
    rewardPool,
    precommitted: {
      ...precommitted,
      operations: buildPrecommittedOperations(precommitted),
    },
  };
}
