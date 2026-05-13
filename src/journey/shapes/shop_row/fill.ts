import type { JourneyContext } from "../../../quest/context.js";
import { drawInt, weightedChoice, type DrawContext } from "../../../util/rng.js";
import type { JourneyOption, JourneyStage } from "../../manifest.js";
import { getCost } from "../../shared/costs.js";
import { REWARDS } from "../../shared/rewards.js";
import { joinSnippets } from "../../shared/text.js";
import type { Reward } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_LABEL = "shop_row";
const ROW_COUNT = 3;
const PAY_ESSENCE = getCost("pay_essence");
const PRICE_STEP = 5;

const STAGE_PRICE_BANDS = {
  early: { min: 15, max: 55 },
  mid: { min: 25, max: 85 },
  late: { min: 35, max: 120 },
} as const satisfies Record<JourneyStage, { min: number; max: number }>;

const RESOURCE_ARBITRAGE_REWARD_IDS = new Set([
  "gain_essence",
  "gain_omens",
  "set_essence_to_percent_of_max",
  "gain_essence_random_range",
  "gain_essence_to_max",
]);

type RolledReward = {
  readonly template: Reward;
  readonly params: unknown;
  readonly cec: number;
  readonly rendered: string;
};

function roundToPriceStep(value: number): number {
  return Math.max(PRICE_STEP, Math.round(value / PRICE_STEP) * PRICE_STEP);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rewardSubIds(rolled: RolledReward): readonly string[] {
  if (rolled.template.id !== "meta_gain_2_rewards") {
    return [];
  }

  return (rolled.params as { subIds?: readonly string[] }).subIds ?? [];
}

function consumedRewardIds(rolled: RolledReward): readonly string[] {
  return [rolled.template.id, ...rewardSubIds(rolled)];
}

function alreadyUsed(rolled: RolledReward, used: ReadonlySet<string>): boolean {
  return consumedRewardIds(rolled).some((id) => used.has(id));
}

function rollRewardCandidate(
  context: JourneyContext,
  drawContext: DrawContext,
  template: Reward,
  rowIndex: number,
): RolledReward | undefined {
  const params = template.rollParams(context, {
    ...drawContext,
    sequenceStep: (drawContext.sequenceStep ?? 0) * 100 + rowIndex,
    selectionAttempt:
      ((drawContext.selectionAttempt ?? 0) * 100) + template.id.length,
  });

  if (!template.viable(params as never, context)) {
    return undefined;
  }

  const cec = template.cec(params as never, context);

  if (cec <= 0) {
    return undefined;
  }

  return {
    template,
    params,
    cec,
    rendered: template.render(params as never, context),
  };
}

function rewardPool(
  context: JourneyContext,
  drawContext: DrawContext,
  rowIndex: number,
  used: ReadonlySet<string>,
  allowResourceArbitrage: boolean,
): RolledReward[] {
  const candidates: RolledReward[] = [];

  for (const template of REWARDS) {
    if (!allowResourceArbitrage && RESOURCE_ARBITRAGE_REWARD_IDS.has(template.id)) {
      continue;
    }

    if (used.has(template.id)) {
      continue;
    }

    const rolled = rollRewardCandidate(context, drawContext, template, rowIndex);

    if (!rolled || alreadyUsed(rolled, used)) {
      continue;
    }

    candidates.push(rolled);
  }

  return candidates;
}

function rollShopRewards(args: ShapeFillArgs): RolledReward[] {
  const used = new Set<string>();
  const selected: RolledReward[] = [];

  for (let index = 0; index < ROW_COUNT; index += 1) {
    const rowIndex = index + 1;
    let candidates = rewardPool(
      args.context,
      args.drawContext,
      rowIndex,
      used,
      false,
    );

    if (candidates.length === 0) {
      candidates = rewardPool(
        args.context,
        args.drawContext,
        rowIndex,
        used,
        true,
      );
    }

    if (candidates.length === 0) {
      throw new Error(`${SHAPE_LABEL} fill could not roll viable reward row ${rowIndex}`);
    }

    const picked = weightedChoice(
      {
        ...args.drawContext,
        sequenceStep: (args.drawContext.sequenceStep ?? 0) * 100 + rowIndex,
      },
      `${SHAPE_LABEL}:reward:${rowIndex}`,
      candidates.map((candidate) => ({
        item: candidate,
        weight: candidate.template.weight,
      })),
    );

    selected.push(picked);
    for (const id of consumedRewardIds(picked)) {
      used.add(id);
    }
  }

  return selected;
}

function shopPrice(args: {
  readonly context: JourneyContext;
  readonly drawContext: DrawContext;
  readonly rewardCec: number;
  readonly stage: JourneyStage;
  readonly rowIndex: number;
}): number {
  const band = STAGE_PRICE_BANDS[args.stage];
  const jitter = drawInt(
    args.drawContext,
    `${SHAPE_LABEL}:price-jitter:${args.rowIndex}`,
    -1,
    1,
  ) * PRICE_STEP;
  const targetPrice = roundToPriceStep(args.rewardCec * 0.45 + jitter);
  const affordableMax = Math.max(PRICE_STEP, args.context.state.quest.resources.essence);
  const ceiling = Math.min(band.max, affordableMax);
  const floor = Math.min(band.min, ceiling);

  return clamp(targetPrice, floor, ceiling);
}

function shopOption(
  number: number,
  reward: RolledReward,
  args: ShapeFillArgs,
): JourneyOption {
  const price = shopPrice({
    context: args.context,
    drawContext: args.drawContext,
    rewardCec: reward.cec,
    stage: args.stage,
    rowIndex: number,
  });
  const costCec = PAY_ESSENCE.cec({ x: price } as never, args.context);
  const text = joinSnippets([
    `Pay ${price} essence`,
    reward.rendered,
  ]);

  return {
    number,
    symbols: ["shop", "cost", "reward"],
    text,
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: costCec,
    effectConvertedEssence: reward.cec,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: reward.cec - costCec,
    pickBehavior: "record_and_generate_next",
  };
}

export function shopRowFill(args: ShapeFillArgs): FilledJourney {
  return {
    options: rollShopRewards(args).map((reward, index) =>
      shopOption(index + 1, reward, args)
    ),
    precommitted: {},
  };
}
