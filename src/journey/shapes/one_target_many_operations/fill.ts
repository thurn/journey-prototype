import type { CardContent } from "../../../content/model.js";
import type { JourneyContext } from "../../../quest/context.js";
import { drawInt, shuffleDeterministic, weightedChoice, type DrawContext } from "../../../util/rng.js";
import type { JourneyOption, JourneySymmetryContractDebug } from "../../manifest.js";
import { CARD_CEC, STAGE_MULTIPLIER, cardPoolCEC } from "../../shared/cec.js";
import {
  JOURNEY_REPLACEABLE_SITE_TYPES,
  JOURNEY_REWARDABLE_SITE_TYPES,
  JOURNEY_TRANSFIGURATIONS,
  cardMatches,
  essenceAmount,
  isCardEligibleForTransfiguration,
  maxEssence,
  pickFromList,
  starterCardCount,
  transfigurationsEligibleForPredicate,
} from "../../shared/content.js";
import { PREDICATES, getPredicate } from "../../shared/predicates.js";
import { quoteName } from "../../shared/text.js";
import type { Predicate, PredicateKind, TemplateParams } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

type TargetKind =
  | "named_card"
  | "predicate_cards"
  | "chosen_starter"
  | "route_site"
  | "shop_surface"
  | "player_resources";

type SharedTarget = {
  readonly kind: TargetKind;
  readonly key: string;
  readonly text: string;
  readonly symbols: readonly string[];
  readonly weight: number;
  readonly card?: CardContent;
  readonly predicate?: Predicate;
  readonly siteType?: string;
};

type OperationTemplate<P extends TemplateParams = TemplateParams> = {
  readonly id: string;
  readonly symbols: readonly string[];
  readonly targetKinds: readonly TargetKind[];
  readonly weight: number;
  readonly rollParams: (ctx: JourneyContext, draw: DrawContext, target: SharedTarget) => P;
  readonly viable: (params: P, ctx: JourneyContext, target: SharedTarget) => boolean;
  readonly cec: (params: P, ctx: JourneyContext, target: SharedTarget) => number;
  readonly render: (params: P, ctx: JourneyContext, target: SharedTarget) => string;
};

type RolledOperation = {
  readonly template: OperationTemplate;
  readonly params: TemplateParams;
  readonly cec: number;
};

type TargetCandidate = {
  readonly target: SharedTarget;
  readonly operations: readonly RolledOperation[];
};

const RANDOM_GAIN_PREDICATE_KINDS: readonly PredicateKind[] = ["ability", "card-type"];
const CARD_ADDITION_EXCLUDED_PREDICATE_IDS = new Set(["starter"]);
const CARD_TYPE_PREDICATE_IDS = ["warriors", "survivors", "spirit_animals"] as const;
const POSITIVE_TEMPORARY_BATTLES = 3;
const FLAT_DRAFT_PREDICATE_IDS = new Set(["low_spark", "high_spark"]);
const FLAT_DRAFT_CEC = 25;

function articleFor(text: string): string {
  return /^[aeiou]/iu.test(text) ? "an" : "a";
}

function optionFor(
  number: number,
  target: SharedTarget,
  operation: RolledOperation,
  ctx: JourneyContext,
): JourneyOption {
  const symbols = Array.from(new Set([...target.symbols, ...operation.template.symbols]));
  const cec = operation.cec;

  return {
    number,
    symbols,
    text: operation.template.render(operation.params, ctx, target),
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence: cec,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: cec,
    pickBehavior: "record_and_generate_next",
  };
}

function symmetryContract(
  target: SharedTarget,
  operations: readonly RolledOperation[],
): JourneySymmetryContractDebug {
  return {
    contractKind: "shared_axis_rotated_attribute",
    sharedProperty: `target=${target.key}`,
    variedProperty: "operation",
    sharedFirst: true,
    optionNumbers: operations.map((_operation, index) => index + 1),
    sharedPayloadKeys: [target.key],
    variedPayloadKeys: operations.map((operation) => operation.template.id),
    weight: 2,
  };
}

