import type { JourneyContext } from "../../../quest/context.js";
import { weightedChoice, type DrawContext } from "../../../util/rng.js";
import type { JourneyOption, JourneyStage } from "../../manifest.js";
import { REWARDS } from "../../shared/rewards.js";
import type { Reward } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_LABEL = "heterogeneous_pair";
const OFFER_ATTEMPTS = 32;
const INITIAL_MAX_SPREAD_RATIO = 1.35;
const SPREAD_RATIO_WIDEN_STEP = 0.1;

type RewardAxis =
  | "resource"
  | "card_gain"
  | "card_improvement"
  | "card_cleanup"
  | "starter"
  | "bane_cleanup"
  | "dreamsign"
  | "route"
  | "dreamwell"
  | "shop";

type TargetClass =
  | "resource"
  | "deck"
  | "card_pool"
  | "starter"
  | "bane"
  | "dreamsign"
  | "route"
  | "dreamwell"
  | "shop";

type OperationFamily =
  | "resource_gain"
  | "draft"
  | "gain"
  | "transform"
  | "transfigure"
  | "duplicate"
  | "cleanup"
  | "repair"
  | "discount"
  | "route_add"
  | "route_replace"
  | "route_weight"
  | "dreamwell_setup"
  | "temporary";

type ResultObjectType =
  | "resource"
  | "omen"
  | "card"
  | "card_upgrade"
  | "deck_trim"
  | "starter_repair"
  | "bane_removal"
  | "dreamsign"
  | "site"
  | "shop_economy"
  | "dreamwell_card";

type RewardProfile = {
  readonly targetClasses: ReadonlySet<TargetClass>;
  readonly operationFamilies: ReadonlySet<OperationFamily>;
  readonly resultObjectTypes: ReadonlySet<ResultObjectType>;
};

type RolledReward = {
  readonly template: Reward;
  readonly params: unknown;
  readonly cec: number;
  readonly text: string;
  readonly axes: ReadonlySet<RewardAxis>;
  readonly profile: RewardProfile;
  readonly consumedIds: readonly string[];
};

type RewardPair = readonly [RolledReward, RolledReward];

function emptyOption(
  number: number,
  reward: RolledReward,
): JourneyOption {
  return {
    number,
    symbols: [
      "semantic:reward",
      ...Array.from(reward.axes, (axis) => `axis:${axis}`),
      ...Array.from(reward.profile.targetClasses, (target) => `target:${target}`),
      ...Array.from(reward.profile.operationFamilies, (operation) => `operation:${operation}`),
      ...Array.from(reward.profile.resultObjectTypes, (result) => `result:${result}`),
    ],
    text: reward.text,
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence: reward.cec,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: reward.cec,
    pickBehavior: "record_and_generate_next",
  };
}

function subTemplateIds(
  rolled: { template: Reward; params: unknown },
): readonly string[] {
  if (rolled.template.id === "meta_gain_2_rewards") {
    return (rolled.params as { subIds: readonly [string, string] }).subIds;
  }

  return [];
}

function consumedTemplateIds(
  rolled: { template: Reward; params: unknown },
): readonly string[] {
  return [rolled.template.id, ...subTemplateIds(rolled)];
}

