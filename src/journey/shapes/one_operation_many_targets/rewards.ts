// src/journey/shapes/one_operation_many_targets/rewards.ts
import { drawInt, shuffleDeterministic, type DrawContext } from "../../../util/rng.js";
import type { CardContent, DreamsignContent } from "../../../content/model.js";
import type { JourneyContext } from "../../../quest/context.js";
import type { JourneyOperation, JourneyStage, TargetSelector } from "../../manifest.js";
import { CARD_CEC, STAGE_MULTIPLIER, cardPoolCEC } from "../../shared/cec.js";
import {
  JOURNEY_REPLACEABLE_SITE_TYPES,
  JOURNEY_REWARDABLE_SITE_TYPES,
  JOURNEY_TRANSFIGURATIONS,
  POSITIVE_DREAMWELL_CARDS,
  cardMatches,
  dreamsignMatches,
  isCardEligibleForTransfiguration,
  pickFromList,
  starterCardCount,
} from "../../shared/content.js";
import { PREDICATES, getPredicate } from "../../shared/predicates.js";
import { quoteName } from "../../shared/text.js";
import type { Predicate, PredicateKind, TemplateParams } from "../../shared/types.js";

const POSITIVE_TEMPORARY_BATTLE_MIN = 3;
const POSITIVE_TEMPORARY_BATTLE_MAX = 3;
const RANDOM_GAIN_PREDICATE_KINDS: readonly PredicateKind[] = ["ability", "card-type"];
const CARD_ADDITION_EXCLUDED_PREDICATE_IDS = ["starter"] as const;
const CARD_TYPE_PREDICATE_IDS = ["warriors", "survivors", "spirit_animals"] as const;
const FLAT_DRAFT_PREDICATE_IDS = new Set(["low_spark", "high_spark"]);
const FLAT_DRAFT_CEC = 25;
const DREAMSIGN_CEC = 80;

const BOOST_SITE_TYPE_MULTIPLIER: Readonly<Record<string, number>> = Object.freeze({
  "Purge": 1.25,
  "Duplication": 1.25,
  "Dreamsign Draft": 1.25,
  "Essence": 0.75,
  "Shop": 0.75,
  "Specialty Shop": 0.75,
  "Transfiguration": 0.75,
  "Dreamsign Offering": 0.75,
});

function rollPositiveTemporaryBattles(draw: DrawContext, label: string): number {
  return drawInt(draw, label, POSITIVE_TEMPORARY_BATTLE_MIN, POSITIVE_TEMPORARY_BATTLE_MAX);
}