function uniqueCardsById(cards: readonly CardContent[]): readonly CardContent[] {
  return cards.filter((card, index, entries) =>
    entries.findIndex((entry) => entry.id === card.id) === index
  );
}

function matchingCardCount(ctx: JourneyContext, predicate: Predicate): number {
  return cardMatches(ctx, predicate.cardPredicate ?? {}).length;
}

function cardPoolValue(
  predicate: Predicate,
  perItem: number,
  count: number,
): number {
  return FLAT_DRAFT_PREDICATE_IDS.has(predicate.id)
    ? FLAT_DRAFT_CEC
    : cardPoolCEC(perItem, count, predicate);
}

function namedCardTargets(ctx: JourneyContext): readonly SharedTarget[] {
  return uniqueCardsById(cardMatches(ctx, { source: "deck" })).map((card) => ({
    kind: "named_card",
    key: `card:${card.id}`,
    text: quoteName(card.name),
    symbols: ["card"],
    weight: 4,
    card,
  }));
}

function predicateTargets(ctx: JourneyContext): readonly SharedTarget[] {
  return PREDICATES
    .filter((predicate) => matchingCardCount(ctx, predicate) > 0)
    .map((predicate) => ({
      kind: "predicate_cards",
      key: `predicate:${predicate.id}`,
      text: predicate.text.plural,
      symbols: ["card"],
      weight: 2,
      predicate,
    }));
}

function starterTargets(ctx: JourneyContext): readonly SharedTarget[] {
  return starterCardCount(ctx) > 0
    ? [{
        kind: "chosen_starter",
        key: "starter:chosen",
        text: "a chosen Starter card",
        symbols: ["card"],
        weight: 2,
      }]
    : [];
}

function routeSiteTargets(): readonly SharedTarget[] {
  return JOURNEY_REWARDABLE_SITE_TYPES.map((siteType) => ({
    kind: "route_site",
    key: `route_site:${siteType}`,
    text: `${siteType} site`,
    symbols: ["route"],
    weight: 1,
    siteType,
  }));
}

function fixedTargets(): readonly SharedTarget[] {
  return [
    {
      kind: "shop_surface",
      key: "shop:surface",
      text: "the shop",
      symbols: ["shop"],
      weight: 1,
    },
    {
      kind: "player_resources",
      key: "resources:player",
      text: "your resources",
      symbols: ["resource"],
      weight: 1,
    },
  ];
}

function allTargets(ctx: JourneyContext): readonly SharedTarget[] {
  return [
    ...namedCardTargets(ctx),
    ...predicateTargets(ctx),
    ...starterTargets(ctx),
    ...routeSiteTargets(),
    ...fixedTargets(),
  ];
}

function countParams(draw: DrawContext, label: string, min: number, max: number): { count: number } {
  return { count: drawInt(draw, label, min, max) };
}

function predicateOf(target: SharedTarget): Predicate {
  if (!target.predicate) {
    throw new Error(`Expected predicate target for ${target.key}`);
  }
  return target.predicate;
}

function cardOf(target: SharedTarget): CardContent {
  if (!target.card) {
    throw new Error(`Expected card target for ${target.key}`);
  }
  return target.card;
}

