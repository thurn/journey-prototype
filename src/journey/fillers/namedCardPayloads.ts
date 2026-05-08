import type { CardContent } from "../../content/model.js";
import type { JourneyContext } from "../../quest/context.js";
import {
  drawInt,
  shuffleDeterministic,
  type DrawContext,
} from "../../util/rng.js";
import { resolveCardTargets } from "../effects.js";
import type { JourneyOption } from "../manifest.js";
import {
  CARD_MODIFICATION_VALUE_CONSTANTS,
  CARD_VALUE_CONSTANTS,
  PURGE_VALUE_CONSTANTS,
  TRANSFIGURATION_VALUE_CONSTANTS,
} from "../value.js";
import {
  BATTLE_WINDOW_DURATION,
  CARD_DRAFT_CHOICE_COUNT,
  gainOmen,
  option,
  selectedCardTargets,
  target,
} from "./shared.js";

export function cardQualityValue(card: CardContent): number {
  const rarityValue =
    card.rarity === "Rare"
      ? CARD_VALUE_CONSTANTS.namedVisibleByRarity.rare
      : card.rarity === "Uncommon"
        ? CARD_VALUE_CONSTANTS.namedVisibleByRarity.uncommon
        : card.rarity === "Starter"
          ? PURGE_VALUE_CONSTANTS.chosenStarter
          : CARD_VALUE_CONSTANTS.namedVisibleByRarity.common;
  const fastBonus =
    card.raw["is-fast"] === true || card.raw.isFast === true ? 10 : 0;
  const sparkBonus =
    typeof card.spark === "number" ? Math.min(20, card.spark * 3) : 0;

  return rarityValue + fastBonus + sparkBonus;
}

export function sourcePoolSizeForCardSource(
  context: JourneyContext,
  source: "catalog" | "deck" | "draftPool",
): number {
  switch (source) {
    case "deck":
      return context.state.quest.deck.summary.uniqueCards;
    case "draftPool":
      return context.state.quest.draftPoolSummary.uniqueCards;
    case "catalog":
      return context.content.cards.length;
  }
}

export function starterDeckCards(context: JourneyContext): CardContent[] {
  return resolveCardTargets(context.content, context.state.quest, {
    source: "deck",
    starter: true,
  });
}

export function catalogRewardCards(
  context: JourneyContext,
  drawContext: DrawContext,
): CardContent[] {
  const selectedDraftCards = selectedCardTargets(context, drawContext);
  const fallback = shuffleDeterministic(
    drawContext,
    "named-card-operation-menu:catalog-fallback",
    context.content.cards.filter((card) => card.rarity !== "Starter"),
  );

  return [...selectedDraftCards, ...fallback].filter(
    (card, index, cards) =>
      cards.findIndex((entry) => entry.id === card.id) === index,
  );
}

export function namedCardPayload(
  args: {
    kind: string;
    target?: CardContent;
    result?: CardContent;
    secondTarget?: CardContent;
    source?: "catalog" | "deck" | "draftPool";
    extra?: Record<string, unknown>;
  },
  context: JourneyContext,
): Record<string, unknown> {
  const source = args.source ?? (args.target ? "deck" : "catalog");

  return {
    kind: args.kind,
    cardOperationKind: args.kind.replace(/^card_/u, ""),
    source,
    sourcePoolSize: sourcePoolSizeForCardSource(context, source),
    timing: "immediate",
    ...(args.target
      ? {
          targetCardId: args.target.id,
          targetCardName: args.target.name,
        }
      : {}),
    ...(args.result
      ? {
          resultCardId: args.result.id,
          resultCardName: args.result.name,
          ...(!args.target
            ? {
                cardId: args.result.id,
                cardName: args.result.name,
              }
            : {}),
        }
      : {}),
    ...(args.secondTarget
      ? {
          secondTargetCardId: args.secondTarget.id,
          secondTargetCardName: args.secondTarget.name,
        }
      : {}),
    ...(args.extra ?? {}),
  };
}