function sentenceCase(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function namedCardGainPool(ctx: JourneyContext): readonly CardContent[] {
  return ctx.content.cards.filter((card) => card.rarity !== "Starter");
}

function isFlatDraftPredicate(predicateId: string): boolean {
  return FLAT_DRAFT_PREDICATE_IDS.has(predicateId);
}

function rollPredicate(draw: DrawContext, label: string): Predicate {
  return pickFromList(draw, label, PREDICATES);
}

function boostSiteCec(siteType: string, percent: number): number {
  const baseline = 75 + (percent - 20) * 2.5;
  const multiplier = BOOST_SITE_TYPE_MULTIPLIER[siteType] ?? 1.0;
  return baseline * multiplier;
}

type MetaRewardPair = {
  readonly cardId: string;
  readonly cardName: string;
  readonly dreamsignId: string;
  readonly dreamsignName: string;
};

type MetaRewardPairParams = {
  readonly pairs: readonly MetaRewardPair[];
};

function stageCardGainPool(ctx: JourneyContext, stage: JourneyStage): readonly CardContent[] {
  const cards = namedCardGainPool(ctx);
  const preferredRarities = stage === "early"
    ? new Set(["Common", "Uncommon"])
    : stage === "mid"
      ? new Set(["Uncommon", "Rare"])
      : new Set(["Rare", "Legendary"]);
  const preferred = cards.filter((card) => preferredRarities.has(card.rarity));

  return preferred.length >= 3 ? preferred : cards;
}

function pairedMetaRewardTargets(
  ctx: JourneyContext,
  draw: DrawContext,
  stage: JourneyStage,
): readonly MetaRewardPair[] {
  const cards = shuffleDeterministic(
    draw,
    `oomt_meta_gain_2_rewards:${stage}:cards`,
    stageCardGainPool(ctx, stage),
  );
  const dreamsigns = shuffleDeterministic(
    draw,
    `oomt_meta_gain_2_rewards:${stage}:dreamsigns`,
    dreamsignMatches(ctx),
  );
  const pairCount = Math.min(cards.length, dreamsigns.length);

  return Array.from({ length: pairCount }, (_entry, index) => {
    const card = cards[index]!;
    const dreamsign = dreamsigns[index]!;

    return {
      cardId: card.id,
      cardName: card.name,
      dreamsignId: dreamsign.id,
      dreamsignName: dreamsign.name,
    };
  });
}

export type TargetedRewardTarget = {
  readonly key: string;
  readonly text: string;
  readonly selector: TargetSelector;
};

export type OneOperationManyTargetsReward<P extends TemplateParams = TemplateParams> = {
  readonly id: string;
  readonly rewardTypeId: string;
  readonly targetKind: string;
  readonly symbols: readonly string[];
  readonly stages?: readonly JourneyStage[];
  rollParams(ctx: JourneyContext, draw: DrawContext, stage: JourneyStage): P;
  operationKey(params: P): string;
  targets(params: P, ctx: JourneyContext): readonly TargetedRewardTarget[];
  cec(params: P, target: TargetedRewardTarget, ctx: JourneyContext): number;
  render(params: P, target: TargetedRewardTarget, ctx: JourneyContext): string;
  operations(
    params: P,
    target: TargetedRewardTarget,
    args: {
      readonly optionNumber: number;
      readonly cec: number;
    },
  ): readonly JourneyOperation[];
};

function cardTarget(card: CardContent, source: "catalog" | "deck"): TargetedRewardTarget {
  return {
    key: `card:${card.id}`,
    text: quoteName(card.name),
    selector: {
      selectorKind: "card",
      selection: "exact",
      referenceKind: "content",
      source,
      ids: [card.id],
      names: [card.name],
      description: quoteName(card.name),
      required: true,
    },
  };
}

function dreamsignTarget(dreamsign: DreamsignContent, source: "catalog" | "active" | "pool"): TargetedRewardTarget {
  return {
    key: `dreamsign:${dreamsign.id}`,
    text: quoteName(dreamsign.name),
    selector: {
      selectorKind: "dreamsign",
      selection: "exact",
      referenceKind: "content",
      source,
      ids: [dreamsign.id],
      names: [dreamsign.name],
      description: quoteName(dreamsign.name),
      required: true,
    },
  };
}

function predicateTarget(
  predicate: Predicate,
  args: {
    readonly source?: "catalog" | "deck" | "draftPool";
    readonly noun?: "singular" | "plural";
  } = {},
): TargetedRewardTarget {
  const text = predicate.text[args.noun ?? "plural"];
  return {
    key: `predicate:${predicate.id}`,
    text,
    selector: {
      selectorKind: "card",
      selection: "predicate",
      referenceKind: "content",
      ...(args.source ? { source: args.source } : {}),
      predicate: {
        ...(predicate.cardPredicate ?? {}),
        ...(args.source ? { source: args.source } : {}),
      },
      description: text,
      required: true,
    },
  };
}

function vocabularyTarget(
  kind: string,
  key: string,
  text: string,
  selector: TargetSelector,
): TargetedRewardTarget {
  return {
    key: `${kind}:${key}`,
    text,
    selector,
  };
}

function statusVocabularyTarget(kind: string, scope: string, name: string): TargetedRewardTarget {
  return vocabularyTarget(kind, name, quoteName(name), {
    selectorKind: "status",
    selection: "exact",
    referenceKind: "controlled_vocabulary",
    scope,
    statusName: name,
    description: quoteName(name),
  });
}

function cardTypeTarget(predicateId: string): TargetedRewardTarget {
  const predicate = getPredicate(predicateId);
  return vocabularyTarget("card_type", predicateId, predicate.text.plural, {
    selectorKind: "card",
    selection: "predicate",
    referenceKind: "controlled_vocabulary",
    predicate: predicate.cardPredicate ?? {},
    description: predicate.text.plural,
  });
}

function routeSiteTarget(siteType: string, scope: "current_dreamscape" | "next_dreamscape" | "future_dreamscapes"): TargetedRewardTarget {
  return {
    key: `route_site:${scope}:${siteType}`,
    text: `${siteType} site`,
    selector: {
      selectorKind: "route_site",
      selection: "exact",
      referenceKind: "controlled_vocabulary",
      scope,
      siteType,
      siteTypes: [siteType],
      description: `${siteType} site`,
      required: true,
    },
  };
}

function matchingPredicateTargets(args: {
  readonly ctx: JourneyContext;
  readonly minMatches: number;
  readonly kinds?: readonly PredicateKind[];
  readonly excludedIds?: readonly string[];
  readonly source?: "catalog" | "deck" | "draftPool";
  readonly noun?: "singular" | "plural";
}): readonly TargetedRewardTarget[] {
  const excluded = new Set(args.excludedIds ?? []);
  return PREDICATES
    .filter((predicate) => !excluded.has(predicate.id))
    .filter((predicate) => args.kinds === undefined || args.kinds.includes(predicate.kind))
    .filter((predicate) =>
      cardMatches(args.ctx, {
        ...(predicate.cardPredicate ?? {}),
        ...(args.source ? { source: args.source } : {}),
      }).length >= args.minMatches
    )
    .map((predicate) => predicateTarget(predicate, { source: args.source, noun: args.noun }));
}

function transfigurationPredicateTargets(args: {
  readonly ctx: JourneyContext;
  readonly minMatches: number;
  readonly source?: "catalog" | "deck" | "draftPool";
}): readonly TargetedRewardTarget[] {
  return PREDICATES.flatMap((predicate) => {
    const matches = cardMatches(args.ctx, {
      ...(predicate.cardPredicate ?? {}),
      ...(args.source ? { source: args.source } : {}),
    });

    if (matches.length < args.minMatches) {
      return [];
    }

    return JOURNEY_TRANSFIGURATIONS
      .filter((transfiguration) =>
        matches.every((card) => isCardEligibleForTransfiguration(transfiguration, card))
      )
      .map((transfiguration) => {
        const text = `${transfiguration} to ${predicate.text.plural}`;
        const selector = predicateTarget(predicate, { source: args.source }).selector as Extract<TargetSelector, { selectorKind: "card" }>;
        return vocabularyTarget(
          "transfiguration_predicate",
          `${transfiguration}:${predicate.id}`,
          text,
          {
            ...selector,
            description: text,
          },
        );
      });
  });
}

function rewardOperations(args: {
  readonly optionNumber: number;
  readonly cec: number;
  readonly target: TargetedRewardTarget;
  readonly templateId: string;
  readonly operationKey: string;
  readonly rewardKind: Extract<JourneyOperation, { operationKind: "reward" }>["rewardKind"];
  readonly payload: Record<string, unknown>;
}): readonly JourneyOperation[] {
  const operationIdPrefix = `one_operation_many_targets:${args.optionNumber}`;

  return [
    {
      operationId: `${operationIdPrefix}:reward`,
      operationKind: "reward",
      role: "reward",
      rewardKind: args.rewardKind,
      visibility: "visible",
      timing: { timingKind: "immediate" },
      value: { convertedEssence: args.cec },
      targetSelector: args.target.selector,
      payload: {
        templateId: args.templateId,
        operationKey: args.operationKey,
        targetKey: args.target.key,
        ...args.payload,
      },
    },
    {
      operationId: `${operationIdPrefix}:target`,
      operationKind: "target",
      role: "target",
      visibility: "visible",
      targetSelector: args.target.selector,
      payload: {
        templateId: args.templateId,
        targetKind: args.target.selector.selectorKind,
        targetKey: args.target.key,
      },
    },
  ];
}

function routeAddOperations(args: {
  readonly optionNumber: number;
  readonly cec: number;
  readonly target: TargetedRewardTarget;
  readonly templateId: string;
  readonly operationKey: string;
  readonly scope: "current_dreamscape" | "next_dreamscape" | "future_dreamscapes";
}): readonly JourneyOperation[] {
  const routeSelector = args.target.selector;
  const siteType = routeSelector.selectorKind === "route_site"
    ? routeSelector.siteType
    : undefined;
  const operationIdPrefix = `one_operation_many_targets:${args.optionNumber}`;

  return [
    {
      operationId: `${operationIdPrefix}:route-edit`,
      operationKind: "route_edit",
      role: "route_edit",
      editKind: "add_site",
      visibility: "visible",
      timing: {
        timingKind: "route",
        scope: args.scope,
      },
      value: { convertedEssence: args.cec },
      targetSelector: args.target.selector,
      toSite: siteType,
      payload: {
        templateId: args.templateId,
        operationKey: args.operationKey,
        routeScope: args.scope,
      },
    },
    {
      operationId: `${operationIdPrefix}:target`,
      operationKind: "target",
      role: "target",
      visibility: "visible",
      targetSelector: args.target.selector,
      payload: {
        templateId: args.templateId,
        targetKind: args.target.selector.selectorKind,
        targetKey: args.target.key,
      },
    },
  ];
}

type ApplyTransfigurationParams = { transfiguration: string };
const targetApplyNamedTransfiguration: OneOperationManyTargetsReward<ApplyTransfigurationParams> = {
  id: "target_apply_named_transfiguration",
  rewardTypeId: "apply_named_transfiguration_to_card_name",
  targetKind: "visible_named_card_target",
  symbols: ["reward", "card"],
  stages: ["early", "mid"],
  rollParams: (ctx, draw) => {
    const deckCards = cardMatches(ctx, { source: "deck" });
    const viableTransfigurations = JOURNEY_TRANSFIGURATIONS.filter((transfiguration) =>
      deckCards.filter((card) => isCardEligibleForTransfiguration(transfiguration, card)).length >= 3
    );

    return {
      transfiguration: pickFromList(
        draw,
        "oomt_transfiguration:t",
        viableTransfigurations.length > 0 ? viableTransfigurations : JOURNEY_TRANSFIGURATIONS,
      ),
    };
  },
  operationKey: (p) => `apply_transfiguration:${p.transfiguration}`,
  targets: (p, ctx) =>
    cardMatches(ctx, { source: "deck" })
      .filter((card) => isCardEligibleForTransfiguration(p.transfiguration, card))
      .map((card) => cardTarget(card, "deck")),
  cec: () => CARD_CEC * 0.8,
  render: (p, target) => `Apply ${p.transfiguration} to ${target.text}`,
  operations: (p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetApplyNamedTransfiguration.id,
    operationKey: targetApplyNamedTransfiguration.operationKey(p),
    rewardKind: "card_transfigure",
    payload: {
      transfigurationName: p.transfiguration,
    },
  }),
};

type CountParams = { count: number };
const targetAddReclaim: OneOperationManyTargetsReward<CountParams> = {
  id: "target_add_reclaim",
  rewardTypeId: "make_card_reclaim",
  targetKind: "visible_named_card_target",
  symbols: ["reward", "card"],
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "oomt_reclaim:n", 1, 3) }),
  operationKey: (p) => `add_reclaim:${p.count}`,
  targets: (_p, ctx) => cardMatches(ctx, { source: "deck" }).map((card) => cardTarget(card, "deck")),
  cec: (p) => CARD_CEC * 0.5 * p.count,
  render: (p, target) => `Add Reclaim ${p.count} to ${target.text}`,
  operations: (p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetAddReclaim.id,
    operationKey: targetAddReclaim.operationKey(p),
    rewardKind: "card_keyword_add",
    payload: {
      keyword: "Reclaim",
      count: p.count,
    },
  }),
};

