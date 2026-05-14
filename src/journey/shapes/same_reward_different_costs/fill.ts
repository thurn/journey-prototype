import type { JourneyContext } from "../../../quest/context.js";
import { drawInt, weightedChoice, type DrawContext } from "../../../util/rng.js";
import type { JourneyOption, JourneyStage } from "../../manifest.js";
import { cardMatches, essenceAmount } from "../../shared/content.js";
import { COSTS, getCost } from "../../shared/costs.js";
import { getPredicate } from "../../shared/predicates.js";
import { REWARDS } from "../../shared/rewards.js";
import type { Cost, Reward } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_LABEL = "same_reward_different_costs";
const OPTION_COUNT = 3;
const OFFER_ATTEMPTS = 32;
const MIN_SHARED_REWARD_CEC = 120;
const MAX_COST_RATIO = 0.75;
const FALLBACK_ESSENCE_COST_MIN = 10;
const FALLBACK_ESSENCE_COST_STEP = 5;
const ALL_PREDICATE_TRANSFIGURATION_REWARD_ID =
  "apply_named_transfiguration_to_all_predicate_cards";

const EXCLUDED_SHARED_COST_IDS = new Set([
  "gain_random_cards_from_pool",
  "gain_additional_starters",
]);
const CURRENT_ESSENCE_COST_IDS = new Set([
  "pay_essence",
  "pay_essence_random_range",
  "pay_percent_essence",
  "pay_all_remaining_essence",
]);
const OMEN_COST_IDS = new Set(["pay_omens"]);
const ALL_PREDICATE_TRANSFIGURATION_LIMITS: Record<
  JourneyStage,
  { maxTargets: number; maxCec: number }
> = {
  early: { maxTargets: 3, maxCec: 320 },
  mid: { maxTargets: 4, maxCec: 440 },
  late: { maxTargets: 5, maxCec: 560 },
};

type RolledReward = { template: Reward; params: unknown; cec: number };
type RolledCost = { template: Cost; params: unknown; cec: number; rendered: string };
type RolledOffer = {
  reward: RolledReward;
  costs: readonly [RolledCost, RolledCost, RolledCost];
};

function emptyOption(
  number: number,
  text: string,
  effectCec: number,
  costCec: number,
): JourneyOption {
  return {
    number,
    symbols: [],
    text,
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: costCec,
    effectConvertedEssence: effectCec,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: effectCec - costCec,
    pickBehavior: "record_and_generate_next",
  };
}

function normalizeDreamsignTerm(text: string): string {
  return text.replace(/\bdreamsigns?\b/giu, (match) =>
    match.toLowerCase().endsWith("s") ? "Dreamsigns" : "Dreamsign"
  );
}

function withoutLockedPrefix(text: string): string {
  return text.replace(/\[LOCKED\]\s*/gu, "");
}

function sentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

function renderOption(cost: RolledCost, reward: RolledReward, ctx: JourneyContext): string {
  const costText = normalizeDreamsignTerm(withoutLockedPrefix(cost.rendered));
  const rewardText = normalizeDreamsignTerm(
    withoutLockedPrefix(reward.template.render(reward.params as never, ctx)),
  );
  const text = `${sentence(costText)} ${sentence(rewardText)}`;
  return cost.rendered.includes("[LOCKED]") ? `[LOCKED] ${text}` : text;
}

function costSubIds(template: Cost, params: unknown): readonly string[] {
  if (template.id === "meta_pay_2_costs") {
    const metaParams = params as { subIds?: readonly string[] };
    return metaParams.subIds ?? [];
  }
  return [];
}

function consumedCostIds(cost: RolledCost): readonly string[] {
  return [cost.template.id, ...costSubIds(cost.template, cost.params)];
}

function sharedCostTextIsCoherent(template: Cost, params: unknown): boolean {
  if (EXCLUDED_SHARED_COST_IDS.has(template.id)) return false;
  if (template.id === "meta_pay_2_costs") {
    return costSubIds(template, params).every(
      (subId) => !EXCLUDED_SHARED_COST_IDS.has(subId),
    );
  }

  return true;
}

function rewardSubIds(rolled: RolledReward): readonly string[] {
  if (rolled.template.id === "meta_gain_2_rewards") {
    const params = rolled.params as { subIds: readonly [string, string] };
    return params.subIds;
  }
  return [];
}

