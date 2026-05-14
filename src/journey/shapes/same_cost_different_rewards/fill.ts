import type { JourneyContext } from "../../../quest/context.js";
import { drawInt, weightedChoice, type DrawContext } from "../../../util/rng.js";
import type { JourneyOption, JourneyStage } from "../../manifest.js";
import { COSTS, getCost } from "../../shared/costs.js";
import { REWARDS } from "../../shared/rewards.js";
import type { Cost, Reward } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_LABEL = "same_cost_different_rewards";
const TOLERANCE_LO_INITIAL = 0.6;
const TOLERANCE_HI_INITIAL = 1.4;
const TOLERANCE_WIDEN_STEP = 0.2;
const OFFER_ATTEMPTS = 32;
const DEFAULT_MAX_REWARD_SPREAD_RATIO = 1.35;
const STRICT_MAX_REWARD_SPREAD_RATIO = 1.2;
const FALLBACK_ESSENCE_COST_MIN = 5;
const FALLBACK_ESSENCE_COST_STEP = 5;
const EXCLUDED_SHARED_COST_IDS = new Set([
  "gain_random_cards_from_pool",
  "gain_additional_starters",
]);
const STRICT_SHARED_COST_IDS = new Set([
  "pay_omens",
  "pay_max_essence",
  "pay_all_remaining_essence",
  "gain_random_banes",
  "gain_named_banes",
  "gain_named_banes_for_X_battles",
  "purge_named_dreamsign",
  "purge_random_dreamsign",
  "purge_chosen_dreamsign",
  "transform_dreamsign_to_random",
]);
const RANDOM_ACTIVE_DREAMSIGN_COPY_ID = "gain_copy_of_random_dreamsign";
const CHOSEN_ACTIVE_DREAMSIGN_COPY_ID = "gain_copy_of_chosen_dreamsign";

