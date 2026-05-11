import { drawInt, weightedChoice, type DrawContext } from "../../util/rng.js";
import { CARD_CEC, STAGE_MULTIPLIER, cardPoolCEC } from "./cec.js";
import {
  ALLOWED_TRANSFIGURATIONS,
  POSITIVE_DREAMWELL_CARDS,
  SITE_TYPES,
  baneCount,
  cardMatches,
  dreamsignMatches,
  essenceAmount,
  maxEssence,
  pickFromList,
  starterCardCount,
} from "./content.js";
import { PREDICATES, getPredicate } from "./predicates.js";
import type { Predicate, Reward, TemplateParams } from "./types.js";

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

const CARD_TYPE_PREDICATE_IDS = ["warriors", "survivors", "spirit_animals"] as const;

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
  render: (p) => {
    const pred = getPredicate(p.predicateId);
    const noun = p.count === 1 ? pred.text.singular : pred.text.plural;
    return `Apply ${p.transfiguration} to ${p.count} chosen ${noun}`;
  },
};

type ApplyNamedTransfigCardNameParams = { transfiguration: string; cardName: string };
const applyNamedTransfigurationToCardName: Reward<ApplyNamedTransfigCardNameParams> = {
  id: "apply_named_transfiguration_to_card_name",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const deckCards = cardMatches(ctx, { source: "deck" });
    return {
      transfiguration: pickFromList(draw, "named_transfig_named:t", ALLOWED_TRANSFIGURATIONS),
      cardName: deckCards.length > 0
        ? pickFromList(draw, "named_transfig_named:c", deckCards).name
        : "Placeholder Card",
    };
  },
  cec: () => CARD_CEC * 0.8,
  viable: (_p, ctx) => cardMatches(ctx, { source: "deck" }).length >= 1,
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
  render: (p) => {
    const pred = getPredicate(p.predicateId);
    const noun = p.count === 1 ? pred.text.singular : pred.text.plural;
    return `Apply ${p.transfiguration} to ${p.count} random ${noun}`;
  },
};

type TransfigureRandomStartersParams = { count: number };
const transfigureRandomStarters: Reward<TransfigureRandomStartersParams> = {
  id: "transfigure_random_starters",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "transfig_random_starters:n", 1, 3) }),
  cec: (p) => CARD_CEC * 0.7 * p.count,
  viable: (p, ctx) => starterCardCount(ctx) >= p.count,
  render: (p) =>
    p.count === 1
      ? "Apply a random transfiguration to 1 random starter card"
      : `Apply random transfigurations to ${p.count} random starter cards`,
};

type TransfigureAllStartersParams = Record<string, never>;
const transfigureAllStarters: Reward<TransfigureAllStartersParams> = {
  id: "transfigure_all_starters",
  weight: 1.0,
  rollParams: () => ({}),
  cec: (_p, ctx) => CARD_CEC * 0.7 * Math.max(1, starterCardCount(ctx)),
  viable: (_p, ctx) => starterCardCount(ctx) >= 1,
  render: () => "Apply a random transfiguration to each starter card",
};

type ModifyCardRefTypeParams = { cardName: string; cardTypePredicateId: string };
const modifyCardToReferenceType: Reward<ModifyCardRefTypeParams> = {
  id: "modify_card_to_reference_type",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const deckCards = cardMatches(ctx, { source: "deck" });
    return {
      cardName: deckCards.length > 0
        ? pickFromList(draw, "modify_ref:c", deckCards).name
        : "Placeholder Card",
      cardTypePredicateId: pickFromList(draw, "modify_ref:t", CARD_TYPE_PREDICATE_IDS),
    };
  },
  cec: () => CARD_CEC * 0.5,
  viable: (_p, ctx) => cardMatches(ctx, { source: "deck" }).length >= 1,
  render: (p) =>
    `Modify ${p.cardName}'s text to reference ${getPredicate(p.cardTypePredicateId).text.plural}`,
};

type ChangeCardBecomeTypeParams = { cardName: string; cardTypePredicateId: string };
const changeCardToBecomeType: Reward<ChangeCardBecomeTypeParams> = {
  id: "change_card_to_become_type",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const deckCards = cardMatches(ctx, { source: "deck" });
    return {
      cardName: deckCards.length > 0
        ? pickFromList(draw, "change_become:c", deckCards).name
        : "Placeholder Card",
      cardTypePredicateId: pickFromList(draw, "change_become:t", CARD_TYPE_PREDICATE_IDS),
    };
  },
  cec: () => CARD_CEC * 0.6,
  viable: (_p, ctx) => cardMatches(ctx, { source: "deck" }).length >= 1,
  render: (p) => {
    const singular = getPredicate(p.cardTypePredicateId).text.singular;
    const article = /^[aeiou]/i.test(singular) ? "an" : "a";
    return `Change ${p.cardName} to become ${article} ${singular}`;
  },
};