type BattleWindowParams = { battles: number };
const targetOpeningHand: OneOperationManyTargetsReward<BattleWindowParams> = {
  id: "target_opening_hand",
  rewardTypeId: "opening_hand_grant_for_X_battles",
  targetKind: "visible_named_card_target",
  symbols: ["reward", "card"],
  stages: ["early", "mid"],
  rollParams: (_ctx, draw) => ({ battles: rollPositiveTemporaryBattles(draw, "oomt_opening_hand:b") }),
  operationKey: (p) => `opening_hand:${p.battles}`,
  targets: (_p, ctx) => cardMatches(ctx, { source: "deck" }).map((card) => cardTarget(card, "deck")),
  cec: (p) => CARD_CEC * 0.3 * p.battles,
  render: (p, target) =>
    `Your opening hand contains ${target.text} for the next ${p.battles} battle${p.battles === 1 ? "" : "s"}`,
  operations: (p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetOpeningHand.id,
    operationKey: targetOpeningHand.operationKey(p),
    rewardKind: "card_opening_hand",
    payload: {
      battles: p.battles,
    },
  }),
};

const targetTemporaryCopy: OneOperationManyTargetsReward<BattleWindowParams> = {
  id: "target_temporary_copy",
  rewardTypeId: "temporary_card_copy_for_X_battles",
  targetKind: "visible_named_card_target",
  symbols: ["reward", "card"],
  rollParams: (_ctx, draw) => ({ battles: rollPositiveTemporaryBattles(draw, "oomt_temp_copy:b") }),
  operationKey: (p) => `temporary_copy:${p.battles}`,
  targets: (_p, ctx) => cardMatches(ctx, { source: "deck" }).map((card) => cardTarget(card, "deck")),
  cec: (p) => CARD_CEC * 0.25 * p.battles,
  render: (p, target) =>
    `Gain a temporary copy of ${target.text} for the next ${p.battles} battle${p.battles === 1 ? "" : "s"}`,
  operations: (p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetTemporaryCopy.id,
    operationKey: targetTemporaryCopy.operationKey(p),
    rewardKind: "card_temporary_copy",
    payload: {
      battles: p.battles,
    },
  }),
};

type EmptyParams = Record<string, never>;
const targetGainNamedCard: OneOperationManyTargetsReward<EmptyParams> = {
  id: "target_gain_named_card",
  rewardTypeId: "gain_named_card",
  targetKind: "visible_named_card_target",
  symbols: ["reward", "card"],
  rollParams: () => ({}),
  operationKey: () => "gain_named_card",
  targets: (_p, ctx) => namedCardGainPool(ctx).map((card) => cardTarget(card, "catalog")),
  cec: () => CARD_CEC * STAGE_MULTIPLIER,
  render: (_p, target) => `Gain ${target.text}`,
  operations: (_p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetGainNamedCard.id,
    operationKey: targetGainNamedCard.operationKey({}),
    rewardKind: "card_gain",
    payload: {},
  }),
};

const targetApplyChosenTransfiguration: OneOperationManyTargetsReward<EmptyParams> = {
  id: "target_apply_chosen_transfiguration",
  rewardTypeId: "apply_chosen_transfiguration_to_chosen_card",
  targetKind: "visible_named_card_target",
  symbols: ["reward", "card"],
  rollParams: () => ({}),
  operationKey: () => "apply_chosen_transfiguration_to_chosen_card",
  targets: (_p, ctx) => cardMatches(ctx, { source: "deck" }).map((card) => cardTarget(card, "deck")),
  cec: () => CARD_CEC * 1.5,
  render: (_p, target) => `Apply a transfiguration of your choice to ${target.text}`,
  operations: (_p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetApplyChosenTransfiguration.id,
    operationKey: targetApplyChosenTransfiguration.operationKey({}),
    rewardKind: "card_transfigure",
    payload: {
      rewardTypeId: "apply_chosen_transfiguration_to_chosen_card",
      transfigurationChoice: "player_choice",
    },
  }),
};

const targetGainRandomPredicateCards: OneOperationManyTargetsReward<CountParams> = {
  id: "target_gain_random_predicate_cards",
  rewardTypeId: "gain_random_predicate_cards",
  targetKind: "predicate",
  symbols: ["reward", "card"],
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "oomt_gain_random_predicate:n", 1, 3) }),
  operationKey: (p) => `gain_random_predicate_cards:${p.count}`,
  targets: (p, ctx) => matchingPredicateTargets({
    ctx,
    minMatches: p.count,
    kinds: RANDOM_GAIN_PREDICATE_KINDS,
    excludedIds: CARD_ADDITION_EXCLUDED_PREDICATE_IDS,
  }),
  cec: (p, target) => {
    const predicateId = String(target.key).replace("predicate:", "");
    return cardPoolCEC(CARD_CEC, p.count, getPredicate(predicateId));
  },
  render: (p, target) => {
    const predicateId = String(target.key).replace("predicate:", "");
    const pred = getPredicate(predicateId);
    const noun = p.count === 1 ? pred.text.singular : pred.text.plural;
    return `Gain ${p.count} random ${noun}`;
  },
  operations: (p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetGainRandomPredicateCards.id,
    operationKey: targetGainRandomPredicateCards.operationKey(p),
    rewardKind: "card_gain",
    payload: {
      rewardTypeId: "gain_random_predicate_cards",
      count: p.count,
      predicateId: String(target.key).replace("predicate:", ""),
    },
  }),
};

const targetDraftPredicateCardsFrom4: OneOperationManyTargetsReward<EmptyParams> = {
  id: "target_draft_predicate_cards_from_4",
  rewardTypeId: "draft_predicate_cards_from_4",
  targetKind: "predicate",
  symbols: ["reward", "card"],
  rollParams: () => ({}),
  operationKey: () => "draft_predicate_cards_from_4",
  targets: (_p, ctx) => matchingPredicateTargets({
    ctx,
    minMatches: 4,
    excludedIds: CARD_ADDITION_EXCLUDED_PREDICATE_IDS,
  }),
  cec: (_p, target) => {
    const predicateId = String(target.key).replace("predicate:", "");
    return isFlatDraftPredicate(predicateId)
      ? FLAT_DRAFT_CEC
      : cardPoolCEC(CARD_CEC * 1.5, 1, getPredicate(predicateId));
  },
  render: (_p, target) => `Draft 1 of 4 ${target.text}`,
  operations: (_p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetDraftPredicateCardsFrom4.id,
    operationKey: targetDraftPredicateCardsFrom4.operationKey({}),
    rewardKind: "card_draft",
    payload: {
      rewardTypeId: "draft_predicate_cards_from_4",
      takeCount: 1,
      choiceCount: 4,
      predicateId: String(target.key).replace("predicate:", ""),
    },
  }),
};

type ChoicesParams = { choices: number };
const targetTakeAnyFromPredicateChoices: OneOperationManyTargetsReward<ChoicesParams> = {
  id: "target_take_any_from_predicate_choices",
  rewardTypeId: "take_any_from_predicate_choices",
  targetKind: "predicate",
  symbols: ["reward", "card"],
  rollParams: (_ctx, draw) => ({ choices: drawInt(draw, "oomt_take_any:choices", 3, 5) }),
  operationKey: (p) => `take_any_from_predicate_choices:${p.choices}`,
  targets: (p, ctx) => matchingPredicateTargets({
    ctx,
    minMatches: p.choices,
    kinds: RANDOM_GAIN_PREDICATE_KINDS,
    excludedIds: CARD_ADDITION_EXCLUDED_PREDICATE_IDS,
  }),
  cec: (p, target) => {
    const predicateId = String(target.key).replace("predicate:", "");
    return cardPoolCEC(CARD_CEC * 1.2, p.choices / 2, getPredicate(predicateId));
  },
  render: (p, target) => `Take any number of ${target.text} from ${p.choices} choices`,
  operations: (p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetTakeAnyFromPredicateChoices.id,
    operationKey: targetTakeAnyFromPredicateChoices.operationKey(p),
    rewardKind: "card_draft",
    payload: {
      rewardTypeId: "take_any_from_predicate_choices",
      takeCount: "any",
      choiceCount: p.choices,
      predicateId: String(target.key).replace("predicate:", ""),
    },
  }),
};

