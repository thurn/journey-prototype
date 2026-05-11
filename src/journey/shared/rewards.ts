import { drawInt, weightedChoice, type DrawContext } from "../../util/rng.js";
import { CARD_CEC, STAGE_MULTIPLIER, cardPoolCEC } from "./cec.js";
import {
  ALLOWED_TRANSFIGURATIONS,
  cardMatches,
  essenceAmount,
  maxEssence,
  pickFromList,
  starterCardCount,
} from "./content.js";
import { PREDICATES, getPredicate } from "./predicates.js";
import type { Predicate, Reward } from "./types.js";

type GainEssenceParams = { x: number };
const gainEssence: Reward<GainEssenceParams> = {
  id: "gain_essence",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ x: 50 + 5 * drawInt(draw, "gain_essence:x", 0, 30) }),
  cec: (p) => p.x * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p) => `Gain ${p.x} essence`,
};

type GainOmensParams = { x: number };
const gainOmens: Reward<GainOmensParams> = {
  id: "gain_omens",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ x: drawInt(draw, "gain_omens:x", 1, 3) }),
  cec: (p) => p.x * 40 * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p) => `Gain ${p.x} omen${p.x === 1 ? "" : "s"}`,
};

type GainMaxEssenceParams = Record<string, never>;
const gainMaxEssence: Reward<GainMaxEssenceParams> = {
  id: "gain_max_essence",
  weight: 1.0,
  rollParams: () => ({}),
  cec: (_p, ctx) => maxEssence(ctx) * STAGE_MULTIPLIER,
  viable: () => true,
  render: () => "Gain maximum essence",
};

type SetEssencePctParams = { percent: number };
const setEssenceToPercentOfMax: Reward<SetEssencePctParams> = {
  id: "set_essence_to_percent_of_max",
  weight: 1.0,
  rollParams: (_ctx, draw) => {
    const choices = [50, 75, 100, 125];
    return { percent: choices[drawInt(draw, "set_essence_pct:i", 0, choices.length - 1)]! };
  },
  cec: (p, ctx) => Math.max(0, (maxEssence(ctx) * p.percent) / 100 - essenceAmount(ctx)) * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p) => `Set essence to ${p.percent}% of your maximum essence`,
};

type GainEssenceRangeParams = { min: number; max: number };
const gainEssenceRandomRange: Reward<GainEssenceRangeParams> = {
  id: "gain_essence_random_range",
  weight: 1.0,
  rollParams: (_ctx, draw) => {
    const base = 30 + 10 * drawInt(draw, "essence_range:base", 0, 12);
    const spread = 30 + 10 * drawInt(draw, "essence_range:spread", 0, 6);
    return { min: base, max: base + spread };
  },
  cec: (p) => ((p.min + p.max) / 2) * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p) => `Gain ${p.min}-${p.max} essence (random roll)`,
};

type GainEssenceToMaxParams = Record<string, never>;
const gainEssenceToMax: Reward<GainEssenceToMaxParams> = {
  id: "gain_essence_to_max",
  weight: 1.0,
  rollParams: () => ({}),
  cec: (_p, ctx) => Math.max(0, maxEssence(ctx) - essenceAmount(ctx)) * STAGE_MULTIPLIER,
  viable: () => true,
  render: () => "Gain essence up to your maximum",
};

function rollPredicate(draw: DrawContext, label: string): Predicate {
  return weightedChoice(
    draw,
    label,
    PREDICATES.map((p) => ({ item: p, weight: 1 })),
  );
}

type GainRandomCardsParams = { predicateId: string; count: number };
const gainRandomPredicateCards: Reward<GainRandomCardsParams> = {
  id: "gain_random_predicate_cards",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollPredicate(draw, "gain_random_predicate:pred").id,
    count: drawInt(draw, "gain_random_predicate:count", 1, 3),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC, p.count, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= p.count,
  render: (p) => {
    const pred = getPredicate(p.predicateId);
    const noun = p.count === 1 ? pred.text.singular : pred.text.plural;
    return `Gain ${p.count} random ${noun}`;
  },
};

type DraftPredicateParams = { predicateId: string };
const draftPredicateCardsFrom4: Reward<DraftPredicateParams> = {
  id: "draft_predicate_cards_from_4",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ predicateId: rollPredicate(draw, "draft_predicate:pred").id }),
  cec: (p) => cardPoolCEC(CARD_CEC * 1.5, 1, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= 4,
  render: (p) => `Draft 1 of 4 ${getPredicate(p.predicateId).text.plural}`,
};