type ModifyRandomCardsToTypesParams = { count: number; cardTypePredicateId: string };
const modifyRandomCardsToTypes: Reward<ModifyRandomCardsToTypesParams> = {
  id: "modify_random_cards_to_types",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    count: drawInt(draw, "modify_random_types:n", 1, 3),
    cardTypePredicateId: pickFromList(draw, "modify_random_types:t", CARD_TYPE_PREDICATE_IDS),
  }),
  cec: (p) => CARD_CEC * 0.5 * p.count,
  viable: (p, ctx) => ctx.content.cards.length >= p.count,
  render: (p) =>
    `Modify ${p.count} random cards to become ${getPredicate(p.cardTypePredicateId).text.plural}`,
};

type MakeCardFastParams = { cardName: string };
const makeCardFast: Reward<MakeCardFastParams> = {
  id: "make_card_fast",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const deckCards = cardMatches(ctx, { source: "deck" });
    return {
      cardName: deckCards.length > 0
        ? pickFromList(draw, "make_fast:c", deckCards).name
        : "Placeholder Card",
    };
  },
  cec: () => CARD_CEC * 0.5,
  viable: (_p, ctx) => cardMatches(ctx, { source: "deck" }).length >= 1,
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

type PurgeChosenPredCardsParams = { predicateId: string; count: number };
const purgeChosenPredicateCards: Reward<PurgeChosenPredCardsParams> = {
  id: "purge_chosen_predicate_cards",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollPredicate(draw, "purge_chosen_pred:p").id,
    count: drawInt(draw, "purge_chosen_pred:n", 1, 3),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.3, p.count, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= 1,
  render: (p) => {
    const pred = getPredicate(p.predicateId);
    const noun = p.count === 1 ? pred.text.singular : pred.text.plural;
    return `Purge up to ${p.count} chosen ${noun}`;
  },
};

type PurgeChosenPredWithReplParams = { predicateId: string; count: number };
const purgeChosenPredicateWithReplacement: Reward<PurgeChosenPredWithReplParams> = {
  id: "purge_chosen_predicate_with_replacement",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollPredicate(draw, "purge_repl:p").id,
    count: drawInt(draw, "purge_repl:n", 1, 2),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.6, p.count, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= 1,
  render: (p) => {
    const pred = getPredicate(p.predicateId);
    if (p.count === 1) {
      return `Transform a chosen ${pred.text.singular} into a random ${pred.text.singular}`;
    }
    return `Transform up to ${p.count} chosen ${pred.text.plural} into random ${pred.text.plural}`;
  },
};

type PurgeNamedStarterParams = { cardName: string };
const purgeNamedStarter: Reward<PurgeNamedStarterParams> = {
  id: "purge_named_starter",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const starters = cardMatches(ctx, { starter: true });
    return {
      cardName: starters.length > 0
        ? pickFromList(draw, "purge_named_starter:c", starters).name
        : "Placeholder Starter",
    };
  },
  cec: () => CARD_CEC * 0.4,
  viable: (_p, ctx) => cardMatches(ctx, { starter: true }).length >= 1,
  render: (p) => `Purge ${p.cardName}`,
};

type PurgeRandomStarterParams = Record<string, never>;
const purgeRandomStarter: Reward<PurgeRandomStarterParams> = {
  id: "purge_random_starter",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => CARD_CEC * 0.4,
  viable: (_p, ctx) => starterCardCount(ctx) >= 1,
  render: () => "Purge a random starter card",
};

type PurgeRandomStarterReplParams = { predicateId: string };
const purgeRandomStarterWithPredicateReplacement: Reward<PurgeRandomStarterReplParams> = {
  id: "purge_random_starter_with_predicate_replacement",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ predicateId: rollPredicate(draw, "purge_starter_repl:p").id }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.7, 1, getPredicate(p.predicateId)),
  viable: (_p, ctx) => starterCardCount(ctx) >= 1,
  render: (p) =>
    `Transform a random starter card into a random ${getPredicate(p.predicateId).text.singular}`,
};

type PurgeAllStartersReplParams = Record<string, never>;
const purgeAllStartersReplace: Reward<PurgeAllStartersReplParams> = {
  id: "purge_all_starters_replace",
  weight: 1.0,
  rollParams: () => ({}),
  cec: (_p, ctx) => CARD_CEC * 0.8 * Math.max(1, starterCardCount(ctx)),
  viable: (_p, ctx) => starterCardCount(ctx) >= 1,
  render: () => "Transform all starter cards into new starter cards",
};