type TransfigPredicateCountParams = { count: number };
const targetApplyNamedTransfigurationToChosenPredicateCards: OneOperationManyTargetsReward<TransfigPredicateCountParams> = {
  id: "target_apply_named_transfiguration_to_chosen_predicate_cards",
  rewardTypeId: "apply_named_transfiguration_to_chosen_predicate_cards",
  targetKind: "transfiguration_predicate",
  symbols: ["reward", "card"],
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "oomt_named_transfig_chosen:n", 1, 3) }),
  operationKey: (p) => `apply_named_transfiguration_to_chosen_predicate_cards:${p.count}`,
  targets: (p, ctx) => transfigurationPredicateTargets({ ctx, minMatches: p.count }),
  cec: (p, target) => {
    const predicateId = String(target.key).split(":").at(-1)!;
    return cardPoolCEC(CARD_CEC * 0.8, p.count, getPredicate(predicateId));
  },
  render: (p, target) => {
    const [, transfiguration, predicateId] = String(target.key).split(":");
    const pred = getPredicate(predicateId!);
    const noun = p.count === 1 ? pred.text.singular : pred.text.plural;
    return `Apply ${transfiguration} to ${p.count} chosen ${noun}`;
  },
  operations: (p, target, args) => {
    const [, transfiguration, predicateId] = String(target.key).split(":");
    return rewardOperations({
      ...args,
      target,
      templateId: targetApplyNamedTransfigurationToChosenPredicateCards.id,
      operationKey: targetApplyNamedTransfigurationToChosenPredicateCards.operationKey(p),
      rewardKind: "card_transfigure",
      payload: {
        rewardTypeId: "apply_named_transfiguration_to_chosen_predicate_cards",
        transfigurationName: transfiguration,
        predicateId,
        count: p.count,
        targetMode: "chosen_predicate",
      },
    });
  },
};

const targetApplyNamedTransfigurationToRandomPredicateCards: OneOperationManyTargetsReward<TransfigPredicateCountParams> = {
  id: "target_apply_named_transfiguration_to_random_predicate_cards",
  rewardTypeId: "apply_named_transfiguration_to_random_predicate_cards",
  targetKind: "transfiguration_predicate",
  symbols: ["reward", "card"],
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "oomt_named_transfig_random:n", 1, 3) }),
  operationKey: (p) => `apply_named_transfiguration_to_random_predicate_cards:${p.count}`,
  targets: (p, ctx) => transfigurationPredicateTargets({ ctx, minMatches: p.count }),
  cec: (p, target) => {
    const predicateId = String(target.key).split(":").at(-1)!;
    return cardPoolCEC(CARD_CEC * 0.6, p.count, getPredicate(predicateId));
  },
  render: (p, target) => {
    const [, transfiguration, predicateId] = String(target.key).split(":");
    const pred = getPredicate(predicateId!);
    const noun = p.count === 1 ? pred.text.singular : pred.text.plural;
    return `Apply ${transfiguration} to ${p.count} random ${noun}`;
  },
  operations: (p, target, args) => {
    const [, transfiguration, predicateId] = String(target.key).split(":");
    return rewardOperations({
      ...args,
      target,
      templateId: targetApplyNamedTransfigurationToRandomPredicateCards.id,
      operationKey: targetApplyNamedTransfigurationToRandomPredicateCards.operationKey(p),
      rewardKind: "card_transfigure",
      payload: {
        rewardTypeId: "apply_named_transfiguration_to_random_predicate_cards",
        transfigurationName: transfiguration,
        predicateId,
        count: p.count,
        targetMode: "random_predicate",
      },
    });
  },
};

const targetChangeCardToBecomeType: OneOperationManyTargetsReward<{ cardTypePredicateId: string }> = {
  id: "target_change_card_to_become_type",
  rewardTypeId: "change_card_to_become_type",
  targetKind: "visible_named_card_target",
  symbols: ["reward", "card"],
  rollParams: (_ctx, draw) => ({ cardTypePredicateId: pickFromList(draw, "oomt_change_type:t", CARD_TYPE_PREDICATE_IDS) }),
  operationKey: (p) => `change_card_to_become_type:${p.cardTypePredicateId}`,
  targets: (_p, ctx) => cardMatches(ctx, { source: "deck" }).map((card) => cardTarget(card, "deck")),
  cec: () => CARD_CEC * 0.6,
  render: (p, target) => {
    const singular = getPredicate(p.cardTypePredicateId).text.singular;
    const article = /^[aeiou]/i.test(singular) ? "an" : "a";
    return `Change ${target.text} to become ${article} ${singular}`;
  },
  operations: (p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetChangeCardToBecomeType.id,
    operationKey: targetChangeCardToBecomeType.operationKey(p),
    rewardKind: "card_type_change",
    payload: {
      rewardTypeId: "change_card_to_become_type",
      cardTypePredicateId: p.cardTypePredicateId,
    },
  }),
};

const targetModifyRandomCardsToTypes: OneOperationManyTargetsReward<CountParams> = {
  id: "target_modify_random_cards_to_types",
  rewardTypeId: "modify_random_cards_to_types",
  targetKind: "card_type",
  symbols: ["reward", "card"],
  stages: ["early", "mid"],
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "oomt_modify_random_types:n", 1, 3) }),
  operationKey: (p) => `modify_random_cards_to_types:${p.count}`,
  targets: () => CARD_TYPE_PREDICATE_IDS.map((predicateId) => cardTypeTarget(predicateId)),
  cec: (p) => CARD_CEC * 0.5 * p.count,
  render: (p, target) =>
    `Modify ${p.count} random card${p.count === 1 ? "" : "s"} to become ${target.text}`,
  operations: (p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetModifyRandomCardsToTypes.id,
    operationKey: targetModifyRandomCardsToTypes.operationKey(p),
    rewardKind: "card_type_change",
    payload: {
      rewardTypeId: "modify_random_cards_to_types",
      count: p.count,
      cardTypePredicateId: String(target.key).replace("card_type:", ""),
    },
  }),
};

const targetPurgeChosenPredicateCards: OneOperationManyTargetsReward<CountParams> = {
  id: "target_purge_chosen_predicate_cards",
  rewardTypeId: "purge_chosen_predicate_cards",
  targetKind: "predicate",
  symbols: ["reward", "card"],
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "oomt_purge_chosen_pred:n", 1, 3) }),
  operationKey: (p) => `purge_chosen_predicate_cards:${p.count}`,
  targets: (_p, ctx) => matchingPredicateTargets({ ctx, minMatches: 1 }),
  cec: (p, target) => cardPoolCEC(CARD_CEC * 0.3, p.count, getPredicate(String(target.key).replace("predicate:", ""))),
  render: (p, target) => {
    const predicateId = String(target.key).replace("predicate:", "");
    const pred = getPredicate(predicateId);
    const noun = p.count === 1 ? pred.text.singular : pred.text.plural;
    return `Purge up to ${p.count} chosen ${noun}`;
  },
  operations: (p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetPurgeChosenPredicateCards.id,
    operationKey: targetPurgeChosenPredicateCards.operationKey(p),
    rewardKind: "card_purge",
    payload: {
      rewardTypeId: "purge_chosen_predicate_cards",
      count: p.count,
      predicateId: String(target.key).replace("predicate:", ""),
    },
  }),
};

const targetPurgeChosenPredicateWithReplacement: OneOperationManyTargetsReward<CountParams> = {
  id: "target_purge_chosen_predicate_with_replacement",
  rewardTypeId: "purge_chosen_predicate_with_replacement",
  targetKind: "predicate",
  symbols: ["reward", "card"],
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "oomt_purge_repl:n", 1, 2) }),
  operationKey: (p) => `purge_chosen_predicate_with_replacement:${p.count}`,
  targets: (_p, ctx) => matchingPredicateTargets({ ctx, minMatches: 1 }),
  cec: (p, target) => cardPoolCEC(CARD_CEC * 0.6, p.count, getPredicate(String(target.key).replace("predicate:", ""))),
  render: (p, target) => {
    const pred = getPredicate(String(target.key).replace("predicate:", ""));
    if (p.count === 1) {
      return `Transform a chosen ${pred.text.singular} into a random ${pred.text.singular}`;
    }
    return `Transform up to ${p.count} chosen ${pred.text.plural} into random ${pred.text.plural}`;
  },
  operations: (p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetPurgeChosenPredicateWithReplacement.id,
    operationKey: targetPurgeChosenPredicateWithReplacement.operationKey(p),
    rewardKind: "card_replace",
    payload: {
      rewardTypeId: "purge_chosen_predicate_with_replacement",
      count: p.count,
      predicateId: String(target.key).replace("predicate:", ""),
    },
  }),
};

