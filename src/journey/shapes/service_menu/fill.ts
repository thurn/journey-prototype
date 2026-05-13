import type { JourneyContext } from "../../../quest/context.js";
import { drawInt, weightedChoice, type DrawContext } from "../../../util/rng.js";
import type { JourneyOption, JourneyStage } from "../../manifest.js";
import { BANE_NAMES } from "../../shared/content.js";
import { COSTS, getCost } from "../../shared/costs.js";
import { REWARDS } from "../../shared/rewards.js";
import type { Cost, Reward } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_LABEL = "service_menu";
const OPTION_COUNT = 3;
const OFFER_ATTEMPTS = 32;
const MIN_REWARD_CEC = 140;
const MAX_COST_RATIO = 0.6;
const FALLBACK_BANE_COST_CEC = 30;
const ALL_PREDICATE_TRANSFIGURATION_REWARD_ID =
  "apply_named_transfiguration_to_all_predicate_cards";
const EXCLUDED_COST_IDS = new Set([
  "gain_random_cards_from_pool",
  "gain_additional_starters",
]);

const REWARD_FAMILIES: Record<string, string> = {
  gain_essence: "resource",
  gain_omens: "resource",
  set_essence_to_percent_of_max: "resource",
  gain_essence_random_range: "resource",
  gain_essence_to_max: "resource",
  increase_max_essence: "resource",
  gain_random_predicate_cards: "draft",
  draft_predicate_cards_from_4: "draft",
  take_any_from_predicate_choices: "draft",
  gain_named_card: "draft",
  draft_2_predicate_cards_from_4: "draft",
  draft_predicate_card_with_copies: "draft",
  draft_predicate_card_with_transfiguration: "draft",
  opening_hand_grant_for_X_battles: "draft",
  temporary_card_copy_for_X_battles: "draft",
  gain_random_dreamsign: "dreamsign",
  gain_named_dreamsign: "dreamsign",
  choose_1_of_X_dreamsigns: "dreamsign",
  gain_copy_of_random_dreamsign: "dreamsign",
  gain_copy_of_chosen_dreamsign: "dreamsign",
  temporary_dreamsign_for_X_battles: "dreamsign",
  purge_X_banes: "bane",
  purge_all_banes: "bane",
  purge_named_starter: "starter",
  purge_random_starter: "starter",
  purge_random_starter_with_predicate_replacement: "starter",
  transform_starter_into_named_card: "starter",
  transfigure_random_starters: "starter",
  transfigure_all_starters: "starter",
  transfigure_chosen_starters: "starter",
  purge_chosen_starters: "starter",
  purge_all_starters: "starter",
  replace_starter_via_draft: "starter",
  add_site_to_dreamscape: "route",
  add_site_to_next_dreamscape: "route",
  replace_site_type: "route",
  boost_site_appearance_chance: "route",
};

const FAMILY_STAGE_CEC_LIMITS: Record<JourneyStage, number> = {
  early: 360,
  mid: 480,
  late: 620,
};

type RolledReward = {
  readonly template: Reward;
  readonly params: unknown;
  readonly cec: number;
};

type RolledCost = {
  readonly template: Cost;
  readonly params: unknown;
  readonly cec: number;
  readonly rendered: string;
};

type RolledService = {
  readonly cost: RolledCost;
  readonly reward: RolledReward;
};