type TransformStarterParams = { newCardName: string };
const transformStarterIntoNamedCard: Reward<TransformStarterParams> = {
  id: "transform_starter_into_named_card",
  weight: 1.0,
  rollParams: (ctx, draw) => ({
    newCardName: ctx.content.cards.length > 0
      ? pickFromList(draw, "xform_starter:c", ctx.content.cards).name
      : "Placeholder Card",
  }),
  cec: () => CARD_CEC * 0.8,
  viable: (_p, ctx) => starterCardCount(ctx) >= 1 && ctx.content.cards.length > 0,
  render: (p) => `Choose a starter card to transform into ${p.newCardName}`,
};

type TransformDeckCardParams = { oldCardName: string; newCardName: string };
const transformCardInDeckIntoNamed: Reward<TransformDeckCardParams> = {
  id: "transform_card_in_deck_into_named",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const deckCards = cardMatches(ctx, { source: "deck" });
    return {
      oldCardName: deckCards.length > 0
        ? pickFromList(draw, "xform_deck:old", deckCards).name
        : "Placeholder Card A",
      newCardName: ctx.content.cards.length > 0
        ? pickFromList(draw, "xform_deck:new", ctx.content.cards).name
        : "Placeholder Card B",
    };
  },
  cec: () => CARD_CEC,
  viable: (_p, ctx) =>
    cardMatches(ctx, { source: "deck" }).length >= 1 && ctx.content.cards.length > 0,
  render: (p) => `Transform ${p.oldCardName} into ${p.newCardName}`,
};

type TransformPredCardParams = { predicateId: string; newCardName: string };
const transformChosenPredicateIntoNamed: Reward<TransformPredCardParams> = {
  id: "transform_chosen_predicate_into_named",
  weight: 1.0,
  rollParams: (ctx, draw) => ({
    predicateId: rollPredicate(draw, "xform_pred:pred").id,
    newCardName: ctx.content.cards.length > 0
      ? pickFromList(draw, "xform_pred:new", ctx.content.cards).name
      : "Placeholder Card",
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 1.2, 1, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= 1
    && ctx.content.cards.length > 0,
  render: (p) =>
    `Transform a chosen ${getPredicate(p.predicateId).text.singular} into ${p.newCardName}`,
};

type DupNamedCardParams = { cardName: string; count: number };
const duplicateNamedCardX: Reward<DupNamedCardParams> = {
  id: "duplicate_named_card_X",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const deckCards = cardMatches(ctx, { source: "deck" });
    return {
      cardName: deckCards.length > 0
        ? pickFromList(draw, "dup_named:c", deckCards).name
        : "Placeholder Card",
      count: drawInt(draw, "dup_named:n", 1, 3),
    };
  },
  cec: (p) => CARD_CEC * p.count,
  viable: (_p, ctx) => cardMatches(ctx, { source: "deck" }).length >= 1,
  render: (p) => `Create ${p.count} duplicate${p.count === 1 ? "" : "s"} of ${p.cardName}`,
};

type DupChosenParams = { count: number };
const duplicateChosenCards: Reward<DupChosenParams> = {
  id: "duplicate_chosen_cards",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "dup_chosen:n", 1, 3) }),
  cec: (p) => CARD_CEC * 1.1 * p.count,
  viable: (_p, ctx) => ctx.state.quest.deck.summary.totalCards >= 1,
  render: (p) => `Duplicate ${p.count} chosen card${p.count === 1 ? "" : "s"}`,
};

type DupRandomPredParams = { predicateId: string; count: number };
const duplicateRandomPredicate: Reward<DupRandomPredParams> = {
  id: "duplicate_random_predicate",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollPredicate(draw, "dup_random_pred:p").id,
    count: drawInt(draw, "dup_random_pred:n", 1, 3),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.9, p.count, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= p.count,
  render: (p) => {
    const pred = getPredicate(p.predicateId);
    const noun = p.count === 1 ? pred.text.singular : pred.text.plural;
    return `Duplicate ${p.count} random ${noun}`;
  },
};

type DrawDupParams = { drawCount: number };
const drawXAndDuplicateChosen: Reward<DrawDupParams> = {
  id: "draw_X_and_duplicate_chosen",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ drawCount: drawInt(draw, "draw_dup:n", 2, 4) }),
  cec: () => CARD_CEC * 1.0,
  viable: (p, ctx) => ctx.state.quest.deck.summary.totalCards >= p.drawCount,
  render: (p) =>
    `Draw ${p.drawCount} cards from your deck and duplicate one of them of your choice`,
};