const targetPurgeNamedStarter: OneOperationManyTargetsReward<EmptyParams> = {
  id: "target_purge_named_starter",
  rewardTypeId: "purge_named_starter",
  targetKind: "starter_card_name",
  symbols: ["reward", "card"],
  rollParams: () => ({}),
  operationKey: () => "purge_named_starter",
  targets: (_p, ctx) => cardMatches(ctx, { starter: true }).map((card) => cardTarget(card, "deck")),
  cec: () => CARD_CEC * 0.4,
  render: (_p, target) => `Purge ${target.text}`,
  operations: (_p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetPurgeNamedStarter.id,
    operationKey: targetPurgeNamedStarter.operationKey({}),
    rewardKind: "starter_cleanup",
    payload: { rewardTypeId: "purge_named_starter" },
  }),
};

const targetPurgeRandomStarterWithPredicateReplacement: OneOperationManyTargetsReward<EmptyParams> = {
  id: "target_purge_random_starter_with_predicate_replacement",
  rewardTypeId: "purge_random_starter_with_predicate_replacement",
  targetKind: "predicate",
  symbols: ["reward", "card"],
  rollParams: () => ({}),
  operationKey: () => "purge_random_starter_with_predicate_replacement",
  targets: (_p, ctx) => starterCardCount(ctx) >= 1
    ? matchingPredicateTargets({
        ctx,
        minMatches: 1,
        excludedIds: CARD_ADDITION_EXCLUDED_PREDICATE_IDS,
        noun: "singular",
      })
    : [],
  cec: (_p, target) => cardPoolCEC(CARD_CEC * 0.7, 1, getPredicate(String(target.key).replace("predicate:", ""))),
  render: (_p, target) => `Transform a random starter card into a random ${target.text}`,
  operations: (_p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetPurgeRandomStarterWithPredicateReplacement.id,
    operationKey: targetPurgeRandomStarterWithPredicateReplacement.operationKey({}),
    rewardKind: "starter_replacement",
    payload: {
      rewardTypeId: "purge_random_starter_with_predicate_replacement",
      predicateId: String(target.key).replace("predicate:", ""),
    },
  }),
};

const targetTransformStarterIntoNamedCard: OneOperationManyTargetsReward<EmptyParams> = {
  id: "target_transform_starter_into_named_card",
  rewardTypeId: "transform_starter_into_named_card",
  targetKind: "new_card_name",
  symbols: ["reward", "card"],
  rollParams: () => ({}),
  operationKey: () => "transform_starter_into_named_card",
  targets: (_p, ctx) => starterCardCount(ctx) >= 1
    ? ctx.content.cards.map((card) => cardTarget(card, "catalog"))
    : [],
  cec: () => CARD_CEC * 0.8,
  render: (_p, target) => `Choose a starter card to transform into ${target.text}`,
  operations: (_p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetTransformStarterIntoNamedCard.id,
    operationKey: targetTransformStarterIntoNamedCard.operationKey({}),
    rewardKind: "starter_replacement",
    payload: { rewardTypeId: "transform_starter_into_named_card" },
  }),
};

const targetTransformCardInDeckIntoNamed: OneOperationManyTargetsReward<{ oldCardName: string }> = {
  id: "target_transform_card_in_deck_into_named",
  rewardTypeId: "transform_card_in_deck_into_named",
  targetKind: "new_card_name",
  symbols: ["reward", "card"],
  rollParams: (ctx, draw) => {
    const deckCards = cardMatches(ctx, { source: "deck" });
    return {
      oldCardName: deckCards.length > 0
        ? pickFromList(draw, "oomt_xform_deck:old", deckCards).name
        : "Placeholder Card",
    };
  },
  operationKey: (p) => `transform_card_in_deck_into_named:${p.oldCardName}`,
  targets: (p, ctx) => cardMatches(ctx, { source: "deck", names: [p.oldCardName] }).length >= 1
    ? ctx.content.cards.filter((card) => card.name !== p.oldCardName).map((card) => cardTarget(card, "catalog"))
    : [],
  cec: () => CARD_CEC,
  render: (p, target) => `Transform ${quoteName(p.oldCardName)} into ${target.text}`,
  operations: (p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetTransformCardInDeckIntoNamed.id,
    operationKey: targetTransformCardInDeckIntoNamed.operationKey(p),
    rewardKind: "card_transform",
    payload: {
      rewardTypeId: "transform_card_in_deck_into_named",
      oldCardName: p.oldCardName,
    },
  }),
};

const targetTransformChosenPredicateIntoNamed: OneOperationManyTargetsReward<{ predicateId: string }> = {
  id: "target_transform_chosen_predicate_into_named",
  rewardTypeId: "transform_chosen_predicate_into_named",
  targetKind: "new_card_name",
  symbols: ["reward", "card"],
  rollParams: (_ctx, draw) => ({ predicateId: rollPredicate(draw, "oomt_xform_pred:pred").id }),
  operationKey: (p) => `transform_chosen_predicate_into_named:${p.predicateId}`,
  targets: (p, ctx) => cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= 1
    ? ctx.content.cards.map((card) => cardTarget(card, "catalog"))
    : [],
  cec: (p) => cardPoolCEC(CARD_CEC * 1.2, 1, getPredicate(p.predicateId)),
  render: (p, target) =>
    `Transform a chosen ${getPredicate(p.predicateId).text.singular} into ${target.text}`,
  operations: (p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetTransformChosenPredicateIntoNamed.id,
    operationKey: targetTransformChosenPredicateIntoNamed.operationKey(p),
    rewardKind: "card_transform",
    payload: {
      rewardTypeId: "transform_chosen_predicate_into_named",
      predicateId: p.predicateId,
    },
  }),
};

const targetDuplicateNamedCardX: OneOperationManyTargetsReward<CountParams> = {
  id: "target_duplicate_named_card_X",
  rewardTypeId: "duplicate_named_card_X",
  targetKind: "visible_named_card_target",
  symbols: ["reward", "card"],
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "oomt_dup_named:n", 1, 3) }),
  operationKey: (p) => `duplicate_named_card_X:${p.count}`,
  targets: (_p, ctx) => cardMatches(ctx, { source: "deck" }).map((card) => cardTarget(card, "deck")),
  cec: (p) => CARD_CEC * p.count,
  render: (p, target) => `Create ${p.count} duplicate${p.count === 1 ? "" : "s"} of ${target.text}`,
  operations: (p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetDuplicateNamedCardX.id,
    operationKey: targetDuplicateNamedCardX.operationKey(p),
    rewardKind: "card_duplicate",
    payload: {
      rewardTypeId: "duplicate_named_card_X",
      count: p.count,
    },
  }),
};

const targetDuplicateRandomPredicate: OneOperationManyTargetsReward<CountParams> = {
  id: "target_duplicate_random_predicate",
  rewardTypeId: "duplicate_random_predicate",
  targetKind: "predicate",
  symbols: ["reward", "card"],
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "oomt_dup_random_pred:n", 1, 3) }),
  operationKey: (p) => `duplicate_random_predicate:${p.count}`,
  targets: (p, ctx) => matchingPredicateTargets({
    ctx,
    minMatches: p.count,
    kinds: RANDOM_GAIN_PREDICATE_KINDS,
    excludedIds: CARD_ADDITION_EXCLUDED_PREDICATE_IDS,
  }),
  cec: (p, target) => cardPoolCEC(CARD_CEC * 0.9, p.count, getPredicate(String(target.key).replace("predicate:", ""))),
  render: (p, target) => {
    const predicateId = String(target.key).replace("predicate:", "");
    const pred = getPredicate(predicateId);
    const noun = p.count === 1 ? pred.text.singular : pred.text.plural;
    return `Duplicate ${p.count} random ${noun}`;
  },
  operations: (p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetDuplicateRandomPredicate.id,
    operationKey: targetDuplicateRandomPredicate.operationKey(p),
    rewardKind: "card_duplicate",
    payload: {
      rewardTypeId: "duplicate_random_predicate",
      count: p.count,
      predicateId: String(target.key).replace("predicate:", ""),
    },
  }),
};

