import { drawInt, weightedChoice, type DrawContext } from "../../util/rng.js";
import { CARD_CEC, STAGE_MULTIPLIER, cardPoolCEC } from "./cec.js";
import {
  activeDreamsignCount,
  BANE_NAMES,
  cardMatches,
  essenceAmount,
  maxEssence,
  NEGATIVE_DREAMWELL_CARDS,
  omenAmount,
  pickFromList,
} from "./content.js";
import { PREDICATES, getPredicate } from "./predicates.js";
import { withLockedPrefix } from "./text.js";
import type { Cost, Predicate } from "./types.js";

type PayEssenceParams = { x: number };
const payEssence: Cost<PayEssenceParams> = {
  id: "pay_essence",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ x: 50 + 5 * drawInt(draw, "pay_essence:x", 0, 30) }),
  cec: (p) => p.x * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p, ctx) =>
    withLockedPrefix(`Pay ${p.x} essence`, p.x > essenceAmount(ctx)),
};

type PayOmensParams = { x: number };
const payOmens: Cost<PayOmensParams> = {
  id: "pay_omens",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ x: drawInt(draw, "pay_omens:x", 1, 2) }),
  cec: (p) => p.x * 40 * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p, ctx) =>
    withLockedPrefix(`Pay ${p.x} omen${p.x === 1 ? "" : "s"}`, p.x > omenAmount(ctx)),
};

type PayMaxEssenceParams = Record<string, never>;
const payMaxEssence: Cost<PayMaxEssenceParams> = {
  id: "pay_max_essence",
  weight: 1.0,
  rollParams: () => ({}),
  cec: (_p, ctx) => maxEssence(ctx) * STAGE_MULTIPLIER,
  viable: () => true,
  render: () => "Pay maximum essence",
};

type PayEssenceRangeParams = { min: number; max: number };
const payEssenceRandomRange: Cost<PayEssenceRangeParams> = {
  id: "pay_essence_random_range",
  weight: 1.0,
  rollParams: (_ctx, draw) => {
    const base = 30 + 10 * drawInt(draw, "pay_range:base", 0, 12);
    const spread = 30 + 10 * drawInt(draw, "pay_range:spread", 0, 6);
    return { min: base, max: base + spread };
  },
  cec: (p) => ((p.min + p.max) / 2) * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p) => `Pay ${p.min}-${p.max} essence (random roll)`,
};

type PayPercentEssenceParams = { percent: number };
const payPercentEssence: Cost<PayPercentEssenceParams> = {
  id: "pay_percent_essence",
  weight: 1.0,
  rollParams: (_ctx, draw) => {
    const choices = [25, 50, 75];
    return { percent: choices[drawInt(draw, "pay_pct:i", 0, choices.length - 1)]! };
  },
  cec: (p, ctx) => essenceAmount(ctx) * (p.percent / 100) * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p) => `Pay ${p.percent}% of your essence`,
};

type PayAllRemainingParams = Record<string, never>;
const payAllRemainingEssence: Cost<PayAllRemainingParams> = {
  id: "pay_all_remaining_essence",
  weight: 1.0,
  rollParams: () => ({}),
  cec: (_p, ctx) => essenceAmount(ctx) * STAGE_MULTIPLIER,
  viable: () => true,
  render: () => "Pay all remaining essence",
};

type BattleRedFlatParams = { amount: number; battles: number };
const battleRewardReductionFlat: Cost<BattleRedFlatParams> = {
  id: "battle_reward_reduction_flat",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    amount: 10 + 10 * drawInt(draw, "br_flat:a", 0, 4),
    battles: drawInt(draw, "br_flat:b", 1, 3),
  }),
  cec: (p) => p.amount * p.battles,
  viable: () => true,
  render: (p) =>
    `Battle essence rewards are reduced by ${p.amount} for the next ${p.battles} battle${p.battles === 1 ? "" : "s"}`,
};

type BattleRedPctParams = { percent: number; battles: number };
const battleRewardReductionPercent: Cost<BattleRedPctParams> = {
  id: "battle_reward_reduction_percent",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    percent: 10 + 10 * drawInt(draw, "br_pct:a", 0, 4),
    battles: drawInt(draw, "br_pct:b", 1, 3),
  }),
  cec: (p) => p.percent * p.battles * 0.5,
  viable: () => true,
  render: (p) =>
    `Battle essence rewards are reduced by ${p.percent}% for the next ${p.battles} battle${p.battles === 1 ? "" : "s"}`,
};