type PurgeXBanesParams = { count: number };
const purgeXBanes: Reward<PurgeXBanesParams> = {
  id: "purge_X_banes",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "purge_banes:n", 1, 3) }),
  cec: (p) => p.count * 30,
  viable: (p, ctx) => baneCount(ctx) >= p.count,
  render: (p) => `Purge ${p.count} bane card${p.count === 1 ? "" : "s"}`,
};

type PurgeAllBanesParams = Record<string, never>;
const purgeAllBanes: Reward<PurgeAllBanesParams> = {
  id: "purge_all_banes",
  weight: 1.0,
  rollParams: () => ({}),
  cec: (_p, ctx) => Math.max(1, baneCount(ctx)) * 30,
  viable: (_p, ctx) => baneCount(ctx) >= 1,
  render: () => "Purge all bane cards",
};

const DREAMSIGN_CEC = 80;

type GainRandomDreamsignParams = Record<string, never>;
const gainRandomDreamsign: Reward<GainRandomDreamsignParams> = {
  id: "gain_random_dreamsign",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => DREAMSIGN_CEC,
  viable: (_p, ctx) => dreamsignMatches(ctx).length >= 1,
  render: () => "Gain a random dreamsign",
};

type GainNamedDreamsignParams = { name: string };
const gainNamedDreamsign: Reward<GainNamedDreamsignParams> = {
  id: "gain_named_dreamsign",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const pool = dreamsignMatches(ctx);
    return { name: pool.length > 0 ? pickFromList(draw, "gain_named_ds:c", pool).name : "Placeholder Dreamsign" };
  },
  cec: () => DREAMSIGN_CEC,
  viable: (_p, ctx) => dreamsignMatches(ctx).length >= 1,
  render: (p) => `Gain ${p.name}`,
};

type Choose1OfXDreamsignsParams = { choices: number };
const choose1OfXDreamsigns: Reward<Choose1OfXDreamsignsParams> = {
  id: "choose_1_of_X_dreamsigns",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ choices: drawInt(draw, "choose_ds:n", 2, 4) }),
  cec: (p) => DREAMSIGN_CEC * 1.3 * Math.log2(p.choices),
  viable: (p, ctx) => dreamsignMatches(ctx).length >= p.choices,
  render: (p) => `Choose 1 of ${p.choices} dreamsigns`,
};

type GainCopyRandomDreamsignParams = Record<string, never>;
const gainCopyOfRandomDreamsign: Reward<GainCopyRandomDreamsignParams> = {
  id: "gain_copy_of_random_dreamsign",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => DREAMSIGN_CEC * 2.5,
  viable: (_p, ctx) => ctx.state.quest.activeDreamsigns.length >= 1,
  render: () => "Gain a copy of one of your dreamsigns chosen at random",
};

type GainCopyChosenDreamsignParams = Record<string, never>;
const gainCopyOfChosenDreamsign: Reward<GainCopyChosenDreamsignParams> = {
  id: "gain_copy_of_chosen_dreamsign",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => DREAMSIGN_CEC * 3.0,
  viable: (_p, ctx) => ctx.state.quest.activeDreamsigns.length >= 1,
  render: () => "Gain a copy of one of your dreamsigns of your choice",
};

type AddSiteParams = { siteType: string };
const addSiteToDreamscape: Reward<AddSiteParams> = {
  id: "add_site_to_dreamscape",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    siteType: pickFromList(draw, "add_site:t", SITE_TYPES),
  }),
  cec: () => 40,
  viable: () => true,
  render: (p) => `Add a ${p.siteType} site to this dreamscape`,
};

const addSiteToNextDreamscape: Reward<AddSiteParams> = {
  id: "add_site_to_next_dreamscape",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    siteType: pickFromList(draw, "add_site_next:t", SITE_TYPES),
  }),
  cec: () => 30,
  viable: () => true,
  render: (p) => `Add a ${p.siteType} site to the next dreamscape you visit`,
};

type StartingDreamwellPosParams = { cardName: string };
const setStartingDreamwellPositive: Reward<StartingDreamwellPosParams> = {
  id: "set_starting_dreamwell_positive",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    cardName: pickFromList(draw, "start_dw_pos:c", POSITIVE_DREAMWELL_CARDS),
  }),
  cec: () => 60,
  viable: () => true,
  render: (p) => `Your starting dreamwell card is ${p.cardName}`,
};