const targetGainNamedDreamsign: OneOperationManyTargetsReward<EmptyParams> = {
  id: "target_gain_named_dreamsign",
  rewardTypeId: "gain_named_dreamsign",
  targetKind: "dreamsign_name",
  symbols: ["reward", "dreamsign"],
  rollParams: () => ({}),
  operationKey: () => "gain_named_dreamsign",
  targets: (_p, ctx) => dreamsignMatches(ctx).map((dreamsign) => dreamsignTarget(dreamsign, "catalog")),
  cec: () => DREAMSIGN_CEC,
  render: (_p, target) => `Gain ${target.text}`,
  operations: (_p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetGainNamedDreamsign.id,
    operationKey: targetGainNamedDreamsign.operationKey({}),
    rewardKind: "dreamsign_gain",
    payload: { rewardTypeId: "gain_named_dreamsign" },
  }),
};

const targetGainCopyOfChosenDreamsign: OneOperationManyTargetsReward<EmptyParams> = {
  id: "target_gain_copy_of_chosen_dreamsign",
  rewardTypeId: "gain_copy_of_chosen_dreamsign",
  targetKind: "chosen_dreamsign",
  symbols: ["reward", "dreamsign"],
  rollParams: () => ({}),
  operationKey: () => "gain_copy_of_chosen_dreamsign",
  targets: (_p, ctx) => dreamsignMatches(ctx, { source: "active" }).map((dreamsign) => dreamsignTarget(dreamsign, "active")),
  cec: () => DREAMSIGN_CEC * 3.0,
  render: (_p, target) => `Gain a copy of ${target.text}`,
  operations: (_p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetGainCopyOfChosenDreamsign.id,
    operationKey: targetGainCopyOfChosenDreamsign.operationKey({}),
    rewardKind: "dreamsign_copy_gain",
    payload: {
      rewardTypeId: "gain_copy_of_chosen_dreamsign",
      copyCount: 1,
    },
  }),
};

type AddSiteParamsForTarget = { scope: "current_dreamscape" | "next_dreamscape" };
const targetAddSiteToDreamscape: OneOperationManyTargetsReward<EmptyParams> = {
  id: "target_add_site_to_dreamscape",
  rewardTypeId: "add_site_to_dreamscape",
  targetKind: "route_site",
  symbols: ["reward", "route"],
  rollParams: () => ({}),
  operationKey: () => "add_site_to_dreamscape",
  targets: () => JOURNEY_REWARDABLE_SITE_TYPES.map((siteType) => routeSiteTarget(siteType, "current_dreamscape")),
  cec: () => 100,
  render: (_p, target) => `Add a ${target.text} to this dreamscape`,
  operations: (_p, target, args) => routeAddOperations({
    ...args,
    target,
    templateId: targetAddSiteToDreamscape.id,
    operationKey: targetAddSiteToDreamscape.operationKey({}),
    scope: "current_dreamscape",
  }),
};

const targetAddSiteToNextDreamscape: OneOperationManyTargetsReward<EmptyParams> = {
  id: "target_add_site_to_next_dreamscape",
  rewardTypeId: "add_site_to_next_dreamscape",
  targetKind: "route_site",
  symbols: ["reward", "route"],
  rollParams: () => ({}),
  operationKey: () => "add_site_to_next_dreamscape",
  targets: () => JOURNEY_REWARDABLE_SITE_TYPES.map((siteType) => routeSiteTarget(siteType, "next_dreamscape")),
  cec: () => 75,
  render: (_p, target) => `Add a ${target.text} to the next dreamscape you visit`,
  operations: (_p, target, args) => routeAddOperations({
    ...args,
    target,
    templateId: targetAddSiteToNextDreamscape.id,
    operationKey: targetAddSiteToNextDreamscape.operationKey({}),
    scope: "next_dreamscape",
  }),
};

const targetSetStartingDreamwellPositive: OneOperationManyTargetsReward<EmptyParams> = {
  id: "target_set_starting_dreamwell_positive",
  rewardTypeId: "set_starting_dreamwell_positive",
  targetKind: "dreamwell_card_name",
  symbols: ["reward", "dreamwell"],
  rollParams: () => ({}),
  operationKey: () => "set_starting_dreamwell_positive",
  targets: () => POSITIVE_DREAMWELL_CARDS.map((name) => statusVocabularyTarget("dreamwell_card", "dreamwell", name)),
  cec: () => 60,
  render: (_p, target) => `Your starting dreamwell card is ${target.text}`,
  operations: (_p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetSetStartingDreamwellPositive.id,
    operationKey: targetSetStartingDreamwellPositive.operationKey({}),
    rewardKind: "dreamwell_modifier",
    payload: {
      kind: "dreamwell_modifier",
      rewardTypeId: "set_starting_dreamwell_positive",
      dreamwellOperationKind: "starting_card",
      dreamwellCardName: target.text.replaceAll("\"", ""),
    },
  }),
};

const targetShufflePositiveDreamwellCards: OneOperationManyTargetsReward<CountParams> = {
  id: "target_shuffle_positive_dreamwell_cards",
  rewardTypeId: "shuffle_positive_dreamwell_cards",
  targetKind: "dreamwell_card_name",
  symbols: ["reward", "dreamwell"],
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "oomt_shuffle_dw_pos:n", 1, 3) }),
  operationKey: (p) => `shuffle_positive_dreamwell_cards:${p.count}`,
  targets: () => POSITIVE_DREAMWELL_CARDS.map((name) => statusVocabularyTarget("dreamwell_card", "dreamwell", name)),
  cec: (p) => 25 * p.count,
  render: (p, target) =>
    `Shuffle ${p.count} ${target.text}${p.count === 1 ? "" : " copies"} into your dreamwell`,
  operations: (p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetShufflePositiveDreamwellCards.id,
    operationKey: targetShufflePositiveDreamwellCards.operationKey(p),
    rewardKind: "dreamwell_modifier",
    payload: {
      kind: "dreamwell_modifier",
      rewardTypeId: "shuffle_positive_dreamwell_cards",
      dreamwellOperationKind: "shuffle_card",
      dreamwellCardName: target.text.replaceAll("\"", ""),
      count: p.count,
    },
  }),
};

type PercentParams = { percent: number };
const targetBoostSiteAppearanceChance: OneOperationManyTargetsReward<PercentParams> = {
  id: "target_boost_site_appearance_chance",
  rewardTypeId: "boost_site_appearance_chance",
  targetKind: "route_site",
  symbols: ["reward", "route"],
  rollParams: (_ctx, draw) => ({ percent: 10 + 10 * drawInt(draw, "oomt_boost_site:p", 0, 4) }),
  operationKey: (p) => `boost_site_appearance_chance:${p.percent}`,
  targets: () => JOURNEY_REWARDABLE_SITE_TYPES.map((siteType) => routeSiteTarget(siteType, "future_dreamscapes")),
  cec: (p, target) => {
    const siteType = String(target.key).split(":").at(-1)!;
    return boostSiteCec(siteType, p.percent);
  },
  render: (p, target) => `${p.percent}% higher chance to see ${target.text}s in future dreamscapes`,
  operations: (p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetBoostSiteAppearanceChance.id,
    operationKey: targetBoostSiteAppearanceChance.operationKey(p),
    rewardKind: "unknown",
    payload: {
      rewardTypeId: "boost_site_appearance_chance",
      percent: p.percent,
      siteType: String(target.key).split(":").at(-1),
    },
  }),
};