function rollPredicate(draw: DrawContext, label: string): Predicate {
  return weightedChoice(
    draw,
    label,
    PREDICATES.map((p) => ({ item: p, weight: 1 })),
  );
}

type PurgeNamedCardParams = { cardName: string };
const purgeNamedCard: Cost<PurgeNamedCardParams> = {
  id: "purge_named_card",
  weight: 1.0,
  rollParams: (ctx, draw) => ({
    cardName: ctx.content.cards.length > 0
      ? pickFromList(draw, "purge_named:c", ctx.content.cards).name
      : "Placeholder Card",
  }),
  cec: () => CARD_CEC * 0.5,
  viable: (_p, ctx) => ctx.state.quest.deck.summary.totalCards >= 1 && ctx.content.cards.length > 0,
  render: (p) => `Purge ${p.cardName}`,
};

type PurgeRandomPredCardParams = { predicateId: string };
const purgeRandomPredicateCard: Cost<PurgeRandomPredCardParams> = {
  id: "purge_random_predicate_card",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ predicateId: rollPredicate(draw, "purge_random_pred:p").id }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.5, 1, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= 1,
  render: (p) => `Purge a random ${getPredicate(p.predicateId).text.singular}`,
};

type PurgeChosenPredCardParams = { predicateId: string };
const purgeChosenPredicateCard: Cost<PurgeChosenPredCardParams> = {
  id: "purge_chosen_predicate_card",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ predicateId: rollPredicate(draw, "purge_chosen_pred_c:p").id }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.5, 1, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= 1,
  render: (p) => `Purge a chosen ${getPredicate(p.predicateId).text.singular}`,
};

type GainRandomFromPoolParams = { count: number };
const gainRandomCardsFromPool: Cost<GainRandomFromPoolParams> = {
  id: "gain_random_cards_from_pool",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "gain_random_pool:n", 1, 3) }),
  cec: (p) => CARD_CEC * 0.4 * p.count,
  viable: () => true,
  render: (p) => `Gain ${p.count} random card${p.count === 1 ? "" : "s"} from the card pool`,
};

type TransformCardToRandomParams = { cardName: string };
const transformCardToRandomPool: Cost<TransformCardToRandomParams> = {
  id: "transform_card_to_random_pool",
  weight: 1.0,
  rollParams: (ctx, draw) => ({
    cardName: ctx.content.cards.length > 0
      ? pickFromList(draw, "xform_random:c", ctx.content.cards).name
      : "Placeholder Card",
  }),
  cec: () => CARD_CEC * 0.5,
  viable: (_p, ctx) => ctx.state.quest.deck.summary.totalCards >= 1 && ctx.content.cards.length > 0,
  render: (p) => `Transform ${p.cardName} into a random card from the pool`,
};

type PurgeAllDuplicatesParams = Record<string, never>;
const purgeAllDuplicateCards: Cost<PurgeAllDuplicatesParams> = {
  id: "purge_all_duplicate_cards",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => CARD_CEC * 1.5,
  viable: (_p, ctx) => ctx.state.quest.deck.summary.totalCards >= 2,
  render: () => "Purge all duplicate cards from your deck",
};

const DREAMSIGN_CEC = 80;

type PurgeNamedDreamsignParams = { name: string };
const purgeNamedDreamsign: Cost<PurgeNamedDreamsignParams> = {
  id: "purge_named_dreamsign",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const pool = ctx.state.quest.activeDreamsigns;
    return {
      name: pool.length > 0
        ? `Dreamsign #${pickFromList(draw, "purge_named_ds:c", pool).dreamsignId}`
        : "Placeholder Dreamsign",
    };
  },
  cec: () => DREAMSIGN_CEC * 0.6,
  viable: (_p, ctx) => activeDreamsignCount(ctx) >= 1,
  render: (p) => `Purge ${p.name}`,
};

type PurgeRandomDreamsignParams = Record<string, never>;
const purgeRandomDreamsign: Cost<PurgeRandomDreamsignParams> = {
  id: "purge_random_dreamsign",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => DREAMSIGN_CEC * 0.5,
  viable: (_p, ctx) => activeDreamsignCount(ctx) >= 1,
  render: () => "Purge a random dreamsign",
};