type ShufflePosDreamwellParams = { cardName: string; count: number };
const shufflePositiveDreamwellCards: Reward<ShufflePosDreamwellParams> = {
  id: "shuffle_positive_dreamwell_cards",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    cardName: pickFromList(draw, "shuffle_dw_pos:c", POSITIVE_DREAMWELL_CARDS),
    count: drawInt(draw, "shuffle_dw_pos:n", 1, 3),
  }),
  cec: (p) => 25 * p.count,
  viable: () => true,
  render: (p) =>
    `Shuffle ${p.count} ${p.cardName}${p.count === 1 ? "" : " copies"} into your dreamwell`,
};

type NextRerollsParams = { count: number };
const nextXShopRerollsFree: Reward<NextRerollsParams> = {
  id: "next_X_shop_rerolls_free",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "rerolls:n", 1, 3) }),
  cec: (p) => 15 * p.count,
  viable: () => true,
  render: (p) =>
    `Your next ${p.count} shop reroll${p.count === 1 ? "" : "s"} ${p.count === 1 ? "is" : "are"} free`,
};

type IncreaseMaxEssenceParams = { amount: number };
const increaseMaxEssence: Reward<IncreaseMaxEssenceParams> = {
  id: "increase_max_essence",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ amount: 25 + 25 * drawInt(draw, "inc_max_essence:a", 0, 4) }),
  cec: (p) => p.amount * 1.5 * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p) => `Increase your maximum essence by ${p.amount}`,
};

type Draft2PredicateParams = { predicateId: string };
const draft2PredicateCardsFrom4: Reward<Draft2PredicateParams> = {
  id: "draft_2_predicate_cards_from_4",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ predicateId: rollPredicate(draw, "draft2_predicate:pred").id }),
  cec: (p) => cardPoolCEC(CARD_CEC * 1.4, 2, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= 4,
  render: (p) => `Draft 2 of 4 ${getPredicate(p.predicateId).text.plural}`,
};

type DraftPredicateCardWithCopiesParams = { predicateId: string; copies: number };
const draftPredicateCardWithCopies: Reward<DraftPredicateCardWithCopiesParams> = {
  id: "draft_predicate_card_with_copies",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollPredicate(draw, "draft_pred_copies:pred").id,
    copies: drawInt(draw, "draft_pred_copies:n", 2, 3),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 1.3, p.copies, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= 4,
  render: (p) =>
    `Draft 1 of 4 ${getPredicate(p.predicateId).text.plural} and gain ${p.copies} copies of it`,
};

type DraftPredicateCardWithTransfigurationParams = { predicateId: string; transfiguration: string };
const draftPredicateCardWithTransfiguration: Reward<DraftPredicateCardWithTransfigurationParams> = {
  id: "draft_predicate_card_with_transfiguration",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollPredicate(draw, "draft_pred_xfig:pred").id,
    transfiguration: pickFromList(draw, "draft_pred_xfig:t", ALLOWED_TRANSFIGURATIONS),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 1.8, 1, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= 4,
  render: (p) =>
    `Draft 1 of 4 ${getPredicate(p.predicateId).text.plural} and apply ${p.transfiguration} to it`,
};

type MakeCardReclaimParams = { cardName: string; count: number };
const makeCardReclaim: Reward<MakeCardReclaimParams> = {
  id: "make_card_reclaim",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const deckCards = cardMatches(ctx, { source: "deck" });
    return {
      cardName: deckCards.length > 0
        ? pickFromList(draw, "make_reclaim:c", deckCards).name
        : "Placeholder Card",
      count: drawInt(draw, "make_reclaim:n", 1, 3),
    };
  },
  cec: (p) => CARD_CEC * 0.5 * p.count,
  viable: (_p, ctx) => cardMatches(ctx, { source: "deck" }).length >= 1,
  render: (p) => `Add Reclaim ${p.count} to ${p.cardName}`,
};

type MakeRandomCardsReclaimParams = { count: number; reclaim: number };
const makeRandomCardsReclaim: Reward<MakeRandomCardsReclaimParams> = {
  id: "make_random_cards_reclaim",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    count: drawInt(draw, "make_random_reclaim:n", 1, 3),
    reclaim: drawInt(draw, "make_random_reclaim:r", 1, 2),
  }),
  cec: (p) => CARD_CEC * 0.5 * p.count * p.reclaim,
  viable: (p, ctx) => ctx.state.quest.deck.summary.totalCards >= p.count,
  render: (p) =>
    `Add Reclaim ${p.reclaim} to ${p.count} random card${p.count === 1 ? "" : "s"}`,
};