function consumedRewardIds(rolled: RolledReward): readonly string[] {
  return [rolled.template.id, ...rewardSubIds(rolled)];
}

function rewardFitsShape(rolled: RolledReward, ctx: JourneyContext, stage: JourneyStage): boolean {
  if (rolled.template.id !== ALL_PREDICATE_TRANSFIGURATION_REWARD_ID) {
    return true;
  }

  const params = rolled.params as { predicateId?: string };
  if (!params.predicateId) return false;
  const predicate = getPredicate(params.predicateId);
  const targetCount = cardMatches(ctx, predicate.cardPredicate ?? {}).length;
  const limits = ALL_PREDICATE_TRANSFIGURATION_LIMITS[stage];

  return targetCount <= limits.maxTargets && rolled.cec <= limits.maxCec;
}

function rollReward(
  ctx: JourneyContext,
  draw: DrawContext,
  label: string,
  stage: JourneyStage,
): RolledReward | undefined {
  const candidates: Array<{ rolled: RolledReward; weight: number }> = [];

  for (const template of REWARDS) {
    const params = template.rollParams(ctx, {
      ...draw,
      selectionAttempt:
        ((draw.selectionAttempt ?? 0) * 100) + template.id.length,
    });
    if (!template.viable(params as never, ctx)) continue;
    const cec = template.cec(params as never, ctx);
    if (cec < MIN_SHARED_REWARD_CEC) continue;
    const rolled = { template, params, cec };
    if (!rewardFitsShape(rolled, ctx, stage)) continue;
    if (new Set(consumedRewardIds(rolled)).size !== consumedRewardIds(rolled).length) {
      continue;
    }
    candidates.push({ rolled, weight: template.weight });
  }

  if (candidates.length === 0) return undefined;
  return weightedChoice(
    draw,
    label,
    candidates.map((candidate) => ({
      item: candidate.rolled,
      weight: candidate.weight,
    })),
  );
}

function rolledCostCandidates(
  ctx: JourneyContext,
  draw: DrawContext,
  reward: RolledReward,
): RolledCost[] {
  const maxCostCec = reward.cec * MAX_COST_RATIO;
  const candidates: RolledCost[] = [];

  for (const template of COSTS) {
    const params = template.rollParams(ctx, {
      ...draw,
      selectionAttempt:
        ((draw.selectionAttempt ?? 0) * 100) + template.id.length,
    });
    if (!template.viable(params as never, ctx)) continue;
    if (!sharedCostTextIsCoherent(template, params)) continue;
    const cec = template.cec(params as never, ctx);
    if (cec <= 0 || cec > maxCostCec) continue;
    candidates.push({
      template,
      params,
      cec,
      rendered: template.render(params as never, ctx),
    });
  }

  return candidates;
}

function hasLockedText(cost: RolledCost): boolean {
  return cost.rendered.includes("[LOCKED]");
}

function dominanceKey(cost: RolledCost): string | undefined {
  if (CURRENT_ESSENCE_COST_IDS.has(cost.template.id)) return "current_essence";
  if (OMEN_COST_IDS.has(cost.template.id)) return "omens";
  return undefined;
}

function removeDominatedResourceCosts(candidates: readonly RolledCost[]): RolledCost[] {
  const cheapestByKey = new Map<string, number>();
  for (const candidate of candidates) {
    const key = dominanceKey(candidate);
    if (!key) continue;
    const existing = cheapestByKey.get(key);
    if (existing === undefined || candidate.cec < existing) {
      cheapestByKey.set(key, candidate.cec);
    }
  }

  return candidates.filter((candidate) => {
    const key = dominanceKey(candidate);
    return !key || candidate.cec === cheapestByKey.get(key);
  });
}