function rewardAxis(templateId: string): RewardAxis {
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
    ].includes(templateId)
  ) {
    return "card_gain";
  }

  if (
    [
      "apply_chosen_transfiguration_to_chosen_card",
      "apply_named_transfiguration_to_chosen_predicate_cards",
      "apply_named_transfiguration_to_card_name",
      "apply_named_transfiguration_to_random_predicate_cards",
      "change_card_to_become_type",
      "modify_random_cards_to_types",
      "make_random_cards_fast",
      "transform_card_in_deck_into_named",
      "transform_chosen_predicate_into_named",
      "duplicate_named_card_X",
      "duplicate_chosen_cards",
      "duplicate_random_predicate",
      "draw_X_and_duplicate_chosen",
      "make_card_reclaim",
      "make_random_cards_reclaim",
      "opening_hand_grant_for_X_battles",
      "temporary_card_copy_for_X_battles",
      "card_cost_reduction_for_X_battles",
      "apply_named_transfiguration_to_all_predicate_cards",
      "apply_random_transfigurations_to_random_cards",
    ].includes(templateId)
  ) {
    return "card_improvement";
  }

  if (
    [
      "purge_chosen_predicate_cards",
      "purge_chosen_predicate_with_replacement",
    ].includes(templateId)
  ) {
    return "card_cleanup";
  }

  if (
    [
      "transfigure_random_starters",
      "transfigure_all_starters",
      "purge_named_starter",
      "purge_random_starter",
      "purge_random_starter_with_predicate_replacement",
      "transform_starter_into_named_card",
      "transfigure_chosen_starters",
      "purge_chosen_starters",
      "purge_all_starters",
      "replace_starter_via_draft",
    ].includes(templateId)
  ) {
    return "starter";
  }

  if (["purge_X_banes", "purge_all_banes"].includes(templateId)) {
    return "bane_cleanup";
  }

  if (
    [
      "gain_random_dreamsign",
      "gain_named_dreamsign",
      "choose_1_of_X_dreamsigns",
      "gain_copy_of_random_dreamsign",
      "gain_copy_of_chosen_dreamsign",
      "transform_dreamsign_to_named",
      "temporary_dreamsign_for_X_battles",
    ].includes(templateId)
  ) {
    return "dreamsign";
  }

  if (
    [
      "add_site_to_dreamscape",
      "add_site_to_next_dreamscape",
      "boost_site_appearance_chance",
      "replace_site_type",
    ].includes(templateId)
  ) {
    return "route";
  }

  if (
    [
      "set_starting_dreamwell_positive",
      "shuffle_positive_dreamwell_cards",
    ].includes(templateId)
  ) {
    return "dreamwell";
  }

  if (
    [
      "next_X_shop_rerolls_free",
      "shop_essence_discount",
      "shop_omen_discount",
    ].includes(templateId)
  ) {
    return "shop";
  }

  return "card_improvement";
}

function rewardAxes(consumedIds: readonly string[]): ReadonlySet<RewardAxis> {
  return new Set(consumedIds.map(rewardAxis));
}