type OpeningHandGrantParams = { cardName: string; battles: number };
const openingHandGrantForXBattles: Reward<OpeningHandGrantParams> = {
  id: "opening_hand_grant_for_X_battles",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const deckCards = cardMatches(ctx, { source: "deck" });
    return {
      cardName: deckCards.length > 0
        ? pickFromList(draw, "oh_grant:c", deckCards).name
        : "Placeholder Card",
      battles: drawInt(draw, "oh_grant:b", 1, 3),
    };
  },
  cec: (p) => CARD_CEC * 0.6 * p.battles,
  viable: (_p, ctx) => cardMatches(ctx, { source: "deck" }).length >= 1,
  render: (p) =>
    `Your opening hand contains ${p.cardName} for the next ${p.battles} battle${p.battles === 1 ? "" : "s"}`,
};

type TemporaryCardCopyParams = { cardName: string; battles: number };
const temporaryCardCopyForXBattles: Reward<TemporaryCardCopyParams> = {
  id: "temporary_card_copy_for_X_battles",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const deckCards = cardMatches(ctx, { source: "deck" });
    return {
      cardName: deckCards.length > 0
        ? pickFromList(draw, "temp_copy:c", deckCards).name
        : "Placeholder Card",
      battles: drawInt(draw, "temp_copy:b", 1, 3),
    };
  },
  cec: (p) => CARD_CEC * 0.5 * p.battles,
  viable: (_p, ctx) => cardMatches(ctx, { source: "deck" }).length >= 1,
  render: (p) =>
    `Gain a temporary copy of ${p.cardName} for the next ${p.battles} battle${p.battles === 1 ? "" : "s"}`,
};

type CostReductionParams = { predicateId: string; amount: number; battles: number };
const cardCostReductionForXBattles: Reward<CostReductionParams> = {
  id: "card_cost_reduction_for_X_battles",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollPredicate(draw, "cost_red:p").id,
    amount: drawInt(draw, "cost_red:a", 1, 2),
    battles: drawInt(draw, "cost_red:b", 1, 3),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.3 * p.amount * p.battles, 1, getPredicate(p.predicateId)),
  viable: () => true,
  render: (p) =>
    `${getPredicate(p.predicateId).text.plural} cost ${p.amount} less for the next ${p.battles} battle${p.battles === 1 ? "" : "s"}`,
};

type ApplyNamedTransfigAllPredParams = { transfiguration: string; predicateId: string };
const applyNamedTransfigurationToAllPredicateCards: Reward<ApplyNamedTransfigAllPredParams> = {
  id: "apply_named_transfiguration_to_all_predicate_cards",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    transfiguration: pickFromList(draw, "named_transfig_all:t", ALLOWED_TRANSFIGURATIONS),
    predicateId: rollPredicate(draw, "named_transfig_all:p").id,
  }),
  cec: (p, ctx) => {
    const matches = cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length;
    return CARD_CEC * 0.6 * Math.max(1, matches) * getPredicate(p.predicateId).multiplier;
  },
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= 1,
  render: (p) =>
    `Apply ${p.transfiguration} to all ${getPredicate(p.predicateId).text.plural}`,
};

type TransfigureChosenStartersParams = { count: number };
const transfigureChosenStarters: Reward<TransfigureChosenStartersParams> = {
  id: "transfigure_chosen_starters",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "transfig_chosen_starters:n", 1, 2) }),
  cec: (p) => CARD_CEC * 0.9 * p.count,
  viable: (p, ctx) => starterCardCount(ctx) >= p.count,
  render: (p) =>
    p.count === 1
      ? "Apply a random transfiguration to 1 chosen starter card"
      : `Apply random transfigurations to ${p.count} chosen starter cards`,
};

type PurgeChosenStartersParams = { count: number };
const purgeChosenStarters: Reward<PurgeChosenStartersParams> = {
  id: "purge_chosen_starters",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "purge_chosen_starters:n", 1, 3) }),
  cec: (p) => CARD_CEC * 0.45 * p.count,
  viable: (_p, ctx) => starterCardCount(ctx) >= 1,
  render: (p) => `Purge up to ${p.count} chosen starter card${p.count === 1 ? "" : "s"}`,
};

type PurgeAllStartersParams = Record<string, never>;
const purgeAllStarters: Reward<PurgeAllStartersParams> = {
  id: "purge_all_starters",
  weight: 1.0,
  rollParams: () => ({}),
  cec: (_p, ctx) => CARD_CEC * 0.6 * Math.max(1, starterCardCount(ctx)),
  viable: (_p, ctx) => starterCardCount(ctx) >= 1,
  render: () => "Purge all starter cards",
};

type ReplaceStarterViaDraftParams = Record<string, never>;
const replaceStarterViaDraft: Reward<ReplaceStarterViaDraftParams> = {
  id: "replace_starter_via_draft",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => CARD_CEC * 1.0,
  viable: (_p, ctx) => starterCardCount(ctx) >= 1 && ctx.content.cards.length >= 4,
  render: () => "Replace a chosen starter card with 1 of 4 drafted cards",
};

