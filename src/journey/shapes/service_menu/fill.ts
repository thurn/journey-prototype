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
const SERVICE_PRICE_COST_IDS = new Set([
  "pay_essence",
  "pay_omens",
  "pay_max_essence",
  "pay_essence_random_range",
  "pay_percent_essence",
  "pay_all_remaining_essence",
  "battle_reward_reduction_flat",
  "battle_reward_reduction_percent",
  "gain_random_banes",
  "gain_named_banes",
  "gain_named_banes_for_X_battles",
  "set_starting_dreamwell_negative",
  "shuffle_negative_dreamwell_cards",
  "remove_shop_sites_from_next_dreamscapes",
  "remove_dreamsign_sites_from_next_dreamscapes",
  "lose_max_essence",
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
  gain_named_card: "card",
  apply_chosen_transfiguration_to_chosen_card: "transfiguration",
  apply_named_transfiguration_to_chosen_predicate_cards: "transfiguration",
  apply_named_transfiguration_to_card_name: "transfiguration",
  apply_named_transfiguration_to_random_predicate_cards: "transfiguration",
  change_card_to_become_type: "card",
  modify_random_cards_to_types: "card",
  make_random_cards_fast: "card",
  purge_chosen_predicate_cards: "card",
  purge_chosen_predicate_with_replacement: "card",
  transform_card_in_deck_into_named: "card",
  transform_chosen_predicate_into_named: "card",
  duplicate_named_card_X: "card",
  duplicate_chosen_cards: "card",
  duplicate_random_predicate: "card",
  draw_X_and_duplicate_chosen: "card",
  draft_2_predicate_cards_from_4: "draft",
  draft_predicate_card_with_copies: "draft",
  draft_predicate_card_with_transfiguration: "draft",
  make_card_reclaim: "transfiguration",
  make_random_cards_reclaim: "transfiguration",
  card_cost_reduction_for_X_battles: "card",
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
  set_starting_dreamwell_positive: "dreamwell",
  shuffle_positive_dreamwell_cards: "dreamwell",
  next_X_shop_rerolls_free: "shop",
  shop_essence_discount: "shop",
  shop_omen_discount: "shop",
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

type ServiceFamily = {
  readonly id: string;
  readonly scene: string;
  readonly rewardFamilies: readonly string[];
  readonly costIds: readonly string[];
  readonly minRewardCec?: number;
};

const RESOURCE_PRICE_IDS = [
  "pay_essence",
  "pay_omens",
  "pay_essence_random_range",
  "pay_percent_essence",
  "pay_all_remaining_essence",
  "lose_max_essence",
] as const;

const BURDEN_PRICE_IDS = [
  "gain_random_banes",
  "gain_named_banes",
  "gain_named_banes_for_X_battles",
  "battle_reward_reduction_flat",
  "battle_reward_reduction_percent",
  "set_starting_dreamwell_negative",
  "shuffle_negative_dreamwell_cards",
] as const;

const SERVICE_FAMILIES: readonly ServiceFamily[] = Object.freeze([
  {
    id: "dreamsign_counter",
    scene: "Dreamsign Counter",
    rewardFamilies: ["dreamsign"],
    costIds: [
      ...RESOURCE_PRICE_IDS,
      "gain_named_banes",
      "gain_named_banes_for_X_battles",
      "remove_dreamsign_sites_from_next_dreamscapes",
    ],
  },
  {
    id: "starter_surgery_shrine",
    scene: "Starter Surgery Shrine",
    rewardFamilies: ["starter"],
    costIds: [
      ...RESOURCE_PRICE_IDS,
      ...BURDEN_PRICE_IDS,
    ],
  },
  {
    id: "transfiguration_workshop",
    scene: "Transfiguration Workshop",
    rewardFamilies: ["transfiguration", "card"],
    costIds: [
      ...RESOURCE_PRICE_IDS,
      ...BURDEN_PRICE_IDS,
    ],
  },
  {
    id: "archive_draft_desk",
    scene: "Archive Draft Desk",
    rewardFamilies: ["draft"],
    costIds: [
      ...RESOURCE_PRICE_IDS,
      "gain_random_banes",
      "gain_named_banes",
      "battle_reward_reduction_flat",
      "battle_reward_reduction_percent",
      "shuffle_negative_dreamwell_cards",
    ],
  },
  {
    id: "essence_tithe_house",
    scene: "Essence Tithe House",
    rewardFamilies: ["resource"],
    costIds: [
      "pay_omens",
      "pay_max_essence",
      "gain_random_banes",
      "gain_named_banes",
      "gain_named_banes_for_X_battles",
      "battle_reward_reduction_flat",
      "battle_reward_reduction_percent",
      "set_starting_dreamwell_negative",
      "shuffle_negative_dreamwell_cards",
      "lose_max_essence",
    ],
  },
  {
    id: "route_broker",
    scene: "Route Broker",
    rewardFamilies: ["route"],
    costIds: [
      "pay_essence",
      "pay_omens",
      "gain_random_banes",
      "gain_named_banes",
      "gain_named_banes_for_X_battles",
      "battle_reward_reduction_flat",
      "battle_reward_reduction_percent",
      "remove_shop_sites_from_next_dreamscapes",
      "remove_dreamsign_sites_from_next_dreamscapes",
      "lose_max_essence",
    ],
    minRewardCec: 75,
  },
  {
    id: "bane_cleanser",
    scene: "Bane Cleanser",
    rewardFamilies: ["bane"],
    costIds: [
      ...RESOURCE_PRICE_IDS,
      "battle_reward_reduction_flat",
      "battle_reward_reduction_percent",
      "set_starting_dreamwell_negative",
      "shuffle_negative_dreamwell_cards",
    ],
    minRewardCec: 30,
  },
]);

type RolledServiceMenu = {
  readonly family: ServiceFamily;
  readonly rows: readonly [RolledService, RolledService, RolledService];
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

function sentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
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

function rewardFitsShape(
  rolled: RolledReward,
  stage: JourneyStage,
  minRewardCec: number,
): boolean {
  if (rolled.template.id === "meta_gain_2_rewards") return false;
  if (rolled.cec < minRewardCec) return false;
  if (rolled.cec > FAMILY_STAGE_CEC_LIMITS[stage]) return false;
  if (new Set(consumedRewardIds(rolled)).size !== consumedRewardIds(rolled).length) {
    return false;
  }

  return rolled.template.id !== ALL_PREDICATE_TRANSFIGURATION_REWARD_ID;
}

function costFitsShape(template: Cost, params: unknown, family: ServiceFamily): boolean {
  if (!SERVICE_PRICE_COST_IDS.has(template.id)) return false;
  if (!family.costIds.includes(template.id)) return false;
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
  family: ServiceFamily,
): RolledReward[] {
  const candidates: RolledReward[] = [];

  for (const template of REWARDS) {
    if (template.weight <= 0) continue;
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
    if (!rewardFitsShape(rolled, stage, family.minRewardCec ?? MIN_REWARD_CEC)) continue;
    if (!family.rewardFamilies.includes(rewardFamily(rolled))) continue;
    candidates.push(rolled);
  }

  return candidates;
}

function rollCostCandidates(
  ctx: JourneyContext,
  draw: DrawContext,
  reward: RolledReward,
  family: ServiceFamily,
): RolledCost[] {
  const candidates: RolledCost[] = [];
  const maxCostCec = reward.cec * MAX_COST_RATIO;

  for (const template of COSTS) {
    if (template.weight <= 0) continue;
    const params = template.rollParams(ctx, {
      ...draw,
      selectionAttempt:
        ((draw.selectionAttempt ?? 0) * 100) + template.id.length,
    });
    if (!template.viable(params as never, ctx)) continue;
    if (!costFitsShape(template, params, family)) continue;
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
  family: ServiceFamily,
  optionIndex: number,
): RolledCost | undefined {
  if (!family.costIds.includes("gain_named_banes")) return undefined;
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

function serviceFamilyCandidates(
  familyRestriction: string | undefined,
): readonly ServiceFamily[] {
  const families = SERVICE_FAMILIES.filter((family) =>
    familyRestriction === undefined ||
    family.rewardFamilies.includes(familyRestriction)
  );

  return families.length > 0 ? families : SERVICE_FAMILIES;
}

function orderedServiceFamilies(
  draw: DrawContext,
  familyRestriction: string | undefined,
  attempt: number,
): readonly ServiceFamily[] {
  const pool = serviceFamilyCandidates(familyRestriction);
  const start = drawInt(
    {
      ...draw,
      selectionAttempt: ((draw.selectionAttempt ?? 0) * 1000) + attempt,
    },
    `${SHAPE_LABEL}:service-family:${attempt}`,
    0,
    pool.length - 1,
  );

  return [...pool.slice(start), ...pool.slice(0, start)];
}

function pickServiceRows(args: ShapeFillArgs): RolledServiceMenu {
  const familyRestriction =
    typeof args.shapeArgs?.familyRestriction === "string"
      ? args.shapeArgs.familyRestriction
      : undefined;

  for (let attempt = 0; attempt < OFFER_ATTEMPTS; attempt += 1) {
    const attemptDraw = {
      ...args.drawContext,
      selectionAttempt: ((args.drawContext.selectionAttempt ?? 0) * 1000) + attempt,
    };
    for (const family of orderedServiceFamilies(attemptDraw, familyRestriction, attempt)) {
      const rewardCandidates = rollRewardCandidates(
        args.context,
        attemptDraw,
        args.stage,
        family,
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
          `${SHAPE_LABEL}:reward:${attempt}:${family.id}:${index}`,
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
          family,
        ).filter(
          (cost) =>
            !usedTexts.has(cost.rendered) &&
            consumedCostIds(cost).every((id) => !usedCostIds.has(id)),
        );
        if (costCandidates.length === 0) {
          const fallback = fallbackBaneCost(args.context, attemptDraw, reward, family, index);
          costCandidates = fallback === undefined ? [] : [fallback];
        }
        if (costCandidates.length === 0) break;
        const cost = weightedChoice(
          { ...attemptDraw, sequenceStep: (attemptDraw.sequenceStep ?? 0) * 100 + index },
          `${SHAPE_LABEL}:cost:${attempt}:${family.id}:${index}`,
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
        return {
          family,
          rows: rows as [RolledService, RolledService, RolledService],
        };
      }
    }
  }

  throw new Error(`${SHAPE_LABEL} fill could not roll three viable service rows`);
}

function renderOption(row: RolledService, family: ServiceFamily, ctx: JourneyContext): string {
  const costText = withoutLockedPrefix(row.cost.rendered);
  const rewardText = withoutLockedPrefix(
    row.reward.template.render(row.reward.params as never, ctx),
  );

  return `At the ${family.scene}, ${sentence(lowerFirst(rewardText))} ${sentence(costText)}`;
}

export function serviceMenuFill(args: ShapeFillArgs): FilledJourney {
  const menu = pickServiceRows(args);

  return {
    options: menu.rows.map((row, index) =>
      emptyOption(
        index + 1,
        renderOption(row, menu.family, args.context),
        row.reward.cec,
        row.cost.cec,
      ),
    ),
    precommitted: {},
  };
}