const operations: readonly OperationTemplate[] = Object.freeze([
  {
    id: "gain_named_card",
    symbols: ["reward"],
    targetKinds: ["named_card"],
    weight: 1,
    rollParams: () => ({}),
    viable: () => true,
    cec: () => CARD_CEC * STAGE_MULTIPLIER,
    render: (_params, _ctx, target) => `Duplicate ${target.text}`,
  },
  {
    id: "apply_named_transfiguration_to_card_name",
    symbols: ["reward", "rewrite"],
    targetKinds: ["named_card"],
    weight: 1,
    rollParams: (_ctx, draw, target) => {
      const card = cardOf(target);
      const eligible = JOURNEY_TRANSFIGURATIONS.filter((transfiguration) =>
        isCardEligibleForTransfiguration(transfiguration, card)
      );
      return {
        transfiguration: pickFromList(
          draw,
          `otmo:${target.key}:named-transfiguration`,
          eligible.length > 0 ? eligible : JOURNEY_TRANSFIGURATIONS,
        ),
      };
    },
    viable: (_params, _ctx, target) =>
      JOURNEY_TRANSFIGURATIONS.some((transfiguration) =>
        isCardEligibleForTransfiguration(transfiguration, cardOf(target))
      ),
    cec: () => CARD_CEC * 0.8,
    render: (params, _ctx, target) =>
      `Apply ${String(params.transfiguration)} to ${target.text}`,
  },
  {
    id: "change_card_to_become_type",
    symbols: ["reward", "rewrite"],
    targetKinds: ["named_card"],
    weight: 1,
    rollParams: (_ctx, draw, target) => ({
      predicateId: pickFromList(draw, `otmo:${target.key}:card-type`, CARD_TYPE_PREDICATE_IDS),
    }),
    viable: () => true,
    cec: () => CARD_CEC * 0.6,
    render: (params, _ctx, target) => {
      const singular = getPredicate(String(params.predicateId)).text.singular;
      return `Change ${target.text} to become ${articleFor(singular)} ${singular}`;
    },
  },
  {
    id: "duplicate_named_card_X",
    symbols: ["reward", "card"],
    targetKinds: ["named_card"],
    weight: 1,
    rollParams: (_ctx, draw, target) => countParams(draw, `otmo:${target.key}:duplicate`, 1, 3),
    viable: () => true,
    cec: (params) => CARD_CEC * Number(params.count),
    render: (params, _ctx, target) =>
      `Create ${Number(params.count)} duplicate${Number(params.count) === 1 ? "" : "s"} of ${target.text}`,
  },
  {
    id: "make_card_reclaim",
    symbols: ["reward", "card"],
    targetKinds: ["named_card"],
    weight: 1,
    rollParams: (_ctx, draw, target) => countParams(draw, `otmo:${target.key}:reclaim`, 1, 3),
    viable: () => true,
    cec: (params) => CARD_CEC * 0.5 * Number(params.count),
    render: (params, _ctx, target) => `Add Reclaim ${Number(params.count)} to ${target.text}`,
  },
  {
    id: "opening_hand_grant_for_X_battles",
    symbols: ["reward", "card"],
    targetKinds: ["named_card"],
    weight: 1,
    rollParams: () => ({ battles: POSITIVE_TEMPORARY_BATTLES }),
    viable: () => true,
    cec: (params) => CARD_CEC * 0.3 * Number(params.battles),
    render: (params, _ctx, target) =>
      `Your opening hand contains ${target.text} for the next ${Number(params.battles)} battles`,
  },
  {
    id: "gain_random_predicate_cards",
    symbols: ["reward", "card"],
    targetKinds: ["predicate_cards"],
    weight: 1,
    rollParams: (_ctx, draw, target) => countParams(draw, `otmo:${target.key}:gain-random`, 1, 3),
    viable: (params, ctx, target) => {
      const predicate = predicateOf(target);
      return !CARD_ADDITION_EXCLUDED_PREDICATE_IDS.has(predicate.id) &&
        RANDOM_GAIN_PREDICATE_KINDS.includes(predicate.kind) &&
        matchingCardCount(ctx, predicate) >= Number(params.count);
    },
    cec: (params, _ctx, target) =>
      cardPoolCEC(CARD_CEC, Number(params.count), predicateOf(target)),
    render: (params, _ctx, target) => {
      const predicate = predicateOf(target);
      const noun = Number(params.count) === 1 ? predicate.text.singular : predicate.text.plural;
      return `Gain ${Number(params.count)} random ${noun}`;
    },
  },
  {
    id: "draft_predicate_cards_from_4",
    symbols: ["reward", "card"],
    targetKinds: ["predicate_cards"],
    weight: 1,
    rollParams: () => ({}),
    viable: (_params, ctx, target) =>
      !CARD_ADDITION_EXCLUDED_PREDICATE_IDS.has(predicateOf(target).id) &&
      matchingCardCount(ctx, predicateOf(target)) >= 4,
    cec: (_params, _ctx, target) =>
      cardPoolValue(predicateOf(target), CARD_CEC * 1.5, 1),
    render: (_params, _ctx, target) => `Draft 1 of 4 ${target.text}`,
  },
  {
    id: "draft_2_predicate_cards_from_4",
    symbols: ["reward", "card"],
    targetKinds: ["predicate_cards"],
    weight: 1,
    rollParams: () => ({}),
    viable: (_params, ctx, target) =>
      !CARD_ADDITION_EXCLUDED_PREDICATE_IDS.has(predicateOf(target).id) &&
      matchingCardCount(ctx, predicateOf(target)) >= 4,
    cec: (_params, _ctx, target) =>
      cardPoolValue(predicateOf(target), CARD_CEC * 1.4, 2),
    render: (_params, _ctx, target) => `Draft 2 of 4 ${target.text}`,
  },
  {
    id: "take_any_from_predicate_choices",
    symbols: ["reward", "card"],
    targetKinds: ["predicate_cards"],
    weight: 1,
    rollParams: (_ctx, draw, target) => ({ choices: drawInt(draw, `otmo:${target.key}:take-any`, 3, 5) }),
    viable: (params, ctx, target) =>
      !CARD_ADDITION_EXCLUDED_PREDICATE_IDS.has(predicateOf(target).id) &&
      RANDOM_GAIN_PREDICATE_KINDS.includes(predicateOf(target).kind) &&
      matchingCardCount(ctx, predicateOf(target)) >= Number(params.choices),
    cec: (params, _ctx, target) =>
      cardPoolCEC(CARD_CEC * 1.2, Number(params.choices) / 2, predicateOf(target)),
    render: (params, _ctx, target) =>
      `Take any number of ${target.text} from ${Number(params.choices)} choices`,
  },
  {
    id: "apply_named_transfiguration_to_chosen_predicate_cards",
    symbols: ["reward", "rewrite"],
    targetKinds: ["predicate_cards"],
    weight: 1,
    rollParams: (_ctx, draw, target) => ({
      count: drawInt(draw, `otmo:${target.key}:chosen-transfiguration-count`, 1, 3),
      transfiguration: pickFromList(
        draw,
        `otmo:${target.key}:chosen-transfiguration`,
        transfigurationsEligibleForPredicate(_ctx, predicateOf(target).cardPredicate ?? {}).length > 0
          ? transfigurationsEligibleForPredicate(_ctx, predicateOf(target).cardPredicate ?? {})
          : JOURNEY_TRANSFIGURATIONS,
      ),
    }),
    viable: (params, ctx, target) =>
      matchingCardCount(ctx, predicateOf(target)) >= Number(params.count) &&
      transfigurationsEligibleForPredicate(ctx, predicateOf(target).cardPredicate ?? {}).length > 0,
    cec: (params, _ctx, target) =>
      cardPoolCEC(CARD_CEC * 0.8, Number(params.count), predicateOf(target)),
    render: (params, _ctx, target) => {
      const predicate = predicateOf(target);
      const noun = Number(params.count) === 1 ? predicate.text.singular : predicate.text.plural;
      return `Apply ${String(params.transfiguration)} to ${Number(params.count)} chosen ${noun}`;
    },
  },
  {
    id: "apply_named_transfiguration_to_random_predicate_cards",
    symbols: ["reward", "rewrite"],
    targetKinds: ["predicate_cards"],
    weight: 1,
    rollParams: (_ctx, draw, target) => ({
      count: drawInt(draw, `otmo:${target.key}:random-transfiguration-count`, 1, 3),
      transfiguration: pickFromList(
        draw,
        `otmo:${target.key}:random-transfiguration`,
        transfigurationsEligibleForPredicate(_ctx, predicateOf(target).cardPredicate ?? {}).length > 0
          ? transfigurationsEligibleForPredicate(_ctx, predicateOf(target).cardPredicate ?? {})
          : JOURNEY_TRANSFIGURATIONS,
      ),
    }),
    viable: (params, ctx, target) =>
      matchingCardCount(ctx, predicateOf(target)) >= Number(params.count) &&
      transfigurationsEligibleForPredicate(ctx, predicateOf(target).cardPredicate ?? {}).length > 0,
    cec: (params, _ctx, target) =>
      cardPoolCEC(CARD_CEC * 0.6, Number(params.count), predicateOf(target)),
    render: (params, _ctx, target) => {
      const predicate = predicateOf(target);
      const noun = Number(params.count) === 1 ? predicate.text.singular : predicate.text.plural;
      return `Apply ${String(params.transfiguration)} to ${Number(params.count)} random ${noun}`;
    },
  },
  {
    id: "purge_chosen_predicate_cards",
    symbols: ["reward", "cleanup"],
    targetKinds: ["predicate_cards"],
    weight: 1,
    rollParams: (_ctx, draw, target) => countParams(draw, `otmo:${target.key}:purge`, 1, 3),
    viable: (_params, ctx, target) => matchingCardCount(ctx, predicateOf(target)) > 0,
    cec: (params, _ctx, target) =>
      cardPoolCEC(CARD_CEC * 0.3, Number(params.count), predicateOf(target)),
    render: (params, _ctx, target) => {
      const predicate = predicateOf(target);
      const noun = Number(params.count) === 1 ? predicate.text.singular : predicate.text.plural;
      return `Purge up to ${Number(params.count)} chosen ${noun}`;
    },
  },
  {
    id: "purge_chosen_predicate_with_replacement",
    symbols: ["reward", "cleanup"],
    targetKinds: ["predicate_cards"],
    weight: 1,
    rollParams: (_ctx, draw, target) => countParams(draw, `otmo:${target.key}:purge-replace`, 1, 2),
    viable: (_params, ctx, target) => matchingCardCount(ctx, predicateOf(target)) > 0,
    cec: (params, _ctx, target) =>
      cardPoolCEC(CARD_CEC * 0.6, Number(params.count), predicateOf(target)),
    render: (params, _ctx, target) => {
      const predicate = predicateOf(target);
      if (Number(params.count) === 1) {
        return `Transform a chosen ${predicate.text.singular} into a random ${predicate.text.singular}`;
      }
      return `Transform up to ${Number(params.count)} chosen ${predicate.text.plural} into random ${predicate.text.plural}`;
    },
  },
  {
    id: "duplicate_random_predicate",
    symbols: ["reward", "card"],
    targetKinds: ["predicate_cards"],
    weight: 1,
    rollParams: (_ctx, draw, target) => countParams(draw, `otmo:${target.key}:duplicate-random`, 1, 3),
    viable: (params, ctx, target) =>
      !CARD_ADDITION_EXCLUDED_PREDICATE_IDS.has(predicateOf(target).id) &&
      RANDOM_GAIN_PREDICATE_KINDS.includes(predicateOf(target).kind) &&
      matchingCardCount(ctx, predicateOf(target)) >= Number(params.count),
    cec: (params, _ctx, target) =>
      cardPoolCEC(CARD_CEC * 0.9, Number(params.count), predicateOf(target)),
    render: (params, _ctx, target) => {
      const predicate = predicateOf(target);
      const noun = Number(params.count) === 1 ? predicate.text.singular : predicate.text.plural;
      return `Duplicate ${Number(params.count)} random ${noun}`;
    },
  },
  {
    id: "card_cost_reduction_for_X_battles",
    symbols: ["reward", "card"],
    targetKinds: ["predicate_cards"],
    weight: 1,
    rollParams: (_ctx, draw, target) => ({
      reduction: drawInt(draw, `otmo:${target.key}:cost-reduction`, 1, 2),
      battles: POSITIVE_TEMPORARY_BATTLES,
    }),
    viable: (_params, ctx, target) => matchingCardCount(ctx, predicateOf(target)) > 0,
    cec: (params, _ctx, target) =>
      cardPoolCEC(CARD_CEC * 0.2 * Number(params.reduction), Number(params.battles), predicateOf(target)),
    render: (params, _ctx, target) =>
      `${target.text} cost ${Number(params.reduction)} less for the next ${Number(params.battles)} battles`,
  },
  {
    id: "transform_starter_into_named_card",
    symbols: ["reward", "rewrite"],
    targetKinds: ["chosen_starter"],
    weight: 1,
    rollParams: (ctx, draw, target) => ({
      cardName: pickFromList(draw, `otmo:${target.key}:starter-replacement`, ctx.content.cards).name,
    }),
    viable: (_params, ctx) => starterCardCount(ctx) > 0 && ctx.content.cards.length > 0,
    cec: () => CARD_CEC * 0.8,
    render: (params) => `Transform it into ${quoteName(String(params.cardName))}`,
  },
  {
    id: "transfigure_chosen_starters",
    symbols: ["reward", "rewrite"],
    targetKinds: ["chosen_starter"],
    weight: 1,
    rollParams: (_ctx, draw, target) => countParams(draw, `otmo:${target.key}:starter-transfigure`, 1, 2),
    viable: (_params, ctx) => starterCardCount(ctx) > 0,
    cec: (params) => CARD_CEC * 0.45 * Number(params.count),
    render: (params) =>
      `Apply random transfigurations to ${Number(params.count)} chosen Starter card${Number(params.count) === 1 ? "" : "s"}`,
  },
  {
    id: "purge_chosen_starters",
    symbols: ["reward", "cleanup"],
    targetKinds: ["chosen_starter"],
    weight: 1,
    rollParams: (_ctx, draw, target) => countParams(draw, `otmo:${target.key}:starter-purge`, 1, 3),
    viable: (_params, ctx) => starterCardCount(ctx) > 0,
    cec: (params) => CARD_CEC * 0.4 * Number(params.count),
    render: (params) =>
      `Purge up to ${Number(params.count)} chosen Starter card${Number(params.count) === 1 ? "" : "s"}`,
  },
  {
    id: "replace_starter_via_draft",
    symbols: ["reward", "card"],
    targetKinds: ["chosen_starter"],
    weight: 1,
    rollParams: () => ({}),
    viable: (_params, ctx) => starterCardCount(ctx) > 0 && ctx.content.cards.length >= 4,
    cec: () => CARD_CEC * 0.9,
    render: () => "Replace it with 1 of 4 drafted cards",
  },
  {
    id: "add_site_to_dreamscape",
    symbols: ["reward", "route"],
    targetKinds: ["route_site"],
    weight: 1,
    rollParams: () => ({}),
    viable: () => true,
    cec: () => 100,
    render: (_params, _ctx, target) => `Add a ${target.text} to this dreamscape`,
  },
  {
    id: "add_site_to_next_dreamscape",
    symbols: ["reward", "route"],
    targetKinds: ["route_site"],
    weight: 1,
    rollParams: () => ({}),
    viable: () => true,
    cec: () => 75,
    render: (_params, _ctx, target) => `Add a ${target.text} to the next dreamscape you visit`,
  },
  {
    id: "replace_site_type",
    symbols: ["reward", "route"],
    targetKinds: ["route_site"],
    weight: 1,
    rollParams: (_ctx, draw, target) => ({
      replacementSiteType: pickFromList(
        draw,
        `otmo:${target.key}:replace-site`,
        JOURNEY_REWARDABLE_SITE_TYPES.filter((siteType) => siteType !== target.siteType),
      ),
    }),
    viable: (_params, _ctx, target) =>
      target.siteType !== undefined && JOURNEY_REPLACEABLE_SITE_TYPES.includes(target.siteType),
    cec: () => 65,
    render: (params, _ctx, target) =>
      `Replace a ${target.text} in this dreamscape with a ${String(params.replacementSiteType)} site`,
  },
  {
    id: "boost_site_appearance_chance",
    symbols: ["reward", "route"],
    targetKinds: ["route_site"],
    weight: 1,
    rollParams: (_ctx, draw, target) => ({
      percent: 10 + 10 * drawInt(draw, `otmo:${target.key}:boost-site`, 0, 4),
    }),
    viable: () => true,
    cec: (params) => 75 + (Number(params.percent) - 20) * 2.5,
    render: (params, _ctx, target) =>
      `${Number(params.percent)}% higher chance to see ${target.text}s in future dreamscapes`,
  },
  {
    id: "next_X_shop_rerolls_free",
    symbols: ["reward", "shop"],
    targetKinds: ["shop_surface"],
    weight: 1,
    rollParams: (_ctx, draw, target) => countParams(draw, `otmo:${target.key}:rerolls`, 1, 3),
    viable: () => true,
    cec: (params) => 20 * Number(params.count),
    render: (params) => `The next ${Number(params.count)} shop reroll${Number(params.count) === 1 ? " is" : "s are"} free`,
  },
  {
    id: "shop_essence_discount",
    symbols: ["reward", "shop"],
    targetKinds: ["shop_surface"],
    weight: 1,
    rollParams: (_ctx, draw, target) => ({
      percent: 10 + 5 * drawInt(draw, `otmo:${target.key}:essence-discount`, 0, 6),
    }),
    viable: () => true,
    cec: (params) => 75 + Number(params.percent),
    render: (params) => `Permanently reduce shop essence costs by ${Number(params.percent)}%`,
  },
  {
    id: "shop_omen_discount",
    symbols: ["reward", "shop"],
    targetKinds: ["shop_surface"],
    weight: 1,
    rollParams: (_ctx, draw, target) => countParams(draw, `otmo:${target.key}:omen-discount`, 1, 3),
    viable: () => true,
    cec: (params) => 35 * Number(params.count),
    render: (params) =>
      `The next ${Number(params.count)} shop purchase${Number(params.count) === 1 ? "" : "s"} cost 1 fewer omen`,
  },
  {
    id: "gain_essence",
    symbols: ["reward", "resource"],
    targetKinds: ["player_resources"],
    weight: 1,
    rollParams: (_ctx, draw, target) => ({
      amount: 50 + 5 * drawInt(draw, `otmo:${target.key}:gain-essence`, 0, 30),
    }),
    viable: () => true,
    cec: (params) => Number(params.amount) * STAGE_MULTIPLIER,
    render: (params) => `Gain ${Number(params.amount)} essence`,
  },
  {
    id: "gain_omens",
    symbols: ["reward", "resource"],
    targetKinds: ["player_resources"],
    weight: 1,
    rollParams: (_ctx, draw, target) => ({
      amount: drawInt(draw, `otmo:${target.key}:gain-omens`, 1, 3),
    }),
    viable: () => true,
    cec: (params) => Number(params.amount) * 40 * STAGE_MULTIPLIER,
    render: (params) => `Gain ${Number(params.amount)} omen${Number(params.amount) === 1 ? "" : "s"}`,
  },
  {
    id: "set_essence_to_percent_of_max",
    symbols: ["reward", "resource"],
    targetKinds: ["player_resources"],
    weight: 1,
    rollParams: (_ctx, draw, target) => {
      const choices = [50, 75, 125];
      return {
        percent: choices[drawInt(draw, `otmo:${target.key}:essence-percent`, 0, choices.length - 1)]!,
      };
    },
    viable: (params, ctx) =>
      (maxEssence(ctx) * Number(params.percent)) / 100 > essenceAmount(ctx),
    cec: (params, ctx) =>
      Math.max(0, (maxEssence(ctx) * Number(params.percent)) / 100 - essenceAmount(ctx)) * STAGE_MULTIPLIER,
    render: (params) => `Set essence to ${Number(params.percent)}% of your maximum essence`,
  },
  {
    id: "gain_essence_random_range",
    symbols: ["reward", "resource"],
    targetKinds: ["player_resources"],
    weight: 1,
    rollParams: (_ctx, draw, target) => {
      const minimum = 30 + 10 * drawInt(draw, `otmo:${target.key}:range-base`, 0, 12);
      const spread = 30 + 10 * drawInt(draw, `otmo:${target.key}:range-spread`, 0, 6);
      return { minimum, maximum: minimum + spread };
    },
    viable: () => true,
    cec: (params) => ((Number(params.minimum) + Number(params.maximum)) / 2) * STAGE_MULTIPLIER,
    render: (params) => `Gain ${Number(params.minimum)}-${Number(params.maximum)} essence`,
  },
  {
    id: "gain_essence_to_max",
    symbols: ["reward", "resource"],
    targetKinds: ["player_resources"],
    weight: 1,
    rollParams: () => ({}),
    viable: (_params, ctx) => maxEssence(ctx) > essenceAmount(ctx),
    cec: (_params, ctx) => Math.max(0, maxEssence(ctx) - essenceAmount(ctx)) * STAGE_MULTIPLIER,
    render: () => "Gain essence up to your maximum",
  },
  {
    id: "increase_max_essence",
    symbols: ["reward", "resource"],
    targetKinds: ["player_resources"],
    weight: 1,
    rollParams: (_ctx, draw, target) => ({
      amount: 5 + 5 * drawInt(draw, `otmo:${target.key}:max-essence`, 0, 5),
    }),
    viable: () => true,
    cec: (params) => Number(params.amount) * 4,
    render: (params) => `Increase maximum essence by ${Number(params.amount)}`,
  },
]);