const targetDraft2PredicateCardsFrom4: OneOperationManyTargetsReward<EmptyParams> = {
  ...targetDraftPredicateCardsFrom4,
  id: "target_draft_2_predicate_cards_from_4",
  rewardTypeId: "draft_2_predicate_cards_from_4",
  operationKey: () => "draft_2_predicate_cards_from_4",
  cec: (_p, target) => {
    const predicateId = String(target.key).replace("predicate:", "");
    return isFlatDraftPredicate(predicateId)
      ? FLAT_DRAFT_CEC
      : cardPoolCEC(CARD_CEC * 1.4, 2, getPredicate(predicateId));
  },
  render: (_p, target) => `Draft 2 of 4 ${target.text}`,
  operations: (_p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: "target_draft_2_predicate_cards_from_4",
    operationKey: "draft_2_predicate_cards_from_4",
    rewardKind: "card_draft",
    payload: {
      rewardTypeId: "draft_2_predicate_cards_from_4",
      takeCount: 2,
      choiceCount: 4,
      predicateId: String(target.key).replace("predicate:", ""),
    },
  }),
};

type CopiesParams = { copies: number };
const targetDraftPredicateCardWithCopies: OneOperationManyTargetsReward<CopiesParams> = {
  id: "target_draft_predicate_card_with_copies",
  rewardTypeId: "draft_predicate_card_with_copies",
  targetKind: "predicate",
  symbols: ["reward", "card"],
  rollParams: (_ctx, draw) => ({ copies: drawInt(draw, "oomt_draft_pred_copies:n", 2, 3) }),
  operationKey: (p) => `draft_predicate_card_with_copies:${p.copies}`,
  targets: (_p, ctx) => matchingPredicateTargets({
    ctx,
    minMatches: 4,
    excludedIds: CARD_ADDITION_EXCLUDED_PREDICATE_IDS,
  }),
  cec: (p, target) => {
    const predicateId = String(target.key).replace("predicate:", "");
    return isFlatDraftPredicate(predicateId)
      ? FLAT_DRAFT_CEC
      : cardPoolCEC(CARD_CEC * 1.3, p.copies, getPredicate(predicateId));
  },
  render: (p, target) => `Draft 1 of 4 ${target.text} and gain ${p.copies} copies of it`,
  operations: (p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetDraftPredicateCardWithCopies.id,
    operationKey: targetDraftPredicateCardWithCopies.operationKey(p),
    rewardKind: "card_draft",
    payload: {
      rewardTypeId: "draft_predicate_card_with_copies",
      takeCount: 1,
      choiceCount: 4,
      copies: p.copies,
      predicateId: String(target.key).replace("predicate:", ""),
    },
  }),
};

const targetDraftPredicateCardWithTransfiguration: OneOperationManyTargetsReward<EmptyParams> = {
  id: "target_draft_predicate_card_with_transfiguration",
  rewardTypeId: "draft_predicate_card_with_transfiguration",
  targetKind: "transfiguration_predicate",
  symbols: ["reward", "card"],
  rollParams: () => ({}),
  operationKey: () => "draft_predicate_card_with_transfiguration",
  targets: (_p, ctx) => transfigurationPredicateTargets({ ctx, minMatches: 4 }),
  cec: (_p, target) => {
    const predicateId = String(target.key).split(":").at(-1)!;
    return isFlatDraftPredicate(predicateId)
      ? FLAT_DRAFT_CEC
      : cardPoolCEC(CARD_CEC * 1.8, 1, getPredicate(predicateId));
  },
  render: (_p, target) => {
    const [, transfiguration, predicateId] = String(target.key).split(":");
    return `Draft 1 of 4 ${getPredicate(predicateId!).text.plural} and apply ${transfiguration} to it`;
  },
  operations: (_p, target, args) => {
    const [, transfiguration, predicateId] = String(target.key).split(":");
    return rewardOperations({
      ...args,
      target,
      templateId: targetDraftPredicateCardWithTransfiguration.id,
      operationKey: targetDraftPredicateCardWithTransfiguration.operationKey({}),
      rewardKind: "card_draft",
      payload: {
        rewardTypeId: "draft_predicate_card_with_transfiguration",
        takeCount: 1,
        choiceCount: 4,
        transfigurationName: transfiguration,
        predicateId,
      },
    });
  },
};

type CostReductionTargetParams = { amount: number; battles: number };
const targetCardCostReductionForXBattles: OneOperationManyTargetsReward<CostReductionTargetParams> = {
  id: "target_card_cost_reduction_for_X_battles",
  rewardTypeId: "card_cost_reduction_for_X_battles",
  targetKind: "predicate",
  symbols: ["reward", "card"],
  rollParams: (_ctx, draw) => ({
    amount: drawInt(draw, "oomt_cost_red:a", 1, 2),
    battles: rollPositiveTemporaryBattles(draw, "oomt_cost_red:b"),
  }),
  operationKey: (p) => `card_cost_reduction_for_X_battles:${p.amount}:${p.battles}`,
  targets: (_p, ctx) => matchingPredicateTargets({ ctx, minMatches: 1 }),
  cec: (p, target) =>
    cardPoolCEC(CARD_CEC * 0.3 * p.amount * p.battles, 1, getPredicate(String(target.key).replace("predicate:", ""))),
  render: (p, target) =>
    `${sentenceCase(target.text)} cost ${p.amount} less for the next ${p.battles} battle${p.battles === 1 ? "" : "s"}`,
  operations: (p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetCardCostReductionForXBattles.id,
    operationKey: targetCardCostReductionForXBattles.operationKey(p),
    rewardKind: "battle_window_modifier",
    payload: {
      rewardTypeId: "card_cost_reduction_for_X_battles",
      amount: p.amount,
      battles: p.battles,
      predicateId: String(target.key).replace("predicate:", ""),
    },
  }),
};

const targetApplyNamedTransfigurationToAllPredicateCards: OneOperationManyTargetsReward<EmptyParams> = {
  id: "target_apply_named_transfiguration_to_all_predicate_cards",
  rewardTypeId: "apply_named_transfiguration_to_all_predicate_cards",
  targetKind: "transfiguration_predicate",
  symbols: ["reward", "card"],
  rollParams: () => ({}),
  operationKey: () => "apply_named_transfiguration_to_all_predicate_cards",
  targets: (_p, ctx) => transfigurationPredicateTargets({ ctx, minMatches: 1 }),
  cec: (_p, target, ctx) => {
    const predicateId = String(target.key).split(":").at(-1)!;
    const matches = cardMatches(ctx, getPredicate(predicateId).cardPredicate ?? {}).length;
    return CARD_CEC * 0.6 * Math.max(1, matches) * getPredicate(predicateId).multiplier;
  },
  render: (_p, target) => {
    const [, transfiguration, predicateId] = String(target.key).split(":");
    return `Apply ${transfiguration} to all ${getPredicate(predicateId!).text.plural}`;
  },
  operations: (_p, target, args) => {
    const [, transfiguration, predicateId] = String(target.key).split(":");
    return rewardOperations({
      ...args,
      target,
      templateId: targetApplyNamedTransfigurationToAllPredicateCards.id,
      operationKey: targetApplyNamedTransfigurationToAllPredicateCards.operationKey({}),
      rewardKind: "card_transfigure",
      payload: {
        rewardTypeId: "apply_named_transfiguration_to_all_predicate_cards",
        transfigurationName: transfiguration,
        predicateId,
        targetMode: "all_predicate",
      },
    });
  },
};

const targetTransformDreamsignToNamed: OneOperationManyTargetsReward<EmptyParams> = {
  id: "target_transform_dreamsign_to_named",
  rewardTypeId: "transform_dreamsign_to_named",
  targetKind: "dreamsign_name",
  symbols: ["reward", "dreamsign"],
  rollParams: () => ({}),
  operationKey: () => "transform_dreamsign_to_named",
  targets: (_p, ctx) => ctx.state.quest.activeDreamsigns.length >= 1
    ? dreamsignMatches(ctx).map((dreamsign) => dreamsignTarget(dreamsign, "catalog"))
    : [],
  cec: () => DREAMSIGN_CEC * 0.6,
  render: (_p, target) => `Transform a chosen dreamsign into ${target.text}`,
  operations: (_p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetTransformDreamsignToNamed.id,
    operationKey: targetTransformDreamsignToNamed.operationKey({}),
    rewardKind: "dreamsign_transform",
    payload: { rewardTypeId: "transform_dreamsign_to_named" },
  }),
};

