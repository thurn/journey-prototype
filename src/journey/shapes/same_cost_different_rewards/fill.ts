import type { JourneyContext } from "../../../quest/context.js";
import { drawInt, weightedChoice, type DrawContext } from "../../../util/rng.js";
import type { JourneyOption } from "../../manifest.js";
import { COSTS, getCost } from "../../shared/costs.js";
import { REWARDS } from "../../shared/rewards.js";
import type { Cost, Reward } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_LABEL = "same_cost_different_rewards";
const TOLERANCE_LO_INITIAL = 0.6;
const TOLERANCE_HI_INITIAL = 1.4;
const TOLERANCE_WIDEN_STEP = 0.2;
const FALLBACK_ESSENCE_COST_MIN = 5;
const FALLBACK_ESSENCE_COST_STEP = 5;
const EXCLUDED_SHARED_COST_IDS = new Set([
  "gain_random_cards_from_pool",
  "gain_additional_starters",
]);

type RolledReward = { template: Reward; params: unknown; cec: number };
type RolledCost = { template: Cost; params: unknown; cec: number; rendered: string };

function emptyOption(
  number: number,
  text: string,
  effectCec: number,
  costCec: number,
): JourneyOption {
  return {
    number,
    symbols: ["cost", "reward"],
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
  for (const id of consumedRewardIds(rolled)) {
    if (used.has(id)) return false;
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

function rollReward(
  ctx: JourneyContext,
  draw: DrawContext,
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
    const cec = template.cec(params as never, ctx);
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
      const cec = template.cec(params as never, ctx);
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

function renderOption(cost: RolledCost, reward: RolledReward, ctx: JourneyContext): string {
  const text = `${cost.rendered}. ${reward.template.render(reward.params as never, ctx)}`;
  return text.includes("[LOCKED]") && !text.startsWith("[LOCKED] ")
    ? `[LOCKED] ${text.replace(/\[LOCKED\] /g, "")}`
    : text;
}

export function sameCostDifferentRewardsFill(
  args: ShapeFillArgs,
): FilledJourney {
  const { context, drawContext, shapeArgs } = args;
  const familyRestriction =
    typeof shapeArgs?.familyRestriction === "string"
      ? shapeArgs.familyRestriction
      : undefined;
  const used = new Set<string>();

  const row1 = rollReward(
    context,
    drawContext,
    `${SHAPE_LABEL}:row1`,
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
    drawContext,
    2,
    row1.cec,
    used,
    familyRestriction,
  );
  for (const id of consumedRewardIds(row2)) used.add(id);

  const row3 = rollFurtherReward(
    context,
    drawContext,
    3,
    row1.cec,
    used,
    familyRestriction,
  );
  const rewards = [row1, row2, row3];
  const sharedCost = rollSharedCost(context, drawContext, rewards);

  return {
    options: rewards.map((reward, index) =>
      emptyOption(
        index + 1,
        renderOption(sharedCost, reward, context),
        reward.cec,
        sharedCost.cec,
      ),
    ),
    precommitted: {},
  };
}