export function namedCardOperationOptions(
  context: JourneyContext,
  drawContext: DrawContext,
): JourneyOption[] {
  const deckTargets = starterDeckCards(context);
  const rewardCards = catalogRewardCards(context, drawContext);
  const targetA = deckTargets[0]!;
  const targetB = deckTargets[1] ?? targetA;
  const targetC = deckTargets[2] ?? targetA;
  const targetD = deckTargets[3] ?? targetA;
  const resultA = rewardCards[0] ?? targetA;
  const resultB = rewardCards[1] ?? resultA;
  const resultC = rewardCards[2] ?? resultA;
  const rewardSource: "catalog" | "draftPool" =
    context.state.quest.draftPool.some((entry) => entry.cardId === resultA.id)
      ? "draftPool"
      : "catalog";
  const operationSpecs = [
    {
      key: "gain",
      text: `Gain {${resultA.name}}.`,
      effect: namedCardPayload(
        { kind: "card_gain", result: resultA, source: rewardSource },
        context,
      ),
      value: cardQualityValue(resultA),
    },
    {
      key: "purge",
      text: `Purge {${targetA.name}} from your deck.`,
      effect: namedCardPayload(
        { kind: "card_purge", target: targetA },
        context,
      ),
      value: Math.round(PURGE_VALUE_CONSTANTS.chosenStarter * 1.2),
    },
    {
      key: "duplicate",
      text: `Add 2 copies of {${targetB.name}} to your deck.`,
      effect: namedCardPayload(
        { kind: "card_duplicate", target: targetB, extra: { copyCount: 2 } },
        context,
      ),
      value: CARD_MODIFICATION_VALUE_CONSTANTS.duplicateChosen,
    },
    {
      key: "transform",
      text: `Transform {${targetC.name}} into {${resultB.name}}.`,
      effect: namedCardPayload(
        { kind: "card_transform", target: targetC, result: resultB },
        context,
      ),
      value: 135,
    },
    {
      key: "replace",
      text: `Replace {${targetD.name}} with {${resultC.name}}.`,
      effect: namedCardPayload(
        { kind: "card_replace", target: targetD, result: resultC },
        context,
      ),
      value: 140,
    },
    {
      key: "transfigure",
      text: `Apply {Viridian Transfiguration} to {${targetA.name}}.`,
      effect: namedCardPayload(
        {
          kind: "card_transfigure",
          target: targetA,
          extra: { transfigurationName: "Viridian" },
        },
        context,
      ),
      value: TRANSFIGURATION_VALUE_CONSTANTS.standardByType.Viridian,
    },
    {
      key: "text",
      text: `Add "Foresee 1" to {${targetB.name}}.`,
      effect: namedCardPayload(
        {
          kind: "card_text_modification",
          target: targetB,
          extra: { textModification: "Add Foresee 1" },
        },
        context,
      ),
      value: CARD_MODIFICATION_VALUE_CONSTANTS.lowerCostOrAddFastOrReclaim,
    },
    {
      key: "type",
      text: `Make {${targetC.name}} an Event card.`,
      effect: namedCardPayload(
        {
          kind: "card_type_change",
          target: targetC,
          extra: { newCardType: "Event" },
        },
        context,
      ),
      value: 105,
    },
    {
      key: "keyword-add",
      text: `Add Fast to {${targetD.name}}.`,
      effect: namedCardPayload(
        {
          kind: "card_keyword_add",
          target: targetD,
          extra: { keyword: "Fast" },
        },
        context,
      ),
      value: CARD_MODIFICATION_VALUE_CONSTANTS.lowerCostOrAddFastOrReclaim,
    },
    {
      key: "keyword-remove",
      text: `Remove Dissolve from {${targetA.name}}.`,
      effect: namedCardPayload(
        {
          kind: "card_keyword_remove",
          target: targetA,
          extra: { keyword: "Dissolve" },
        },
        context,
      ),
      value: 95,
    },
    {
      key: "opening-hand",
      text: `{${targetB.name}} appears in your opening hand for the next 3 battles.`,
      effect: namedCardPayload(
        {
          kind: "card_opening_hand",
          target: targetB,
          extra: { duration: BATTLE_WINDOW_DURATION },
        },
        context,
      ),
      value: 105,
      uncertainty: -10,
    },
    {
      key: "merge",
      text: `Merge {${targetA.name}} and {${targetB.name}} into one card.`,
      effect: namedCardPayload(
        {
          kind: "card_merge",
          target: targetA,
          secondTarget: targetB,
        },
        context,
      ),
      value: CARD_MODIFICATION_VALUE_CONSTANTS.mergeOrSplitExistingCards,
    },
    {
      key: "split",
      text: `Split {${targetC.name}} into two focused cards.`,
      effect: namedCardPayload(
        { kind: "card_split", target: targetC },
        context,
      ),
      value: CARD_MODIFICATION_VALUE_CONSTANTS.mergeOrSplitExistingCards,
    },
    {
      key: "temporary-copy",
      text: `Create a temporary copy of {${targetD.name}} for the next 3 battles.`,
      effect: namedCardPayload(
        {
          kind: "card_temporary_copy",
          target: targetD,
          extra: {
            duration: BATTLE_WINDOW_DURATION,
            copyCount: 1,
            temporary: true,
          },
        },
        context,
      ),
      value: 110,
      uncertainty: -10,
    },
    {
      key: "delayed-transformation",
      text: `After next victory, transform {${targetA.name}} into {${resultA.name}}.`,
      effect: namedCardPayload(
        {
          kind: "card_delayed_transformation",
          target: targetA,
          result: resultA,
          extra: {
            timing: "after next victory",
            trigger: "after next victory",
          },
        },
        context,
      ),
      value: 120,
      uncertainty: -8,
    },
  ];
  const start = drawInt(
    drawContext,
    "named-card-operation-menu:start",
    0,
    operationSpecs.length - 1,
  );
  const ordered = operationSpecs.map(
    (_, index) => operationSpecs[(start + index) % operationSpecs.length]!,
  );

  return ordered.slice(0, 4).map((entry, index) =>
    option({
      number: index + 1,
      text: entry.text,
      effects: [entry.effect],
      targets: entry.effect.targetCardName
        ? [
            target("card", `${entry.effect.targetCardName} in deck`, {
              source: "deck",
              ids: [entry.effect.targetCardId],
              names: [entry.effect.targetCardName],
            }),
          ]
        : [
            target(
              "card",
              `${entry.effect.resultCardName} in ${entry.effect.source}`,
              {
                source: entry.effect.source,
                ids: [entry.effect.resultCardId],
                names: [entry.effect.resultCardName],
              },
            ),
          ],
      effect: Math.max(135, Math.min(155, entry.value)),
      uncertainty: entry.uncertainty,
    }),
  );
}