function profileForTemplateId(templateId: string): RewardProfile {
  switch (templateId) {
    case "gain_essence":
    case "set_essence_to_percent_of_max":
    case "gain_essence_random_range":
    case "gain_essence_to_max":
    case "increase_max_essence":
      return profile(["resource"], ["resource_gain"], ["resource"]);
    case "gain_omens":
      return profile(["resource"], ["resource_gain"], ["omen"]);
    case "gain_random_predicate_cards":
    case "gain_named_card":
      return profile(["card_pool"], ["gain"], ["card"]);
    case "draft_predicate_cards_from_4":
    case "take_any_from_predicate_choices":
    case "draft_2_predicate_cards_from_4":
    case "draft_predicate_card_with_copies":
    case "draft_predicate_card_with_transfiguration":
      return profile(["card_pool"], ["draft"], ["card"]);
    case "apply_chosen_transfiguration_to_chosen_card":
    case "apply_named_transfiguration_to_chosen_predicate_cards":
    case "apply_named_transfiguration_to_card_name":
    case "apply_named_transfiguration_to_random_predicate_cards":
    case "change_card_to_become_type":
    case "modify_random_cards_to_types":
    case "make_random_cards_fast":
    case "make_card_reclaim":
    case "make_random_cards_reclaim":
    case "apply_named_transfiguration_to_all_predicate_cards":
    case "apply_random_transfigurations_to_random_cards":
      return profile(["deck"], ["transfigure"], ["card_upgrade"]);
    case "transform_card_in_deck_into_named":
    case "transform_chosen_predicate_into_named":
      return profile(["deck"], ["transform"], ["card"]);
    case "duplicate_named_card_X":
    case "duplicate_chosen_cards":
    case "duplicate_random_predicate":
    case "draw_X_and_duplicate_chosen":
      return profile(["deck"], ["duplicate"], ["card"]);
    case "opening_hand_grant_for_X_battles":
    case "temporary_card_copy_for_X_battles":
    case "card_cost_reduction_for_X_battles":
      return profile(["deck"], ["temporary"], ["card_upgrade"]);
    case "purge_chosen_predicate_cards":
    case "purge_chosen_predicate_with_replacement":
      return profile(["deck"], ["cleanup"], ["deck_trim"]);
    case "transfigure_random_starters":
    case "transfigure_all_starters":
    case "transfigure_chosen_starters":
      return profile(["starter"], ["transfigure"], ["starter_repair"]);
    case "purge_named_starter":
    case "purge_random_starter":
    case "purge_chosen_starters":
    case "purge_all_starters":
      return profile(["starter"], ["cleanup"], ["starter_repair"]);
    case "purge_random_starter_with_predicate_replacement":
    case "transform_starter_into_named_card":
    case "replace_starter_via_draft":
      return profile(["starter"], ["repair"], ["starter_repair"]);
    case "purge_X_banes":
    case "purge_all_banes":
      return profile(["bane"], ["cleanup"], ["bane_removal"]);
    case "gain_random_dreamsign":
    case "gain_named_dreamsign":
    case "choose_1_of_X_dreamsigns":
      return profile(["dreamsign"], ["gain"], ["dreamsign"]);
    case "gain_copy_of_random_dreamsign":
    case "gain_copy_of_chosen_dreamsign":
      return profile(["dreamsign"], ["duplicate"], ["dreamsign"]);
    case "transform_dreamsign_to_named":
      return profile(["dreamsign"], ["transform"], ["dreamsign"]);
    case "temporary_dreamsign_for_X_battles":
      return profile(["dreamsign"], ["temporary"], ["dreamsign"]);
    case "add_site_to_dreamscape":
    case "add_site_to_next_dreamscape":
      return profile(["route"], ["route_add"], ["site"]);
    case "replace_site_type":
      return profile(["route"], ["route_replace"], ["site"]);
    case "boost_site_appearance_chance":
      return profile(["route"], ["route_weight"], ["site"]);
    case "set_starting_dreamwell_positive":
    case "shuffle_positive_dreamwell_cards":
      return profile(["dreamwell"], ["dreamwell_setup"], ["dreamwell_card"]);
    case "next_X_shop_rerolls_free":
    case "shop_essence_discount":
    case "shop_omen_discount":
      return profile(["shop"], ["discount"], ["shop_economy"]);
    default:
      return profile(["deck"], ["transfigure"], ["card_upgrade"]);
  }
}

function profile(
  targetClasses: readonly TargetClass[],
  operationFamilies: readonly OperationFamily[],
  resultObjectTypes: readonly ResultObjectType[],
): RewardProfile {
  return {
    targetClasses: new Set(targetClasses),
    operationFamilies: new Set(operationFamilies),
    resultObjectTypes: new Set(resultObjectTypes),
  };
}

function mergeProfiles(templateIds: readonly string[]): RewardProfile {
  const targetClasses = new Set<TargetClass>();
  const operationFamilies = new Set<OperationFamily>();
  const resultObjectTypes = new Set<ResultObjectType>();

  for (const templateId of templateIds) {
    const templateProfile = profileForTemplateId(templateId);
    for (const target of templateProfile.targetClasses) targetClasses.add(target);
    for (const operation of templateProfile.operationFamilies) operationFamilies.add(operation);
    for (const result of templateProfile.resultObjectTypes) resultObjectTypes.add(result);
  }

  return { targetClasses, operationFamilies, resultObjectTypes };
}

function hasAxisOverlap(
  left: ReadonlySet<RewardAxis>,
  right: ReadonlySet<RewardAxis>,
): boolean {
  for (const axis of left) {
    if (right.has(axis)) return true;
  }

  return false;
}

function spreadRatio(left: RolledReward, right: RolledReward): number {
  const lower = Math.max(1, Math.min(left.cec, right.cec));
  const upper = Math.max(left.cec, right.cec);

  return upper / lower;
}

function hasConsumedIdOverlap(left: RolledReward, right: RolledReward): boolean {
  const leftIds = new Set(left.consumedIds);

  return right.consumedIds.some((id) => leftIds.has(id));
}

function hasSetOverlap<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
  for (const value of left) {
    if (right.has(value)) return true;
  }

  return false;
}

