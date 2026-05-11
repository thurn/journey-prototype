import { drawInt, weightedChoice, type DrawContext } from "../../util/rng.js";
import { CARD_CEC, STAGE_MULTIPLIER, cardPoolCEC } from "./cec.js";
import {
  cardMatches,
  essenceAmount,
  maxEssence,
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
] as unknown as Cost[]);

const BY_ID = new Map(COSTS.map((c) => [c.id, c]));

export function getCost(id: string): Cost {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown cost template id: ${id}`);
  return found;
}