export function starterCleanupReplacementOptions(
  context: JourneyContext,
  drawContext: DrawContext,
): JourneyOption[] {
  const starters = starterDeckCards(context);
  const replacements = catalogRewardCards(context, drawContext);
  const firstStarter = starters[0]!;
  const secondStarter = starters[1] ?? firstStarter;
  const thirdStarter = starters[2] ?? firstStarter;
  const firstReplacement = replacements[0] ?? firstStarter;
  const secondReplacement = replacements[1] ?? firstReplacement;
  const cleanup = namedCardPayload(
    {
      kind: "starter_cleanup",
      target: firstStarter,
      extra: { count: 1, cleanupMode: "purge" },
    },
    context,
  );
  const draftReplacement = namedCardPayload(
    {
      kind: "starter_replacement",
      target: secondStarter,
      extra: {
        replacementMode: "draft",
        takeCount: 1,
        choiceCount: CARD_DRAFT_CHOICE_COUNT,
        predicate: { source: "draftPool", maxEnergyCost: 2 },
      },
    },
    context,
  );
  const namedReplacement = namedCardPayload(
    {
      kind: "starter_replacement",
      target: thirdStarter,
      result: secondReplacement,
      extra: {
        replacementMode: "named",
      },
    },
    context,
  );
  const options = [
    {
      text: `Purge {${firstStarter.name}}. Gain 2 omens.`,
      effect: cleanup,
      value: 150,
    },
    {
      text: `Purge {${secondStarter.name}}. Draft 1 of 4 low-cost replacement cards.`,
      effect: draftReplacement,
      value: 150,
    },
    {
      text: `Replace {${thirdStarter.name}} with {${secondReplacement.name}}.`,
      effect: namedReplacement,
      value: 145,
    },
  ];

  return shuffleDeterministic(
    drawContext,
    "starter-cleanup-replacement:order",
    options,
  ).map((entry, index) =>
    option({
      number: index + 1,
      text: entry.text,
      effects:
        entry.effect.kind === "starter_cleanup"
          ? [entry.effect, gainOmen(2)]
          : [entry.effect],
      targets: [
        target("card", `${entry.effect.targetCardName} in starter deck`, {
          source: "deck",
          starter: true,
          ids: [entry.effect.targetCardId],
          names: [entry.effect.targetCardName],
        }),
      ],
      effect: entry.value,
    }),
  );
}