function pairHasPlayerVisibleSeparation(left: RolledReward, right: RolledReward): boolean {
  const targetSeparated = !hasSetOverlap(left.profile.targetClasses, right.profile.targetClasses);
  const operationSeparated = !hasSetOverlap(left.profile.operationFamilies, right.profile.operationFamilies);
  const resultSeparated = !hasSetOverlap(left.profile.resultObjectTypes, right.profile.resultObjectTypes);

  if ([targetSeparated, operationSeparated, resultSeparated].filter(Boolean).length < 2) {
    return false;
  }

  const deckLikeTargets = new Set<TargetClass>(["deck", "card_pool", "starter"]);
  const leftDeckLike = Array.from(left.profile.targetClasses).some((target) => deckLikeTargets.has(target));
  const rightDeckLike = Array.from(right.profile.targetClasses).some((target) => deckLikeTargets.has(target));

  return !(leftDeckLike && rightDeckLike);
}

function minimumImpactForStage(stage: JourneyStage): number {
  switch (stage) {
    case "early":
      return 30;
    case "mid":
      return 40;
    case "late":
      return 65;
  }
}

function rollCandidates(
  ctx: JourneyContext,
  draw: DrawContext,
  attempt: number,
): RolledReward[] {
  const candidates: RolledReward[] = [];

  for (const template of REWARDS) {
    const params = template.rollParams(ctx, {
      ...draw,
      selectionAttempt:
        ((draw.selectionAttempt ?? 0) * 1000) +
        attempt * 100 +
        template.id.length,
    });
    if (!template.viable(params, ctx)) continue;

    const cec = template.cec(params, ctx);
    if (cec <= 0) continue;

    const consumedIds = consumedTemplateIds({ template, params });
    if (new Set(consumedIds).size !== consumedIds.length) continue;

    candidates.push({
      template,
      params,
      cec,
      text: template.render(params, ctx),
      axes: rewardAxes(consumedIds),
      profile: mergeProfiles(consumedIds),
      consumedIds,
    });
  }

  return candidates;
}

function pairCandidates(
  rewards: readonly RolledReward[],
  maxSpreadRatio: number,
  minimumImpact: number,
): RewardPair[] {
  const pairs: RewardPair[] = [];

  for (let leftIndex = 0; leftIndex < rewards.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < rewards.length;
      rightIndex += 1
    ) {
      const left = rewards[leftIndex]!;
      const right = rewards[rightIndex]!;

      if (left.text === right.text) continue;
      if (left.cec < minimumImpact || right.cec < minimumImpact) continue;
      if (hasAxisOverlap(left.axes, right.axes)) continue;
      if (hasConsumedIdOverlap(left, right)) continue;
      if (!pairHasPlayerVisibleSeparation(left, right)) continue;
      if (spreadRatio(left, right) > maxSpreadRatio) continue;

      pairs.push([left, right]);
    }
  }

  return pairs;
}

function rollPair(ctx: JourneyContext, draw: DrawContext, stage: JourneyStage): RewardPair {
  const minimumImpact = minimumImpactForStage(stage);

  for (let attempt = 0; attempt < OFFER_ATTEMPTS; attempt += 1) {
    const candidates = rollCandidates(ctx, draw, attempt);
    const maxSpreadRatio =
      INITIAL_MAX_SPREAD_RATIO + attempt * SPREAD_RATIO_WIDEN_STEP;
    const pairs = pairCandidates(candidates, maxSpreadRatio, minimumImpact);

    if (pairs.length > 0) {
      const picked = weightedChoice(
        {
          ...draw,
          selectionAttempt: ((draw.selectionAttempt ?? 0) * 1000) + attempt,
        },
        `${SHAPE_LABEL}:pair:${attempt}`,
        pairs.map((pair) => ({
          item: pair,
          weight:
            (pair[0].template.weight * pair[1].template.weight) /
            spreadRatio(pair[0], pair[1]),
        })),
      );

      return picked;
    }
  }

  throw new Error(`${SHAPE_LABEL} fill could not roll a viable heterogeneous pair`);
}

export function heterogeneousPairFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext, stage } = args;
  const pair = rollPair(context, drawContext, stage);

  return {
    options: pair.map((reward, index) => emptyOption(index + 1, reward)),
    precommitted: {},
  };
}
