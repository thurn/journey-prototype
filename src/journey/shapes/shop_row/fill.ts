import type { JourneyContext } from "../../../quest/context.js";
import { drawInt, weightedChoice, type DrawContext } from "../../../util/rng.js";
import type { JourneyOperation, JourneyOption, JourneyStage } from "../../manifest.js";
import { getCost } from "../../shared/costs.js";
import { REWARDS } from "../../shared/rewards.js";
import { joinSnippets } from "../../shared/text.js";
import type { Reward } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_LABEL = "shop_row";
const ROW_COUNT = 3;
const PAY_ESSENCE = getCost("pay_essence");
const PRICE_STEP = 5;
const MAX_DOMINANCE_ADJUSTMENTS = 8;

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

const SHOP_ROW_EXCLUDED_REWARD_IDS = new Set([
  "apply_named_transfiguration_to_all_predicate_cards",
  "take_any_from_predicate_choices",
]);

type RolledReward = {
  readonly template: Reward;
  readonly params: unknown;
  readonly cec: number;
  readonly rendered: string;
};

type PricedReward = {
  readonly reward: RolledReward;
  price: number;
  costCec: number;
};

type TransfigurationDominanceProfile = {
  readonly family: "transfiguration";
  readonly control: number;
  readonly scope: number;
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
  if (SHOP_ROW_EXCLUDED_REWARD_IDS.has(template.id)) {
    return undefined;
  }

  const params = template.rollParams(context, {
    ...drawContext,
    sequenceStep: (drawContext.sequenceStep ?? 0) * 100 + rowIndex,
    selectionAttempt:
      ((drawContext.selectionAttempt ?? 0) * 100) + template.id.length,
  });

  if (!template.viable(params, context)) {
    return undefined;
  }

  const cec = template.cec(params, context);

  if (cec <= 0) {
    return undefined;
  }

  return {
    template,
    params,
    cec,
    rendered: template.render(params, context),
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

    if (
      !rolled ||
      alreadyUsed(rolled, used) ||
      consumedRewardIds(rolled).some((id) => SHOP_ROW_EXCLUDED_REWARD_IDS.has(id))
    ) {
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

function baseShopPrice(args: {
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

function pricedReward(
  reward: RolledReward,
  number: number,
  args: ShapeFillArgs,
): PricedReward {
  const price = baseShopPrice({
    context: args.context,
    drawContext: args.drawContext,
    rewardCec: reward.cec,
    stage: args.stage,
    rowIndex: number,
  });

  return {
    reward,
    price,
    costCec: PAY_ESSENCE.cec({ x: price }, args.context),
  };
}

function transfigurationDominanceProfile(
  reward: RolledReward,
): TransfigurationDominanceProfile | undefined {
  switch (reward.template.id) {
    case "apply_chosen_transfiguration_to_chosen_card":
      return { family: "transfiguration", control: 5, scope: 5 };
    case "apply_named_transfiguration_to_chosen_predicate_cards":
      return { family: "transfiguration", control: 4, scope: 3 };
    case "transfigure_chosen_starters":
      return { family: "transfiguration", control: 3, scope: 1 };
    case "apply_named_transfiguration_to_random_predicate_cards":
      return { family: "transfiguration", control: 2, scope: 3 };
    case "apply_random_transfigurations_to_random_cards":
      return { family: "transfiguration", control: 1, scope: 4 };
    case "transfigure_random_starters":
      return { family: "transfiguration", control: 1, scope: 1 };
    default:
      return undefined;
  }
}

function dominatedBySamePriceReward(
  candidate: PricedReward,
  allRows: readonly PricedReward[],
): boolean {
  const candidateProfile = transfigurationDominanceProfile(candidate.reward);
  if (!candidateProfile) {
    return false;
  }

  return allRows.some((other) => {
    if (other === candidate || other.price !== candidate.price) {
      return false;
    }

    const otherProfile = transfigurationDominanceProfile(other.reward);
    if (!otherProfile || otherProfile.family !== candidateProfile.family) {
      return false;
    }

    return otherProfile.control > candidateProfile.control &&
      otherProfile.scope >= candidateProfile.scope &&
      other.reward.cec >= candidate.reward.cec;
  });
}

function adjustDominatedEqualPriceRows(rows: PricedReward[], context: JourneyContext): PricedReward[] {
  for (let attempt = 0; attempt < MAX_DOMINANCE_ADJUSTMENTS; attempt += 1) {
    const dominated = rows.find((row) => dominatedBySamePriceReward(row, rows));

    if (!dominated) {
      return rows;
    }

    dominated.price = Math.max(PRICE_STEP, dominated.price - PRICE_STEP);
    dominated.costCec = PAY_ESSENCE.cec({ x: dominated.price }, context);
  }

  return rows;
}

function rewardKindFor(templateId: string): Extract<JourneyOperation, { operationKind: "reward" }>["rewardKind"] {
  switch (templateId) {
    case "gain_essence":
    case "gain_omens":
    case "gain_essence_random_range":
      return "resource";
    case "set_essence_to_percent_of_max":
      return "resource_percentage";
    case "gain_essence_to_max":
      return "resource_restore_to_maximum";
    case "increase_max_essence":
      return "resource_cap_change";
    case "gain_random_predicate_cards":
    case "gain_named_card":
      return "card_gain";
    case "draft_predicate_cards_from_4":
    case "take_any_from_predicate_choices":
    case "draft_2_predicate_cards_from_4":
    case "draft_predicate_card_with_copies":
    case "draft_predicate_card_with_transfiguration":
      return "card_draft";
    case "apply_chosen_transfiguration_to_chosen_card":
    case "apply_named_transfiguration_to_chosen_predicate_cards":
    case "apply_named_transfiguration_to_card_name":
    case "apply_named_transfiguration_to_random_predicate_cards":
    case "transfigure_random_starters":
    case "transfigure_all_starters":
    case "transfigure_chosen_starters":
    case "apply_random_transfigurations_to_random_cards":
      return "card_transfigure";
    case "change_card_to_become_type":
    case "modify_random_cards_to_types":
      return "card_type_change";
    case "make_random_cards_fast":
    case "make_card_reclaim":
    case "make_random_cards_reclaim":
      return "card_keyword_add";
    case "purge_chosen_predicate_cards":
    case "purge_chosen_predicate_with_replacement":
    case "purge_named_starter":
    case "purge_random_starter":
    case "purge_random_starter_with_predicate_replacement":
    case "purge_chosen_starters":
    case "purge_all_starters":
      return "card_purge";
    case "transform_starter_into_named_card":
    case "transform_card_in_deck_into_named":
    case "transform_chosen_predicate_into_named":
      return "card_transform";
    case "replace_starter_via_draft":
      return "starter_replacement";
    case "duplicate_named_card_X":
    case "duplicate_chosen_cards":
    case "duplicate_random_predicate":
    case "draw_X_and_duplicate_chosen":
      return "card_duplicate";
    case "opening_hand_grant_for_X_battles":
      return "card_opening_hand";
    case "temporary_card_copy_for_X_battles":
      return "card_temporary_copy";
    case "card_cost_reduction_for_X_battles":
      return "card_rewrite";
    case "purge_X_banes":
      return "bane_chosen_purge";
    case "purge_all_banes":
      return "bane_purge";
    case "gain_random_dreamsign":
    case "gain_named_dreamsign":
    case "gain_copy_of_random_dreamsign":
    case "gain_copy_of_chosen_dreamsign":
    case "temporary_dreamsign_for_X_battles":
      return "dreamsign_gain";
    case "choose_1_of_X_dreamsigns":
      return "dreamsign_draft";
    case "transform_dreamsign_to_named":
      return "dreamsign_transform";
    case "set_starting_dreamwell_positive":
    case "shuffle_positive_dreamwell_cards":
      return "dreamwell_modifier";
    case "next_X_shop_rerolls_free":
    case "shop_essence_discount":
    case "shop_omen_discount":
      return "shop_economy_modifier";
    case "boost_site_appearance_chance":
      return "battle_window_modifier";
    case "meta_gain_2_rewards":
      return "random_series";
    default:
      return "unknown";
  }
}

function rewardOperationFor(
  number: number,
  reward: RolledReward,
): JourneyOperation {
  const operationId = `${SHAPE_LABEL}:${number}:reward:${reward.template.id}`;

  if (
    reward.template.id === "add_site_to_dreamscape" ||
    reward.template.id === "add_site_to_next_dreamscape"
  ) {
    const timing = reward.template.id === "add_site_to_next_dreamscape"
      ? { timingKind: "route" as const, scope: "next_dreamscape" as const }
      : { timingKind: "immediate" as const };

    return {
      operationId,
      operationKind: "route_edit",
      role: "route_edit",
      editKind: "add_site",
      visibility: "visible",
      timing,
      value: { convertedEssence: reward.cec },
      payload: {
        templateId: reward.template.id,
        rendered: reward.rendered,
        siteType: (reward.params as { siteType?: string }).siteType,
      },
    };
  }

  if (reward.template.id === "replace_site_type") {
    const params = reward.params as { fromType?: string; toType?: string };
    return {
      operationId,
      operationKind: "route_edit",
      role: "route_edit",
      editKind: "replace_site",
      fromSite: params.fromType,
      toSite: params.toType,
      visibility: "visible",
      timing: { timingKind: "immediate" },
      value: { convertedEssence: reward.cec },
      payload: {
        templateId: reward.template.id,
        rendered: reward.rendered,
        fromType: params.fromType,
        toType: params.toType,
      },
    };
  }

  return {
    operationId,
    operationKind: "reward",
    role: "reward",
    rewardKind: rewardKindFor(reward.template.id),
    visibility: "visible",
    timing: { timingKind: "immediate" },
    value: { convertedEssence: reward.cec },
    payload: {
      templateId: reward.template.id,
      rendered: reward.rendered,
    },
  };
}

function shopOperations(
  number: number,
  priced: PricedReward,
): JourneyOperation[] {
  return [
    {
      operationId: `${SHAPE_LABEL}:${number}:cost`,
      operationKind: "cost",
      role: "cost",
      costKind: "resource",
      resource: "essence",
      amount: priced.price,
      visibility: "visible",
      timing: { timingKind: "immediate" },
      value: { convertedEssence: priced.costCec },
      payload: {
        templateId: "pay_essence",
        price: priced.price,
      },
    },
    rewardOperationFor(number, priced.reward),
  ];
}

function shopOption(
  number: number,
  priced: PricedReward,
): JourneyOption {
  const { reward, price, costCec } = priced;
  const text = joinSnippets([
    `Pay ${price} essence`,
    reward.rendered,
  ]);

  return {
    number,
    symbols: ["shop", "cost", "reward"],
    text,
    operations: shopOperations(number, priced),
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
  const priced = adjustDominatedEqualPriceRows(
    rollShopRewards(args).map((reward, index) =>
      pricedReward(reward, index + 1, args)
    ),
    args.context,
  );

  return {
    presentation: { flatMenuHeader: "Take any number:" },
    options: priced.map((reward, index) => shopOption(index + 1, reward)),
    precommitted: {},
  };
}