type RolledReward = { template: Reward; params: unknown; cec: number };
type RolledCost = { template: Cost; params: unknown; cec: number; rendered: string };
type RolledOffer = {
  rewards: readonly [RolledReward, RolledReward, RolledReward];
  sharedCost: RolledCost;
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

function meetsRewardDistinctness(
  rolled: RolledReward,
  used: ReadonlySet<string>,
): boolean {
  const ids = consumedRewardIds(rolled);
  for (const id of ids) {
    if (used.has(id)) return false;
  }

  if (
    ids.includes(RANDOM_ACTIVE_DREAMSIGN_COPY_ID) &&
    (ids.includes(CHOSEN_ACTIVE_DREAMSIGN_COPY_ID) ||
      used.has(CHOSEN_ACTIVE_DREAMSIGN_COPY_ID))
  ) {
    return false;
  }

  if (
    ids.includes(CHOSEN_ACTIVE_DREAMSIGN_COPY_ID) &&
    (ids.includes(RANDOM_ACTIVE_DREAMSIGN_COPY_ID) ||
      used.has(RANDOM_ACTIVE_DREAMSIGN_COPY_ID))
  ) {
    return false;
  }

  return true;
}

function rewardFamily(templateId: string): string {
  if (
    [
      "gain_essence",
      "gain_omens",
      "set_essence_to_percent_of_max",
      "gain_essence_random_range",
      "gain_essence_to_max",
      "increase_max_essence",
    ].includes(templateId)
  ) {
    return "resource";
  }

  if (
    [
      "gain_random_predicate_cards",
      "draft_predicate_cards_from_4",
      "take_any_from_predicate_choices",
      "gain_named_card",
      "draft_2_predicate_cards_from_4",
      "draft_predicate_card_with_copies",
      "draft_predicate_card_with_transfiguration",
      "opening_hand_grant_for_X_battles",
      "temporary_card_copy_for_X_battles",
    ].includes(templateId)
  ) {
    return "draft";
  }

  if (
    [
      "gain_random_dreamsign",
      "gain_named_dreamsign",
      "choose_1_of_X_dreamsigns",
      "gain_copy_of_random_dreamsign",
      "gain_copy_of_chosen_dreamsign",
      "temporary_dreamsign_for_X_battles",
    ].includes(templateId)
  ) {
    return "dreamsign";
  }

  if (
    [
      "purge_X_banes",
      "purge_all_banes",
    ].includes(templateId)
  ) {
    return "bane";
  }

  if (
    [
      "purge_named_starter",
      "purge_random_starter",
      "purge_random_starter_with_predicate_replacement",
      "transform_starter_into_named_card",
      "transfigure_random_starters",
      "transfigure_all_starters",
      "transfigure_chosen_starters",
      "purge_chosen_starters",
      "purge_all_starters",
      "replace_starter_via_draft",
    ].includes(templateId)
  ) {
    return "starter";
  }

  if (
    [
      "add_site_to_dreamscape",
      "add_site_to_next_dreamscape",
      "replace_site_type",
      "boost_site_appearance_chance",
    ].includes(templateId)
  ) {
    return "route";
  }

  return "card";
}

function matchesFamilyRestriction(
  rolled: RolledReward,
  familyRestriction: string | undefined,
): boolean {
  if (!familyRestriction) return true;
  return consumedRewardIds(rolled).every(
    (templateId) => rewardFamily(templateId) === familyRestriction,
  );
}

function shopEssenceDiscountCec(
  params: unknown,
  stage: JourneyStage,
): number | undefined {
  if (typeof params !== "object" || params === null || !("percent" in params)) {
    return undefined;
  }

  const percent = (params as { percent?: unknown }).percent;
  if (typeof percent !== "number") return undefined;

  const multiplier = stage === "early" ? 3 : stage === "mid" ? 2.5 : 2;
  return percent * multiplier;
}

function rewardCec(
  template: Reward,
  params: unknown,
  ctx: JourneyContext,
  stage: JourneyStage,
): number {
  if (template.id === "shop_essence_discount") {
    return shopEssenceDiscountCec(params, stage) ?? template.cec(params as never, ctx);
  }

  return template.cec(params as never, ctx);
}

function rewardSpreadRatio(rewards: readonly RolledReward[]): number {
  const values = rewards.map((reward) => reward.cec).filter((cec) => cec > 0);
  if (values.length === 0) return Number.POSITIVE_INFINITY;

  return Math.max(...values) / Math.max(1, Math.min(...values));
}

function maxRewardSpreadRatioForCost(cost: RolledCost): number {
  return STRICT_SHARED_COST_IDS.has(cost.template.id)
    ? STRICT_MAX_REWARD_SPREAD_RATIO
    : DEFAULT_MAX_REWARD_SPREAD_RATIO;
}

function offerIsBalanced(offer: RolledOffer): boolean {
  return rewardSpreadRatio(offer.rewards) <= maxRewardSpreadRatioForCost(offer.sharedCost);
}

function offerBalanceScore(offer: RolledOffer): number {
  return rewardSpreadRatio(offer.rewards) / maxRewardSpreadRatioForCost(offer.sharedCost);
}

function rollReward(
  ctx: JourneyContext,
  draw: DrawContext,
  stage: JourneyStage,
  label: string,
  pool: readonly Reward[],
  used: ReadonlySet<string>,
  familyRestriction: string | undefined,
): RolledReward | undefined {
  const candidates: Array<{ rolled: RolledReward; weight: number }> = [];

  for (const template of pool) {
    if (used.has(template.id)) continue;
    const params = template.rollParams(ctx, {
      ...draw,
      selectionAttempt:
        ((draw.selectionAttempt ?? 0) * 100) + template.id.length,
    });
    if (!template.viable(params as never, ctx)) continue;
    const cec = rewardCec(template, params, ctx, stage);
    if (cec <= 0) continue;
    const rolled = { template, params, cec };
    if (!meetsRewardDistinctness(rolled, used)) continue;
    if (!matchesFamilyRestriction(rolled, familyRestriction)) continue;
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

function rollFurtherReward(
  ctx: JourneyContext,
  draw: DrawContext,
  stage: JourneyStage,
  rowIndex: number,
  anchor: number,
  used: ReadonlySet<string>,
  familyRestriction: string | undefined,
): RolledReward {
  let lo = TOLERANCE_LO_INITIAL;
  let hi = TOLERANCE_HI_INITIAL;

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const candidates: Array<{ rolled: RolledReward; weight: number }> = [];
    for (const template of REWARDS) {
      if (used.has(template.id)) continue;
      const params = template.rollParams(ctx, {
        ...draw,
        sequenceStep: (draw.sequenceStep ?? 0) * 100 + rowIndex,
        selectionAttempt:
          ((draw.selectionAttempt ?? 0) * 100) + attempt + template.id.length,
      });
      if (!template.viable(params as never, ctx)) continue;
      const cec = rewardCec(template, params, ctx, stage);
      if (cec <= 0) continue;
      if (cec < lo * anchor || cec > hi * anchor) continue;
      const rolled = { template, params, cec };
      if (!meetsRewardDistinctness(rolled, used)) continue;
      if (!matchesFamilyRestriction(rolled, familyRestriction)) continue;
      candidates.push({ rolled, weight: template.weight });
    }

    if (candidates.length > 0) {
      return weightedChoice(
        { ...draw, sequenceStep: (draw.sequenceStep ?? 0) * 100 + rowIndex },
        `${SHAPE_LABEL}:row${rowIndex}:attempt${attempt}`,
        candidates.map((candidate) => ({
          item: candidate.rolled,
          weight: candidate.weight,
        })),
      );
    }

    lo = Math.max(0, lo - TOLERANCE_WIDEN_STEP);
    hi += TOLERANCE_WIDEN_STEP;
  }

  throw new Error(
    `${SHAPE_LABEL} fill failed to find a viable reward row ${rowIndex}`,
  );
}

function fallbackEssenceCost(ctx: JourneyContext, draw: DrawContext, cap: number): RolledCost {
  const maxAmount = Math.max(
    FALLBACK_ESSENCE_COST_MIN,
    Math.floor(cap / FALLBACK_ESSENCE_COST_STEP) * FALLBACK_ESSENCE_COST_STEP,
  );
  const stepCount =
    (maxAmount - FALLBACK_ESSENCE_COST_MIN) / FALLBACK_ESSENCE_COST_STEP;
  const x =
    FALLBACK_ESSENCE_COST_MIN +
    FALLBACK_ESSENCE_COST_STEP *
      drawInt(draw, `${SHAPE_LABEL}:fallback-cost`, 0, stepCount);
  const template = getCost("pay_essence");
  const params = { x };

  return {
    template,
    params,
    cec: template.cec(params, ctx),
    rendered: template.render(params, ctx),
  };
}

function sharedCostTextIsCoherent(template: Cost, params: unknown): boolean {
  if (EXCLUDED_SHARED_COST_IDS.has(template.id)) return false;
  if (template.id === "meta_pay_2_costs") {
    const metaParams = params as { subIds?: readonly string[] };
    return (metaParams.subIds ?? []).every(
      (subId) => !EXCLUDED_SHARED_COST_IDS.has(subId),
    );
  }

  return true;
}

function rollSharedCost(
  ctx: JourneyContext,
  draw: DrawContext,
  rewards: readonly RolledReward[],
): RolledCost {
  const cap = Math.max(
    FALLBACK_ESSENCE_COST_MIN,
    Math.min(...rewards.map((reward) => reward.cec)) * 0.5,
  );
  const candidates: Array<{ rolled: RolledCost; weight: number }> = [];

  for (const template of COSTS) {
    const params = template.rollParams(ctx, {
      ...draw,
      selectionAttempt:
        ((draw.selectionAttempt ?? 0) * 100) + template.id.length,
    });
    if (!template.viable(params as never, ctx)) continue;
    if (!sharedCostTextIsCoherent(template, params)) continue;
    const cec = template.cec(params as never, ctx);
    if (cec <= 0 || cec > cap) continue;
    candidates.push({
      rolled: {
        template,
        params,
        cec,
        rendered: template.render(params as never, ctx),
      },
      weight: template.weight,
    });
  }

  if (candidates.length === 0) {
    return fallbackEssenceCost(ctx, draw, cap);
  }

  return weightedChoice(
    draw,
    `${SHAPE_LABEL}:shared-cost`,
    candidates.map((candidate) => ({
      item: candidate.rolled,
      weight: candidate.weight,
    })),
  );
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

function drawForOfferAttempt(draw: DrawContext, attempt: number): DrawContext {
  return {
    ...draw,
    selectionAttempt: ((draw.selectionAttempt ?? 0) * 1000) + attempt,
  };
}

function rollOffer(
  args: ShapeFillArgs,
  familyRestriction: string | undefined,
  attempt: number,
): RolledOffer {
  const { context, drawContext, stage } = args;
  const attemptDraw = drawForOfferAttempt(drawContext, attempt);
  const used = new Set<string>();

  const row1 = rollReward(
    context,
    attemptDraw,
    stage,
    `${SHAPE_LABEL}:attempt${attempt}:row1`,
    REWARDS,
    used,
    familyRestriction,
  );
  if (!row1) {
    throw new Error(`${SHAPE_LABEL} fill could not roll a viable first reward`);
  }
  for (const id of consumedRewardIds(row1)) used.add(id);

  const row2 = rollFurtherReward(
    context,
    attemptDraw,
    stage,
    2,
    row1.cec,
    used,
    familyRestriction,
  );
  for (const id of consumedRewardIds(row2)) used.add(id);

  const row3 = rollFurtherReward(
    context,
    attemptDraw,
    stage,
    3,
    row1.cec,
    used,
    familyRestriction,
  );
  const rewards = [row1, row2, row3] as const;
  const sharedCost = rollSharedCost(context, attemptDraw, rewards);

  return { rewards, sharedCost };
}

export function sameCostDifferentRewardsFill(
  args: ShapeFillArgs,
): FilledJourney {
  const { context, shapeArgs } = args;
  const familyRestriction =
    typeof shapeArgs?.familyRestriction === "string"
      ? shapeArgs.familyRestriction
      : undefined;
  let bestOffer: RolledOffer | undefined;

  for (let attempt = 0; attempt < OFFER_ATTEMPTS; attempt += 1) {
    const offer = rollOffer(args, familyRestriction, attempt);
    if (!bestOffer || offerBalanceScore(offer) < offerBalanceScore(bestOffer)) {
      bestOffer = offer;
    }
    if (offerIsBalanced(offer)) {
      bestOffer = offer;
      break;
    }
  }

  if (!bestOffer) {
    throw new Error(`${SHAPE_LABEL} fill could not roll a viable offer`);
  }

  return {
    options: bestOffer.rewards.map((reward, index) =>
      emptyOption(
        index + 1,
        renderOption(bestOffer.sharedCost, reward, context),
        reward.cec,
        bestOffer.sharedCost.cec,
      ),
    ),
    precommitted: {},
  };
}