function emptyOption(
  number: number,
  text: string,
  effectCec: number,
  costCec: number,
): JourneyOption {
  return {
    number,
    symbols: ["service", "cost", "reward"],
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

function withoutLockedPrefix(text: string): string {
  return text.replace(/\[LOCKED\]\s*/gu, "");
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

function rewardFamily(rolled: RolledReward): string {
  const families = new Set(
    consumedRewardIds(rolled).map((id) => REWARD_FAMILIES[id] ?? "card"),
  );

  return families.size === 1 ? [...families][0]! : "mixed";
}

function rewardFitsShape(rolled: RolledReward, stage: JourneyStage): boolean {
  if (rolled.cec < MIN_REWARD_CEC) return false;
  if (rolled.cec > FAMILY_STAGE_CEC_LIMITS[stage]) return false;
  if (new Set(consumedRewardIds(rolled)).size !== consumedRewardIds(rolled).length) {
    return false;
  }

  return rolled.template.id !== ALL_PREDICATE_TRANSFIGURATION_REWARD_ID;
}

function costFitsShape(template: Cost, params: unknown): boolean {
  if (EXCLUDED_COST_IDS.has(template.id)) return false;
  if (template.id === "meta_pay_2_costs") {
    return costSubIds(template, params).every((id) => !EXCLUDED_COST_IDS.has(id));
  }

  return true;
}

function rollRewardCandidates(
  ctx: JourneyContext,
  draw: DrawContext,
  stage: JourneyStage,
  familyRestriction: string | undefined,
): RolledReward[] {
  const candidates: RolledReward[] = [];

  for (const template of REWARDS) {
    const params = template.rollParams(ctx, {
      ...draw,
      selectionAttempt:
        ((draw.selectionAttempt ?? 0) * 100) + template.id.length,
    });
    if (!template.viable(params as never, ctx)) continue;
    const rolled = {
      template,
      params,
      cec: template.cec(params as never, ctx),
    };
    if (!rewardFitsShape(rolled, stage)) continue;
    if (
      familyRestriction !== undefined &&
      rewardFamily(rolled) !== familyRestriction
    ) {
      continue;
    }
    candidates.push(rolled);
  }

  return candidates;
}

function rollCostCandidates(
  ctx: JourneyContext,
  draw: DrawContext,
  reward: RolledReward,
): RolledCost[] {
  const candidates: RolledCost[] = [];
  const maxCostCec = reward.cec * MAX_COST_RATIO;

  for (const template of COSTS) {
    const params = template.rollParams(ctx, {
      ...draw,
      selectionAttempt:
        ((draw.selectionAttempt ?? 0) * 100) + template.id.length,
    });
    if (!template.viable(params as never, ctx)) continue;
    if (!costFitsShape(template, params)) continue;
    const cec = template.cec(params as never, ctx);
    if (cec <= 0 || cec > maxCostCec) continue;
    const rendered = template.render(params as never, ctx);
    if (rendered.includes("[LOCKED]")) continue;
    candidates.push({ template, params, cec, rendered });
  }

  return candidates;
}

function fallbackBaneCost(
  ctx: JourneyContext,
  draw: DrawContext,
  reward: RolledReward,
  optionIndex: number,
): RolledCost | undefined {
  if (reward.cec * MAX_COST_RATIO < FALLBACK_BANE_COST_CEC) return undefined;
  const template = getCost("gain_named_banes");
  const baneName = BANE_NAMES[
    drawInt(draw, `${SHAPE_LABEL}:fallback-bane:${optionIndex}`, 0, BANE_NAMES.length - 1)
  ]!;
  const params = { baneName, count: 1 };

  return {
    template,
    params,
    cec: template.cec(params, ctx),
    rendered: template.render(params, ctx),
  };
}

function pickServiceRows(args: ShapeFillArgs): readonly [RolledService, RolledService, RolledService] {
  const familyRestriction =
    typeof args.shapeArgs?.familyRestriction === "string"
      ? args.shapeArgs.familyRestriction
      : undefined;

  for (let attempt = 0; attempt < OFFER_ATTEMPTS; attempt += 1) {
    const attemptDraw = {
      ...args.drawContext,
      selectionAttempt: ((args.drawContext.selectionAttempt ?? 0) * 1000) + attempt,
    };
    const rewardCandidates = rollRewardCandidates(
      args.context,
      attemptDraw,
      args.stage,
      familyRestriction,
    );
    const usedRewardIds = new Set<string>();
    const usedCostIds = new Set<string>();
    const usedTexts = new Set<string>();
    const rows: RolledService[] = [];

    for (let index = 0; index < OPTION_COUNT; index += 1) {
      const viableRewards = rewardCandidates.filter((reward) =>
        consumedRewardIds(reward).every((id) => !usedRewardIds.has(id)),
      );
      if (viableRewards.length === 0) break;
      const reward = weightedChoice(
        { ...attemptDraw, sequenceStep: (attemptDraw.sequenceStep ?? 0) * 100 + index },
        `${SHAPE_LABEL}:reward:${attempt}:${index}`,
        viableRewards.map((candidate) => ({
          item: candidate,
          weight: candidate.template.weight,
        })),
      );
      let costCandidates = rollCostCandidates(
        args.context,
        {
          ...attemptDraw,
          sequenceStep: (attemptDraw.sequenceStep ?? 0) * 100 + index,
        },
        reward,
      ).filter(
        (cost) =>
          !usedTexts.has(cost.rendered) &&
          consumedCostIds(cost).every((id) => !usedCostIds.has(id)),
      );
      if (costCandidates.length === 0) {
        const fallback = fallbackBaneCost(args.context, attemptDraw, reward, index);
        costCandidates = fallback === undefined ? [] : [fallback];
      }
      if (costCandidates.length === 0) break;
      const cost = weightedChoice(
        { ...attemptDraw, sequenceStep: (attemptDraw.sequenceStep ?? 0) * 100 + index },
        `${SHAPE_LABEL}:cost:${attempt}:${index}`,
        costCandidates.map((candidate) => ({
          item: candidate,
          weight: candidate.template.weight,
        })),
      );

      rows.push({ cost, reward });
      usedTexts.add(cost.rendered);
      for (const id of consumedRewardIds(reward)) usedRewardIds.add(id);
      for (const id of consumedCostIds(cost)) usedCostIds.add(id);
    }

    if (rows.length === OPTION_COUNT) {
      return rows as [RolledService, RolledService, RolledService];
    }
  }

  throw new Error(`${SHAPE_LABEL} fill could not roll three viable service rows`);
}

function renderOption(row: RolledService, ctx: JourneyContext): string {
  const costText = withoutLockedPrefix(row.cost.rendered);
  const rewardText = withoutLockedPrefix(
    row.reward.template.render(row.reward.params as never, ctx),
  );

  return `Cost: ${costText}. Reward: ${rewardText}`;
}

export function serviceMenuFill(args: ShapeFillArgs): FilledJourney {
  const rows = pickServiceRows(args);

  return {
    options: rows.map((row, index) =>
      emptyOption(
        index + 1,
        renderOption(row, args.context),
        row.reward.cec,
        row.cost.cec,
      ),
    ),
    precommitted: {},
  };
}