type PurgeChosenDreamsignParams = Record<string, never>;
const purgeChosenDreamsign: Cost<PurgeChosenDreamsignParams> = {
  id: "purge_chosen_dreamsign",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => DREAMSIGN_CEC * 0.7,
  viable: (_p, ctx) => activeDreamsignCount(ctx) >= 1,
  render: () => "Purge a chosen dreamsign",
};

type XformDreamsignParams = Record<string, never>;
const transformDreamsignToRandom: Cost<XformDreamsignParams> = {
  id: "transform_dreamsign_to_random",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => DREAMSIGN_CEC * 0.4,
  viable: (_p, ctx) => activeDreamsignCount(ctx) >= 1,
  render: () => "Transform a chosen dreamsign into a random dreamsign",
};

type GainRandomBanesParams = { count: number };
const gainRandomBanes: Cost<GainRandomBanesParams> = {
  id: "gain_random_banes",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "gain_random_banes:n", 1, 3) }),
  cec: (p) => p.count * 30,
  viable: () => true,
  render: (p) => `Gain ${p.count} random bane${p.count === 1 ? "" : "s"}`,
};

type GainNamedBanesParams = { baneName: string; count: number };
const gainNamedBanes: Cost<GainNamedBanesParams> = {
  id: "gain_named_banes",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    baneName: pickFromList(draw, "gain_named_banes:b", BANE_NAMES),
    count: drawInt(draw, "gain_named_banes:n", 1, 3),
  }),
  cec: (p) => p.count * 30,
  viable: () => true,
  render: (p) => `Gain ${p.count} ${p.baneName}`,
};

type GainNamedBanesXBattlesParams = { baneName: string; count: number; battles: number };
const gainNamedBanesForXBattles: Cost<GainNamedBanesXBattlesParams> = {
  id: "gain_named_banes_for_X_battles",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    baneName: pickFromList(draw, "gain_named_banes_t:b", BANE_NAMES),
    count: drawInt(draw, "gain_named_banes_t:n", 1, 2),
    battles: drawInt(draw, "gain_named_banes_t:t", 1, 3),
  }),
  cec: (p) => p.count * 25 * p.battles * 0.5,
  viable: () => true,
  render: (p) =>
    `Gain ${p.count} ${p.baneName} for the next ${p.battles} battle${p.battles === 1 ? "" : "s"}`,
};

type GainAdditionalStartersParams = { count: number };
const gainAdditionalStarters: Cost<GainAdditionalStartersParams> = {
  id: "gain_additional_starters",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "extra_starters:n", 1, 3) }),
  cec: (p) => CARD_CEC * 0.5 * p.count,
  viable: () => true,
  render: (p) =>
    `Gain ${p.count} additional starter card${p.count === 1 ? "" : "s"}`,
};

type StartingDreamwellNegParams = { cardName: string; battles: number };
const setStartingDreamwellNegative: Cost<StartingDreamwellNegParams> = {
  id: "set_starting_dreamwell_negative",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    cardName: pickFromList(draw, "start_dw_neg:c", NEGATIVE_DREAMWELL_CARDS),
    battles: drawInt(draw, "start_dw_neg:b", 1, 3),
  }),
  cec: (p) => 60 * p.battles * 0.5,
  viable: () => true,
  render: (p) =>
    `Your starting dreamwell card is ${p.cardName} for the next ${p.battles} battle${p.battles === 1 ? "" : "s"}`,
};

type ShuffleNegDreamwellParams = { cardName: string; count: number; battles: number };
const shuffleNegativeDreamwellCards: Cost<ShuffleNegDreamwellParams> = {
  id: "shuffle_negative_dreamwell_cards",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    cardName: pickFromList(draw, "shuffle_dw_neg:c", NEGATIVE_DREAMWELL_CARDS),
    count: drawInt(draw, "shuffle_dw_neg:n", 1, 3),
    battles: drawInt(draw, "shuffle_dw_neg:b", 1, 3),
  }),
  cec: (p) => 25 * p.count * p.battles * 0.5,
  viable: () => true,
  render: (p) =>
    `Shuffle ${p.count} ${p.cardName} into your dreamwell for the next ${p.battles} battle${p.battles === 1 ? "" : "s"}`,
};

