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
import { getCost } from "../../shared/costs.js";
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

const MIN_DRAW_COST = 25;
const DRAW_COST_STEP = 5;
const MIN_POOL_REWARD_CEC = 35;
const MAX_POOL_REWARD_CEC_BY_STAGE = {
  early: 220,
  mid: 320,
  late: 460,
} as const satisfies Record<JourneyStage, number>;
const POOL_ID = "random-pool-draws";
const PAY_ESSENCE = getCost("pay_essence");

type SharedRewardOutcome = {
  readonly kind: "shared_reward_template";
  readonly templateId: string;
  readonly params: TemplateParams;
  readonly text: string;
  readonly convertedEssence: number;
};

type PoolCandidate = {
  readonly key: string;
  readonly template: Reward;
  readonly params: TemplateParams;
  readonly text: string;
  readonly payload: SharedRewardOutcome;
  readonly convertedEssence: number;
  readonly weight: number;
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

  const text = template.render(params as never, context);
  const key = [template.id, ...templateSubIds(template.id, params)].join(":");

  return {
    key,
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
      consumedTemplateIds(candidate).every((id) => !usedIds.has(id)),
    );
    if (viable.length === 0) {
      break;
    }

    const chosen = weightedChoice(
      args.drawContext,
      `random_pool_draws:pool:${selected.length + 1}`,
      viable.map((candidate) => ({ item: candidate, weight: candidate.weight })),
    );

    selected.push(chosen);
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

function costAmountForAverageReward(
  context: JourneyContext,
  averageReward: number,
): number {
  const availableEssence = Math.max(0, context.state.quest.resources.essence);
  const target = Math.max(MIN_DRAW_COST, Math.round(averageReward * 0.45));
  const affordableTarget = availableEssence >= MIN_DRAW_COST
    ? Math.min(target, availableEssence)
    : target;

  return Math.max(
    DRAW_COST_STEP,
    Math.round(affordableTarget / DRAW_COST_STEP) * DRAW_COST_STEP,
  );
}

function replacementSentence(replacement: RandomPoolReplacementPolicy): string {
  return replacement === "with_replacement"
    ? "Outcomes draw with replacement."
    : "Outcomes draw without replacement.";
}

function poolSummary(candidates: readonly PoolCandidate[]): string {
  return `Randomly gain one: ${candidates
    .map((candidate) => stripTerminalPeriod(lowerFirst(candidate.text)))
    .join(", ")}.`;
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
  readonly costAmount: number;
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
            costAmount: args.costAmount,
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
  const costAmount = costAmountForAverageReward(args.context, averageReward);
  const replacement = pickVariant(
    args.drawContext,
    "random_pool_draws:replacement",
    ["with_replacement", "without_replacement"] as const,
  );
  const baseSummary = poolSummary(candidates);
  const visiblePoolSummary = `${baseSummary} Replacement policy:`;
  const summary = `${baseSummary} ${replacementSentence(replacement)}`;
  const rewards = candidates.map((candidate) => candidate.payload);
  const committedDraws = pickCommittedDraws({
    drawContext: args.drawContext,
    candidates,
    drawCount: levelCount,
    replacement,
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
    summary: visiblePoolSummary,
    rewards,
    replacement,
    visibilityPolicy: {
      outcomeVisibility: "visible",
      disclosure:
        "The full reward pool and replacement policy are visible before drawing.",
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
        "The draw sequence is committed in metadata for deterministic replay.",
      playerVisible: true,
    },
    expectedConvertedEssence: averageReward * levelCount,
    riskPremiumConvertedEssence: replacement === "with_replacement" ? -12 : -8,
    worstCaseBurdenConvertedEssence: 0,
    presentation: "random_pool_draws_repeated_draws",
  };

  return {
    options: [],
    tree: buildTree({
      context: args.context,
      levelCount,
      costAmount,
      averageReward,
      replacement,
    }),
    rewardPool,
    precommitted: {
      random: [visiblePool, repeatedDraws],
    },
  };
}
