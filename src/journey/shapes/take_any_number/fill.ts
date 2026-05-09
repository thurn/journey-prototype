import {
  CARD_DRAFT_PROFILES,
  cardDraftText,
  costSlots,
  draftCards,
  option,
  pickLegalCardDraftProfile,
  randomCardGain,
  randomCardGainText,
  rewardSlots,
  target,
} from "../../fillers/shared.js";
import { valueCardDraft, valueRandomCardGain } from "../../value.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_LABEL = "take_any_number";

export function takeAnyNumberFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext } = args;
  const fallbackRewards = rewardSlots(
    context,
    drawContext,
    `${SHAPE_LABEL}:cache-rewards`,
  ).filter((reward) => reward.routeEffects === undefined);
  const draftProfile = pickLegalCardDraftProfile(
    context,
    drawContext,
    `${SHAPE_LABEL}:predicate-draft`,
    [
      CARD_DRAFT_PROFILES.discardTextCards,
      CARD_DRAFT_PROFILES.eventCopyingCards,
      CARD_DRAFT_PROFILES.energyGenerationCards,
      CARD_DRAFT_PROFILES.multiAbilityCards,
    ],
  );
  const cardDraft = draftCards(draftProfile);
  const randomGain = randomCardGain(CARD_DRAFT_PROFILES.events, 2);
  const rewards = [
    {
      key: `predicate-draft:${draftProfile.label}`,
      text: cardDraftText(draftProfile),
      effects: [cardDraft],
      targets: [
        target("card", draftProfile.targetDescription, cardDraft.predicate),
      ],
      effect: Math.max(320, valueCardDraft(cardDraft)),
    },
    {
      key: "random-event-card-gain",
      text: randomCardGainText(CARD_DRAFT_PROFILES.events, 2),
      effects: [randomGain],
      targets: [
        target(
          "card",
          CARD_DRAFT_PROFILES.events.targetDescription,
          randomGain.predicate,
        ),
      ],
      effect: Math.max(320, valueRandomCardGain(randomGain)),
      uncertainty: -10,
    },
    ...fallbackRewards,
  ];
  const costSlot = costSlots(
    context,
    drawContext,
    `${SHAPE_LABEL}:cache-costs`,
  ).find((entry) => entry.costs && entry.costs.length > 0)!;
  const burdenSlot = costSlots(
    context,
    drawContext,
    `${SHAPE_LABEL}:cache-burdens`,
  ).find((entry) => entry.burdens && entry.burdens.length > 0)!;

  return {
    options: [
      option({
        number: 1,
        text: `Take up to 2 rewards from this cache. ${costSlot.prefix} ${rewards[0]!.text}`,
        costs: costSlot.costs ?? [],
        effects: rewards[0]!.effects,
        targets: rewards[0]!.targets ?? [],
        cost: costSlot.cost,
        effect: rewards[0]!.effect,
        uncertainty: rewards[0]!.uncertainty,
      }),
      option({
        number: 2,
        text: `Take up to 2 rewards from this cache. ${burdenSlot.prefix} ${(rewards[1] ?? rewards[0])!.text}`,
        burdens: burdenSlot.burdens ?? [],
        effects: (rewards[1] ?? rewards[0])!.effects,
        targets: (rewards[1] ?? rewards[0])!.targets ?? [],
        burden: burdenSlot.burden,
        effect: (rewards[1] ?? rewards[0])!.effect,
        uncertainty: (rewards[1] ?? rewards[0])!.uncertainty,
      }),
      option({
        number: 3,
        text: "Leave the cache.",
        pickBehavior: "leave",
      }),
    ],
    precommitted: {},
  };
}