type RemoveTransfigCardParams = { cardName: string };
const removeTransfigurationFromCard: Cost<RemoveTransfigCardParams> = {
  id: "remove_transfiguration_from_card",
  weight: 1.0,
  rollParams: (ctx, draw) => ({
    cardName: ctx.content.cards.length > 0
      ? pickFromList(draw, "rem_transfig:c", ctx.content.cards).name
      : "Placeholder Card",
  }),
  cec: () => CARD_CEC * 0.6,
  viable: (_p, ctx) => ctx.content.cards.length > 0,
  render: (p) => `Remove the transfiguration from ${p.cardName}`,
};

type RemoveTransfigRandomPredParams = { predicateId: string; count: number };
const removeTransfigurationsFromRandomPredicate: Cost<RemoveTransfigRandomPredParams> = {
  id: "remove_transfigurations_from_random_predicate",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollPredicate(draw, "rem_transfig_rand:p").id,
    count: drawInt(draw, "rem_transfig_rand:n", 1, 3),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.5, p.count, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= p.count,
  render: (p) =>
    `Remove the transfigurations from ${p.count} random ${getPredicate(p.predicateId).text.plural}`,
};

type DrawXPurgeChosenParams = { drawCount: number };
const drawXPurgeChosen: Cost<DrawXPurgeChosenParams> = {
  id: "draw_X_purge_chosen",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ drawCount: drawInt(draw, "draw_purge:n", 2, 4) }),
  cec: () => CARD_CEC * 0.6,
  viable: (p, ctx) => ctx.state.quest.deck.summary.totalCards >= p.drawCount,
  render: (p) =>
    `Draw ${p.drawCount} cards from your deck and purge one of them of your choice`,
};

type RemoveShopSitesParams = { dreamscapes: number };
const removeShopSitesFromNextDreamscapes: Cost<RemoveShopSitesParams> = {
  id: "remove_shop_sites_from_next_dreamscapes",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ dreamscapes: drawInt(draw, "rm_shop:d", 1, 3) }),
  cec: (p) => 40 * p.dreamscapes,
  viable: () => true,
  render: (p) =>
    `Remove all shop sites from the next ${p.dreamscapes} dreamscape${p.dreamscapes === 1 ? "" : "s"} you visit`,
};

type RemoveDsSitesParams = { dreamscapes: number };
const removeDreamsignSitesFromNextDreamscapes: Cost<RemoveDsSitesParams> = {
  id: "remove_dreamsign_sites_from_next_dreamscapes",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ dreamscapes: drawInt(draw, "rm_ds:d", 1, 3) }),
  cec: (p) => 40 * p.dreamscapes,
  viable: () => true,
  render: (p) =>
    `Remove all dreamsign sites from the next ${p.dreamscapes} dreamscape${p.dreamscapes === 1 ? "" : "s"} you visit`,
};

export const COSTS: readonly Cost[] = Object.freeze([
  payEssence,
  payOmens,
  payMaxEssence,
  payEssenceRandomRange,
  payPercentEssence,
  payAllRemainingEssence,
  battleRewardReductionFlat,
  battleRewardReductionPercent,
  purgeNamedCard,
  purgeRandomPredicateCard,
  purgeChosenPredicateCard,
  gainRandomCardsFromPool,
  transformCardToRandomPool,
  purgeAllDuplicateCards,
  purgeNamedDreamsign,
  purgeRandomDreamsign,
  purgeChosenDreamsign,
  transformDreamsignToRandom,
  gainRandomBanes,
  gainNamedBanes,
  gainNamedBanesForXBattles,
  gainAdditionalStarters,
  setStartingDreamwellNegative,
  shuffleNegativeDreamwellCards,
  removeTransfigurationFromCard,
  removeTransfigurationsFromRandomPredicate,
  drawXPurgeChosen,
  removeShopSitesFromNextDreamscapes,
  removeDreamsignSitesFromNextDreamscapes,
] as unknown as Cost[]);

const BY_ID = new Map(COSTS.map((c) => [c.id, c]));

export function getCost(id: string): Cost {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown cost template id: ${id}`);
  return found;
}
