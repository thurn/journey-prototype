import { weightedChoice, type DrawContext } from "../../../util/rng.js";
import type { JourneyOption } from "../../manifest.js";
import { COSTS } from "../../shared/costs.js";
import { REWARDS } from "../../shared/rewards.js";
import type { Cost, Reward, TemplateParams } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const CAP = 2;
const TAKE_OPTION_COUNT = 2;
const MIN_REWARD_CEC = 40;
const MAX_COST_TO_REWARD_RATIO = 0.85;
const EXCLUDED_COST_IDS = new Set([
  "gain_random_cards_from_pool",
  "gain_additional_starters",
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

function drawFor(base: DrawContext, row: number, attempt: number): DrawContext {
  return {
    ...base,
    sequenceStep: (base.sequenceStep ?? 0) * 100 + row,
    selectionAttempt: (base.selectionAttempt ?? 0) * 1000 + attempt,
  };
}

function templateSubIds(
  templateId: string,
  params: TemplateParams,
): readonly string[] {
  if (templateId === "meta_gain_2_rewards" || templateId === "meta_pay_2_costs") {
    const metaParams = params as { subIds?: readonly string[] };
    return metaParams.subIds ?? [];
  }

  return [];
}

function consumedTemplateIds(
  templateId: string,
  params: TemplateParams,
): readonly string[] {
  return [templateId, ...templateSubIds(templateId, params)];
}

function hasUsedTemplate(
  templateId: string,
  params: TemplateParams,
  used: ReadonlySet<string>,
): boolean {
  return consumedTemplateIds(templateId, params).some((id) => used.has(id));
}

function rememberTemplate(
  templateId: string,
  params: TemplateParams,
  used: Set<string>,
): void {
  for (const id of consumedTemplateIds(templateId, params)) {
    used.add(id);
  }
}

function rollReward(
  args: ShapeFillArgs,
  row: number,
  used: ReadonlySet<string>,
): RolledReward {
  const candidates: Array<{ rolled: RolledReward; weight: number }> = [];

  for (const template of REWARDS) {
    const params = template.rollParams(
      args.context,
      drawFor(args.drawContext, row, template.id.length),
    );

    if (!template.viable(params as never, args.context)) continue;
    if (hasUsedTemplate(template.id, params, used)) continue;

    const cec = template.cec(params as never, args.context);
    if (cec < MIN_REWARD_CEC) continue;

    candidates.push({
      rolled: {
        template,
        params,
        cec,
        text: template.render(params as never, args.context),
      },
      weight: template.weight,
    });
  }

  if (candidates.length === 0) {
    throw new Error(`take_any_number fill could not roll reward ${row}`);
  }

  return weightedChoice(
    args.drawContext,
    `take_any_number:reward:${row}`,
    candidates.map((candidate) => ({
      item: candidate.rolled,
      weight: candidate.weight,
    })),
  );
}

function costIsCoherent(template: Cost, params: TemplateParams): boolean {
  if (EXCLUDED_COST_IDS.has(template.id)) return false;

  return templateSubIds(template.id, params).every((id) => !EXCLUDED_COST_IDS.has(id));
}

function rollCost(
  args: ShapeFillArgs,
  row: number,
  rewardCec: number,
  used: ReadonlySet<string>,
): RolledCost {
  const candidates: Array<{ rolled: RolledCost; weight: number; balanced: boolean }> = [];

  for (const template of COSTS) {
    const params = template.rollParams(
      args.context,
      drawFor(args.drawContext, row + TAKE_OPTION_COUNT, template.id.length),
    );

    if (!template.viable(params as never, args.context)) continue;
    if (!costIsCoherent(template, params)) continue;
    if (hasUsedTemplate(template.id, params, used)) continue;

    const text = template.render(params as never, args.context);
    if (text.startsWith("[LOCKED] ")) continue;

    const cec = template.cec(params as never, args.context);
    if (cec <= 0) continue;

    candidates.push({
      rolled: { template, params, cec, text },
      weight: template.weight,
      balanced: cec <= rewardCec * MAX_COST_TO_REWARD_RATIO,
    });
  }

  const balanced = candidates.filter((candidate) => candidate.balanced);
  const pool = balanced.length > 0 ? balanced : candidates;

  if (pool.length === 0) {
    throw new Error(`take_any_number fill could not roll cost ${row}`);
  }

  return weightedChoice(
    args.drawContext,
    `take_any_number:cost:${row}`,
    pool.map((candidate) => ({
      item: candidate.rolled,
      weight: candidate.weight,
    })),
  );
}

function takeOption(
  number: number,
  reward: RolledReward,
  cost: RolledCost,
): JourneyOption {
  return {
    number,
    symbols: [],
    text: `Take up to ${CAP} rewards from this cache. Cost: ${cost.text}. Reward: ${reward.text}`,
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: cost.cec,
    effectConvertedEssence: reward.cec,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: reward.cec - cost.cec,
    pickBehavior: "record_and_generate_next",
  };
}

function leaveOption(number: number): JourneyOption {
  return {
    number,
    symbols: [],
    text: "Leave the cache.",
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
    pickBehavior: "leave",
  };
}

export function takeAnyNumberFill(args: ShapeFillArgs): FilledJourney {
  const usedRewards = new Set<string>();
  const usedCosts = new Set<string>();
  const rows: JourneyOption[] = [];

  for (let row = 1; row <= TAKE_OPTION_COUNT; row += 1) {
    const reward = rollReward(args, row, usedRewards);
    const cost = rollCost(args, row, reward.cec, usedCosts);

    rememberTemplate(reward.template.id, reward.params, usedRewards);
    rememberTemplate(cost.template.id, cost.params, usedCosts);
    rows.push(takeOption(row, reward, cost));
  }

  return {
    options: [...rows, leaveOption(TAKE_OPTION_COUNT + 1)],
    precommitted: {},
  };
}