type ApplyRandomTransfigurationsToRandomCardsParams = { count: number };
const applyRandomTransfigurationsToRandomCards: Reward<ApplyRandomTransfigurationsToRandomCardsParams> = {
  id: "apply_random_transfigurations_to_random_cards",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "random_transfig_random:n", 1, 3) }),
  cec: (p) => CARD_CEC * 0.5 * p.count,
  viable: (p, ctx) => ctx.state.quest.deck.summary.totalCards >= p.count,
  render: (p) =>
    p.count === 1
      ? "Apply a random transfiguration to 1 random card"
      : `Apply random transfigurations to ${p.count} random cards`,
};

type TransformDreamsignToNamedParams = { name: string };
const transformDreamsignToNamed: Reward<TransformDreamsignToNamedParams> = {
  id: "transform_dreamsign_to_named",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const pool = dreamsignMatches(ctx);
    return { name: pool.length > 0 ? pickFromList(draw, "xform_ds_named:c", pool).name : "Placeholder Dreamsign" };
  },
  cec: () => DREAMSIGN_CEC * 0.6,
  viable: (_p, ctx) => ctx.state.quest.activeDreamsigns.length >= 1 && dreamsignMatches(ctx).length >= 1,
  render: (p) => `Transform a chosen dreamsign into ${p.name}`,
};

type TemporaryDreamsignParams = { battles: number };
const temporaryDreamsignForXBattles: Reward<TemporaryDreamsignParams> = {
  id: "temporary_dreamsign_for_X_battles",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ battles: drawInt(draw, "temp_ds:b", 1, 3) }),
  cec: (p) => DREAMSIGN_CEC * 0.5 * p.battles,
  viable: (_p, ctx) => dreamsignMatches(ctx).length >= 1,
  render: (p) =>
    `Gain a random dreamsign for the next ${p.battles} battle${p.battles === 1 ? "" : "s"}`,
};

type ReplaceSiteTypeParams = { fromType: string; toType: string };
const replaceSiteType: Reward<ReplaceSiteTypeParams> = {
  id: "replace_site_type",
  weight: 1.0,
  rollParams: (_ctx, draw) => {
    const fromType = pickFromList(draw, "replace_site:from", SITE_TYPES);
    const options = SITE_TYPES.filter((t) => t !== fromType);
    const toType = options.length > 0
      ? pickFromList(draw, "replace_site:to", options)
      : fromType;
    return { fromType, toType };
  },
  cec: () => 35,
  viable: () => true,
  render: (p) => `Replace a ${p.fromType} site in this dreamscape with a ${p.toType} site`,
};

type ShopEssenceDiscountParams = { percent: number };
const shopEssenceDiscount: Reward<ShopEssenceDiscountParams> = {
  id: "shop_essence_discount",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ percent: 10 + 10 * drawInt(draw, "shop_e_disc:p", 0, 4) }),
  cec: (p) => p.percent * 1.0,
  viable: () => true,
  render: (p) => `Shop essence costs are reduced by ${p.percent}%`,
};

type ShopOmenDiscountParams = { count: number };
const shopOmenDiscount: Reward<ShopOmenDiscountParams> = {
  id: "shop_omen_discount",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "shop_o_disc:n", 1, 3) }),
  cec: (p) => p.count * 25,
  viable: () => true,
  render: (p) =>
    `Your next ${p.count} shop purchase${p.count === 1 ? "" : "s"} cost${p.count === 1 ? "s" : ""} 1 fewer omen`,
};

type VendorHookBonusParams = { amount: number };
const vendorHookBonus: Reward<VendorHookBonusParams> = {
  id: "vendor_hook_bonus",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ amount: drawInt(draw, "vendor_hook:a", 1, 3) }),
  cec: (p) => p.amount * 20,
  viable: () => true,
  render: (p) =>
    `Vendor hooks award ${p.amount} additional choice${p.amount === 1 ? "" : "s"}`,
};

type BoostSiteParams = { siteType: string; percent: number };
const boostSiteAppearanceChance: Reward<BoostSiteParams> = {
  id: "boost_site_appearance_chance",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    siteType: pickFromList(draw, "boost_site:t", SITE_TYPES),
    percent: 10 + 10 * drawInt(draw, "boost_site:p", 0, 4),
  }),
  cec: (p) => p.percent * 0.8,
  viable: () => true,
  render: (p) => `${p.percent}% higher chance to see ${p.siteType} sites in future dreamscapes`,
};