const targetReplaceSiteType: OneOperationManyTargetsReward<{ fromType: string }> = {
  id: "target_replace_site_type",
  rewardTypeId: "replace_site_type",
  targetKind: "route_site",
  symbols: ["reward", "route"],
  rollParams: (_ctx, draw) => ({
    fromType: pickFromList(draw, "oomt_replace_site:from", JOURNEY_REPLACEABLE_SITE_TYPES),
  }),
  operationKey: (p) => `replace_site_type:${p.fromType}`,
  targets: (p) => JOURNEY_REWARDABLE_SITE_TYPES
    .filter((siteType) => siteType !== p.fromType)
    .map((siteType) => routeSiteTarget(siteType, "current_dreamscape")),
  cec: () => 35,
  render: (p, target) => `Replace a ${p.fromType} site in this dreamscape with a ${target.text}`,
  operations: (p, target, args) => {
    const siteType = String(target.key).split(":").at(-1);
    const operationIdPrefix = `one_operation_many_targets:${args.optionNumber}`;
    return [
      {
        operationId: `${operationIdPrefix}:route-edit`,
        operationKind: "route_edit",
        role: "route_edit",
        editKind: "replace_site",
        visibility: "visible",
        timing: { timingKind: "route", scope: "current_dreamscape" },
        value: { convertedEssence: args.cec },
        targetSelector: target.selector,
        fromSite: p.fromType,
        toSite: siteType,
        payload: {
          templateId: targetReplaceSiteType.id,
          rewardTypeId: "replace_site_type",
          operationKey: targetReplaceSiteType.operationKey(p),
          targetKey: target.key,
          fromType: p.fromType,
          toType: siteType,
        },
      },
      {
        operationId: `${operationIdPrefix}:target`,
        operationKind: "target",
        role: "target",
        visibility: "visible",
        targetSelector: target.selector,
        payload: {
          templateId: targetReplaceSiteType.id,
          targetKind: target.selector.selectorKind,
          targetKey: target.key,
        },
      },
    ];
  },
};

const targetMetaGain2Rewards: OneOperationManyTargetsReward<MetaRewardPairParams> = {
  id: "target_meta_gain_2_rewards",
  rewardTypeId: "meta_gain_2_rewards",
  targetKind: "sub_reward_templates",
  symbols: ["reward"],
  rollParams: (ctx, draw, stage) => ({ pairs: pairedMetaRewardTargets(ctx, draw, stage) }),
  operationKey: () => "meta_gain_2_rewards",
  targets: (p) =>
    p.pairs.map((pair) =>
      vocabularyTarget(
        "meta_reward_pair",
        `${pair.cardId}:${pair.dreamsignId}`,
        `${quoteName(pair.cardName)} and ${quoteName(pair.dreamsignName)}`,
        {
          selectorKind: "status",
          selection: "exact",
          referenceKind: "controlled_vocabulary",
          scope: "reward",
          statusName: `${pair.cardName} / ${pair.dreamsignName}`,
          description: `${quoteName(pair.cardName)} and ${quoteName(pair.dreamsignName)}`,
        },
      ),
    ),
  cec: () => CARD_CEC * STAGE_MULTIPLIER + DREAMSIGN_CEC,
  render: (_p, target) => {
    const [, cardId, dreamsignId] = String(target.key).split(":");
    const cardName = target.selector.selectorKind === "status"
      ? String(target.selector.statusName).split(" / ")[0]
      : cardId;
    const dreamsignName = target.selector.selectorKind === "status"
      ? String(target.selector.statusName).split(" / ")[1]
      : dreamsignId;
    return `Gain ${quoteName(cardName ?? "")}. Gain ${quoteName(dreamsignName ?? "")}`;
  },
  operations: (_p, target, args) => rewardOperations({
    ...args,
    target,
    templateId: targetMetaGain2Rewards.id,
    operationKey: targetMetaGain2Rewards.operationKey(_p),
    rewardKind: "unknown",
    payload: {
      rewardTypeId: "meta_gain_2_rewards",
      subRewardTypes: ["gain_named_card", "gain_named_dreamsign"],
    },
  }),
};

export const ONE_OPERATION_MANY_TARGETS_AUDITED_REWARD_IDS: readonly string[] = Object.freeze([
  "gain_random_predicate_cards",
  "draft_predicate_cards_from_4",
  "take_any_from_predicate_choices",
  "gain_named_card",
  "apply_chosen_transfiguration_to_chosen_card",
  "apply_named_transfiguration_to_chosen_predicate_cards",
  "apply_named_transfiguration_to_card_name",
  "apply_named_transfiguration_to_random_predicate_cards",
  "change_card_to_become_type",
  "modify_random_cards_to_types",
  "purge_chosen_predicate_cards",
  "purge_chosen_predicate_with_replacement",
  "purge_named_starter",
  "purge_random_starter_with_predicate_replacement",
  "transform_starter_into_named_card",
  "transform_card_in_deck_into_named",
  "transform_chosen_predicate_into_named",
  "duplicate_named_card_X",
  "duplicate_random_predicate",
  "gain_named_dreamsign",
  "gain_copy_of_chosen_dreamsign",
  "add_site_to_dreamscape",
  "add_site_to_next_dreamscape",
  "set_starting_dreamwell_positive",
  "shuffle_positive_dreamwell_cards",
  "boost_site_appearance_chance",
  "draft_2_predicate_cards_from_4",
  "draft_predicate_card_with_copies",
  "draft_predicate_card_with_transfiguration",
  "make_card_reclaim",
  "opening_hand_grant_for_X_battles",
  "temporary_card_copy_for_X_battles",
  "card_cost_reduction_for_X_battles",
  "apply_named_transfiguration_to_all_predicate_cards",
  "transform_dreamsign_to_named",
  "replace_site_type",
  "meta_gain_2_rewards",
] as const);

export const ONE_OPERATION_MANY_TARGETS_REWARDS: readonly OneOperationManyTargetsReward[] = Object.freeze([
  targetGainRandomPredicateCards,
  targetDraftPredicateCardsFrom4,
  targetTakeAnyFromPredicateChoices,
  targetGainNamedCard,
  targetApplyChosenTransfiguration,
  targetApplyNamedTransfigurationToChosenPredicateCards,
  targetApplyNamedTransfiguration,
  targetApplyNamedTransfigurationToRandomPredicateCards,
  targetChangeCardToBecomeType,
  targetModifyRandomCardsToTypes,
  targetPurgeChosenPredicateCards,
  targetPurgeChosenPredicateWithReplacement,
  targetPurgeNamedStarter,
  targetPurgeRandomStarterWithPredicateReplacement,
  targetTransformStarterIntoNamedCard,
  targetTransformCardInDeckIntoNamed,
  targetTransformChosenPredicateIntoNamed,
  targetDuplicateNamedCardX,
  targetDuplicateRandomPredicate,
  targetGainNamedDreamsign,
  targetGainCopyOfChosenDreamsign,
  targetAddSiteToDreamscape,
  targetAddSiteToNextDreamscape,
  targetSetStartingDreamwellPositive,
  targetShufflePositiveDreamwellCards,
  targetBoostSiteAppearanceChance,
  targetDraft2PredicateCardsFrom4,
  targetDraftPredicateCardWithCopies,
  targetDraftPredicateCardWithTransfiguration,
  targetAddReclaim,
  targetOpeningHand,
  targetTemporaryCopy,
  targetCardCostReductionForXBattles,
  targetApplyNamedTransfigurationToAllPredicateCards,
  targetTransformDreamsignToNamed,
  targetReplaceSiteType,
  targetMetaGain2Rewards,
]);