type TakeAnyParams = { predicateId: string; choices: number };
const takeAnyFromPredicateChoices: Reward<TakeAnyParams> = {
  id: "take_any_from_predicate_choices",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollPredicate(draw, "take_any:pred").id,
    choices: drawInt(draw, "take_any:choices", 3, 5),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 1.2, p.choices / 2, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= p.choices,
  render: (p) =>
    `Take any number of ${getPredicate(p.predicateId).text.plural} from ${p.choices} choices`,
};

type GainNamedCardParams = { name: string };
const gainNamedCard: Reward<GainNamedCardParams> = {
  id: "gain_named_card",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const pool = ctx.content.cards;
    if (pool.length === 0) return { name: "Placeholder Card" };
    const card = pickFromList(draw, "gain_named_card:card", pool);
    return { name: card.name };
  },
  cec: () => CARD_CEC * STAGE_MULTIPLIER,
  viable: (_p, ctx) => ctx.content.cards.length > 0,
  render: (p) => `Gain ${p.name}`,
};

const CARD_TYPES = ["warriors", "survivors", "spirit animals"] as const;

type ApplyChosenTransfigChosenCardParams = Record<string, never>;
const applyChosenTransfigurationToChosenCard: Reward<ApplyChosenTransfigChosenCardParams> = {
  id: "apply_chosen_transfiguration_to_chosen_card",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => CARD_CEC * 1.5,
  viable: (_p, ctx) => ctx.content.cards.length > 0,
  render: () => "Apply a transfiguration of your choice to a chosen card",
};

type ApplyNamedTransfigPredCardsParams = { transfiguration: string; predicateId: string; count: number };
const applyNamedTransfigurationToChosenPredicateCards: Reward<ApplyNamedTransfigPredCardsParams> = {
  id: "apply_named_transfiguration_to_chosen_predicate_cards",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    transfiguration: pickFromList(draw, "named_transfig_chosen:t", ALLOWED_TRANSFIGURATIONS),
    predicateId: rollPredicate(draw, "named_transfig_chosen:p").id,
    count: drawInt(draw, "named_transfig_chosen:n", 1, 3),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.8, p.count, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= p.count,
  render: (p) =>
    `Apply ${p.transfiguration} to ${p.count} chosen ${getPredicate(p.predicateId).text.plural}`,
};

type ApplyNamedTransfigCardNameParams = { transfiguration: string; cardName: string };
const applyNamedTransfigurationToCardName: Reward<ApplyNamedTransfigCardNameParams> = {
  id: "apply_named_transfiguration_to_card_name",
  weight: 1.0,
  rollParams: (ctx, draw) => ({
    transfiguration: pickFromList(draw, "named_transfig_named:t", ALLOWED_TRANSFIGURATIONS),
    cardName: ctx.content.cards.length > 0
      ? pickFromList(draw, "named_transfig_named:c", ctx.content.cards).name
      : "Placeholder Card",
  }),
  cec: () => CARD_CEC * 0.8,
  viable: (_p, ctx) => ctx.content.cards.length > 0,
  render: (p) => `Apply ${p.transfiguration} to ${p.cardName}`,
};

type ApplyNamedTransfigRandomPredParams = { transfiguration: string; predicateId: string; count: number };
const applyNamedTransfigurationToRandomPredicateCards: Reward<ApplyNamedTransfigRandomPredParams> = {
  id: "apply_named_transfiguration_to_random_predicate_cards",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    transfiguration: pickFromList(draw, "named_transfig_random:t", ALLOWED_TRANSFIGURATIONS),
    predicateId: rollPredicate(draw, "named_transfig_random:p").id,
    count: drawInt(draw, "named_transfig_random:n", 1, 3),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.6, p.count, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= p.count,
  render: (p) =>
    `Apply ${p.transfiguration} to ${p.count} random ${getPredicate(p.predicateId).text.plural}`,
};

type TransfigureRandomStartersParams = { count: number };
const transfigureRandomStarters: Reward<TransfigureRandomStartersParams> = {
  id: "transfigure_random_starters",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "transfig_random_starters:n", 1, 3) }),
  cec: (p) => CARD_CEC * 0.7 * p.count,
  viable: (p, ctx) => starterCardCount(ctx) >= p.count,
  render: (p) => `Transfigure ${p.count} random starter card${p.count === 1 ? "" : "s"}`,
};