type MetaGain2Params = {
  subIds: readonly [string, string];
  subParams: readonly [TemplateParams, TemplateParams];
};

function nonMetaRewards(): readonly Reward[] {
  return REWARDS.filter((r) => !r.id.startsWith("meta_"));
}

const metaGain2Rewards: Reward<MetaGain2Params> = {
  id: "meta_gain_2_rewards",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const allNonMeta = nonMetaRewards();
    // Restrict to sub-templates that are viable in the current state, so the
    // meta template itself is viable whenever it picks two sub-templates.
    const pool = allNonMeta.filter((r) => {
      const subDraw = { ...draw, selectionAttempt: (draw.selectionAttempt ?? 0) * 10 + 7 };
      const subParams = r.rollParams(ctx, subDraw);
      return r.viable(subParams, ctx);
    });
    const usePool = pool.length >= 2 ? pool : allNonMeta;
    if (usePool.length < 2) {
      // Degenerate, should not happen in practice.
      const first = usePool[0]!;
      return {
        subIds: [first.id, first.id] as readonly [string, string],
        subParams: [first.rollParams(ctx, draw), first.rollParams(ctx, draw)] as readonly [TemplateParams, TemplateParams],
      };
    }
    // Two-step weighted random without replacement.
    const firstIndex = drawInt(draw, "meta_gain_2:i1", 0, usePool.length - 1);
    let secondIndex = drawInt(draw, "meta_gain_2:i2", 0, usePool.length - 2);
    if (secondIndex >= firstIndex) secondIndex += 1;
    const first = usePool[firstIndex]!;
    const second = usePool[secondIndex]!;
    return {
      subIds: [first.id, second.id] as readonly [string, string],
      subParams: [
        first.rollParams(ctx, { ...draw, selectionAttempt: (draw.selectionAttempt ?? 0) * 10 + 1 }),
        second.rollParams(ctx, { ...draw, selectionAttempt: (draw.selectionAttempt ?? 0) * 10 + 2 }),
      ] as readonly [TemplateParams, TemplateParams],
    };
  },
  cec: (p, ctx) => {
    const [a, b] = p.subIds.map((id) => getReward(id));
    return a!.cec(p.subParams[0] as never, ctx) + b!.cec(p.subParams[1] as never, ctx);
  },
  viable: (p, ctx) => {
    const [a, b] = p.subIds.map((id) => getReward(id));
    return a!.viable(p.subParams[0] as never, ctx) && b!.viable(p.subParams[1] as never, ctx);
  },
  render: (p, ctx) => {
    const [a, b] = p.subIds.map((id) => getReward(id));
    return [a!.render(p.subParams[0] as never, ctx), b!.render(p.subParams[1] as never, ctx)].join(". ");
  },
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
  purgeChosenPredicateCards,
  purgeChosenPredicateWithReplacement,
  purgeNamedStarter,
  purgeRandomStarter,
  purgeRandomStarterWithPredicateReplacement,
  purgeAllStartersReplace,
  transformStarterIntoNamedCard,
  transformCardInDeckIntoNamed,
  transformChosenPredicateIntoNamed,
  duplicateNamedCardX,
  duplicateChosenCards,
  duplicateRandomPredicate,
  drawXAndDuplicateChosen,
  purgeXBanes,
  purgeAllBanes,
  gainRandomDreamsign,
  gainNamedDreamsign,
  choose1OfXDreamsigns,
  gainCopyOfRandomDreamsign,
  gainCopyOfChosenDreamsign,
  addSiteToDreamscape,
  addSiteToNextDreamscape,
  setStartingDreamwellPositive,
  shufflePositiveDreamwellCards,
  nextXShopRerollsFree,
  boostSiteAppearanceChance,
  increaseMaxEssence,
  draft2PredicateCardsFrom4,
  draftPredicateCardWithCopies,
  draftPredicateCardWithTransfiguration,
  makeCardReclaim,
  makeRandomCardsReclaim,
  openingHandGrantForXBattles,
  temporaryCardCopyForXBattles,
  cardCostReductionForXBattles,
  applyNamedTransfigurationToAllPredicateCards,
  transfigureChosenStarters,
  purgeChosenStarters,
  purgeAllStarters,
  replaceStarterViaDraft,
  applyRandomTransfigurationsToRandomCards,
  transformDreamsignToNamed,
  temporaryDreamsignForXBattles,
  replaceSiteType,
  shopEssenceDiscount,
  shopOmenDiscount,
  vendorHookBonus,
  metaGain2Rewards,
] as unknown as Reward[]);

const BY_ID = new Map(REWARDS.map((r) => [r.id, r]));

export function getReward(id: string): Reward {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown reward template id: ${id}`);
  return found;
}