function rolledOperationsFor(
  args: ShapeFillArgs,
  target: SharedTarget,
): readonly RolledOperation[] {
  return operations.flatMap((template): readonly RolledOperation[] => {
    if (!template.targetKinds.includes(target.kind)) {
      return [];
    }

    const params = template.rollParams(args.context, args.drawContext, target);
    if (!template.viable(params, args.context, target)) {
      return [];
    }

    const cec = template.cec(params, args.context, target);
    return cec > 0 ? [{ template, params, cec }] : [];
  });
}

function targetCandidates(args: ShapeFillArgs): readonly TargetCandidate[] {
  return allTargets(args.context).flatMap((target): readonly TargetCandidate[] => {
    const targetOperations = rolledOperationsFor(args, target);
    return targetOperations.length >= 3
      ? [{ target, operations: targetOperations }]
      : [];
  });
}

export function oneTargetManyOperationsFill(args: ShapeFillArgs): FilledJourney {
  const candidates = targetCandidates(args);

  if (candidates.length === 0) {
    throw new Error("one_target_many_operations fill could not find a target with at least three operations");
  }

  const selected = weightedChoice(
    args.drawContext,
    "otmo:target",
    candidates.map((candidate) => ({
      item: candidate,
      weight: candidate.target.weight * Math.min(candidate.operations.length, 6),
    })),
  );
  const selectedOperations = shuffleDeterministic(
    args.drawContext,
    `otmo:operations:${selected.target.key}`,
    selected.operations,
  ).slice(0, 3);

  return {
    options: selectedOperations.map((operation, index) =>
      optionFor(index + 1, selected.target, operation, args.context)
    ),
    precommitted: {},
    symmetryContracts: [symmetryContract(selected.target, selectedOperations)],
  };
}