function fallbackEssenceCost(
  ctx: JourneyContext,
  draw: DrawContext,
  reward: RolledReward,
  index: number,
): RolledCost | undefined {
  const template = getCost("pay_essence");
  const cap = Math.min(
    essenceAmount(ctx),
    Math.floor((reward.cec * MAX_COST_RATIO) / FALLBACK_ESSENCE_COST_STEP) *
      FALLBACK_ESSENCE_COST_STEP,
  );
  if (cap < FALLBACK_ESSENCE_COST_MIN) return undefined;
  const floor = Math.min(cap, FALLBACK_ESSENCE_COST_MIN + index * 15);
  const stepCount = Math.max(
    0,
    Math.floor((cap - floor) / FALLBACK_ESSENCE_COST_STEP),
  );
  const x =
    floor +
    FALLBACK_ESSENCE_COST_STEP *
      drawInt(draw, `${SHAPE_LABEL}:fallback-cost:${index}`, 0, stepCount);
  const params = { x };

  return {
    template,
    params,
    cec: template.cec(params, ctx),
    rendered: template.render(params, ctx),
  };
}

function rollCosts(
  ctx: JourneyContext,
  draw: DrawContext,
  reward: RolledReward,
): readonly [RolledCost, RolledCost, RolledCost] {
  const usedIds = new Set<string>();
  const usedText = new Set<string>();
  const usedCec = new Set<number>();
  const selected: RolledCost[] = [];
  let candidates = removeDominatedResourceCosts(
    rolledCostCandidates(ctx, draw, reward).filter((candidate) => !hasLockedText(candidate)),
  );

  for (let index = 0; index < OPTION_COUNT; index += 1) {
    const viable = candidates.filter((candidate) => {
      if (usedText.has(candidate.rendered) || usedCec.has(candidate.cec)) {
        return false;
      }
      return consumedCostIds(candidate).every((id) => !usedIds.has(id));
    });

    if (viable.length === 0) break;

    const picked = weightedChoice(
      {
        ...draw,
        sequenceStep: (draw.sequenceStep ?? 0) * 100 + index,
      },
      `${SHAPE_LABEL}:cost:${index}`,
      viable.map((candidate) => ({
        item: candidate,
        weight: candidate.template.weight,
      })),
    );
    selected.push(picked);
    usedText.add(picked.rendered);
    usedCec.add(picked.cec);
    for (const id of consumedCostIds(picked)) usedIds.add(id);
    candidates = candidates.filter((candidate) => candidate !== picked);
  }

  for (let index = selected.length; index < OPTION_COUNT; index += 1) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const fallback = fallbackEssenceCost(
        ctx,
        {
          ...draw,
          selectionAttempt:
            ((draw.selectionAttempt ?? 0) * 100) + index * 10 + attempt,
        },
        reward,
        index + attempt,
      );
      if (!fallback) continue;
      if (usedText.has(fallback.rendered) || usedCec.has(fallback.cec)) {
        continue;
      }
      selected.push(fallback);
      usedText.add(fallback.rendered);
      usedCec.add(fallback.cec);
      break;
    }
  }

  if (selected.length !== OPTION_COUNT) {
    throw new Error(`${SHAPE_LABEL} fill could not roll three distinct costs`);
  }

  return selected as [RolledCost, RolledCost, RolledCost];
}

function drawForOfferAttempt(draw: DrawContext, attempt: number): DrawContext {
  return {
    ...draw,
    selectionAttempt: ((draw.selectionAttempt ?? 0) * 1000) + attempt,
  };
}

function rollOffer(args: ShapeFillArgs, attempt: number): RolledOffer | undefined {
  const { context, drawContext } = args;
  const attemptDraw = drawForOfferAttempt(drawContext, attempt);
  const reward = rollReward(
    context,
    attemptDraw,
    `${SHAPE_LABEL}:attempt${attempt}:reward`,
    args.stage,
  );
  if (!reward) return undefined;

  return {
    reward,
    costs: rollCosts(context, attemptDraw, reward),
  };
}

export function sameRewardDifferentCostsFill(
  args: ShapeFillArgs,
): FilledJourney {
  let offer: RolledOffer | undefined;

  for (let attempt = 0; attempt < OFFER_ATTEMPTS; attempt += 1) {
    offer = rollOffer(args, attempt);
    if (offer) break;
  }

  if (!offer) {
    throw new Error(`${SHAPE_LABEL} fill could not roll a viable offer`);
  }

  return {
    options: offer.costs.map((cost, index) =>
      emptyOption(
        index + 1,
        renderOption(cost, offer.reward, args.context),
        offer.reward.cec,
        cost.cec,
      ),
    ),
    precommitted: {},
  };
}