type TransfigureAllStartersParams = Record<string, never>;
const transfigureAllStarters: Reward<TransfigureAllStartersParams> = {
  id: "transfigure_all_starters",
  weight: 1.0,
  rollParams: () => ({}),
  cec: (_p, ctx) => CARD_CEC * 0.7 * Math.max(1, starterCardCount(ctx)),
  viable: (_p, ctx) => starterCardCount(ctx) >= 1,
  render: () => "Transfigure all starter cards",
};

type ModifyCardRefTypeParams = { cardName: string; cardType: string };
const modifyCardToReferenceType: Reward<ModifyCardRefTypeParams> = {
  id: "modify_card_to_reference_type",
  weight: 1.0,
  rollParams: (ctx, draw) => ({
    cardName: ctx.content.cards.length > 0
      ? pickFromList(draw, "modify_ref:c", ctx.content.cards).name
      : "Placeholder Card",
    cardType: pickFromList(draw, "modify_ref:t", CARD_TYPES),
  }),
  cec: () => CARD_CEC * 0.5,
  viable: (_p, ctx) => ctx.content.cards.length > 0,
  render: (p) => `Modify ${p.cardName}'s text to reference ${p.cardType}`,
};

type ChangeCardBecomeTypeParams = { cardName: string; cardType: string };
const changeCardToBecomeType: Reward<ChangeCardBecomeTypeParams> = {
  id: "change_card_to_become_type",
  weight: 1.0,
  rollParams: (ctx, draw) => ({
    cardName: ctx.content.cards.length > 0
      ? pickFromList(draw, "change_become:c", ctx.content.cards).name
      : "Placeholder Card",
    cardType: pickFromList(draw, "change_become:t", CARD_TYPES),
  }),
  cec: () => CARD_CEC * 0.6,
  viable: (_p, ctx) => ctx.content.cards.length > 0,
  render: (p) => `Change ${p.cardName} to become a ${p.cardType}`,
};

type ModifyRandomCardsToTypesParams = { count: number; cardType: string };
const modifyRandomCardsToTypes: Reward<ModifyRandomCardsToTypesParams> = {
  id: "modify_random_cards_to_types",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    count: drawInt(draw, "modify_random_types:n", 1, 3),
    cardType: pickFromList(draw, "modify_random_types:t", CARD_TYPES),
  }),
  cec: (p) => CARD_CEC * 0.5 * p.count,
  viable: (p, ctx) => ctx.content.cards.length >= p.count,
  render: (p) => `Modify ${p.count} random cards to become ${p.cardType}`,
};

type MakeCardFastParams = { cardName: string };
const makeCardFast: Reward<MakeCardFastParams> = {
  id: "make_card_fast",
  weight: 1.0,
  rollParams: (ctx, draw) => ({
    cardName: ctx.content.cards.length > 0
      ? pickFromList(draw, "make_fast:c", ctx.content.cards).name
      : "Placeholder Card",
  }),
  cec: () => CARD_CEC * 0.5,
  viable: (_p, ctx) => ctx.content.cards.length > 0,
  render: (p) => `Change ${p.cardName} to have fast`,
};

type MakeRandomCardsFastParams = { count: number };
const makeRandomCardsFast: Reward<MakeRandomCardsFastParams> = {
  id: "make_random_cards_fast",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "make_random_fast:n", 1, 3) }),
  cec: (p) => CARD_CEC * 0.5 * p.count,
  viable: (p, ctx) => ctx.content.cards.length >= p.count,
  render: (p) => `Change ${p.count} random card${p.count === 1 ? "" : "s"} to have fast`,
};

export const REWARDS: readonly Reward[] = Object.freeze([
  gainEssence,
  gainOmens,
  gainMaxEssence,
  setEssenceToPercentOfMax,
  gainEssenceRandomRange,
  gainEssenceToMax,
  gainRandomPredicateCards,
  draftPredicateCardsFrom4,
  takeAnyFromPredicateChoices,
  gainNamedCard,
  applyChosenTransfigurationToChosenCard,
  applyNamedTransfigurationToChosenPredicateCards,
  applyNamedTransfigurationToCardName,
  applyNamedTransfigurationToRandomPredicateCards,
  transfigureRandomStarters,
  transfigureAllStarters,
  modifyCardToReferenceType,
  changeCardToBecomeType,
  modifyRandomCardsToTypes,
  makeCardFast,
  makeRandomCardsFast,
] as unknown as Reward[]);

const BY_ID = new Map(REWARDS.map((r) => [r.id, r]));

export function getReward(id: string): Reward {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown reward template id: ${id}`);
  return found;
}
