import type { JourneyContext } from "../../../quest/context.js";
import type { DrawContext } from "../../../util/rng.js";
import {
  CARD_DRAFT_PROFILES,
  DREAMSIGN_POOL_TARGET_DESCRIPTION,
  cardDraftText,
  draftCards,
  dreamsignDraft,
  dreamsignDraftText,
  gainEssence,
  gainOmen,
  option,
  pickLegalCardDraftProfile,
  pickSequentialVariant,
  stageFromContext,
  starterCleanup,
  target,
} from "../../fillers/shared.js";
import type { JourneyOption, JourneyStage } from "../../manifest.js";
import {
  commonEssenceRewardAmount,
  valueCardDraft,
  valueDreamsignDraft,
  valueEssenceGain,
  valueOmenGain,
  valueStarterCleanup,
} from "../../value.js";

const COMMON_POSITIVE_FALLBACK_ESSENCE_AMOUNTS = {
  early: [300, 330],
  mid: [320, 350],
  late: [340, 370],
} as const satisfies Record<JourneyStage, readonly number[]>;

export function commonPositiveOptions(
  context: JourneyContext,
  drawContext: DrawContext,
  label: string,
): JourneyOption[] {
  const essenceAmount = pickSequentialVariant(
    drawContext,
    `${label}:essence-amount`,
    [330, 350, commonEssenceRewardAmount(context)],
  );
  const cardDraftProfile = pickLegalCardDraftProfile(
    context,
    drawContext,
    `${label}:card-profile`,
    [
      CARD_DRAFT_PROFILES.characters,
      CARD_DRAFT_PROFILES.events,
      CARD_DRAFT_PROFILES.lowCostCharacters,
      CARD_DRAFT_PROFILES.reclaimEvents,
      CARD_DRAFT_PROFILES.dissolveEvents,
      CARD_DRAFT_PROFILES.discardTextCards,
      CARD_DRAFT_PROFILES.abandonCards,
      CARD_DRAFT_PROFILES.eventCopyingCards,
      CARD_DRAFT_PROFILES.energyGenerationCards,
      CARD_DRAFT_PROFILES.duplicateCards,
      CARD_DRAFT_PROFILES.multiAbilityCards,
    ],
  );
  const cardDraft = draftCards(cardDraftProfile);
  const dreamsignChoiceCount = pickSequentialVariant(
    drawContext,
    `${label}:dreamsign-choice-count`,
    [2, 3],
  );
  const dreamsignChoice = dreamsignDraft(dreamsignChoiceCount);
  const fallbackEssenceAmount = pickSequentialVariant(
    drawContext,
    `${label}:fallback-essence`,
    COMMON_POSITIVE_FALLBACK_ESSENCE_AMOUNTS[stageFromContext(context)],
  );
  const fallbackReward =
    context.state.quest.deck.summary.starterCards > 0
      ? option({
          number: 3,
          text: "Purge up to 1 chosen Starter card. Gain 4 omens.",
          effects: [starterCleanup(1), gainOmen(4)],
          targets: [
            target("card", "Starter cards in deck", {
              source: "deck",
              starter: true,
            }),
          ],
          effect:
            valueStarterCleanup({ count: 1, stage: stageFromContext(context) }) +
            valueOmenGain(4),
        })
      : option({
          number: 3,
          text: `Gain ${fallbackEssenceAmount} essence.`,
          effects: [gainEssence(fallbackEssenceAmount)],
          effect: valueEssenceGain(fallbackEssenceAmount, context),
        });
  const resourceOptions = [
    option({
      number: 1,
      text: `Gain ${essenceAmount} essence.`,
      effects: [gainEssence(essenceAmount)],
      effect: valueEssenceGain(essenceAmount, context),
    }),
    option({
      number: 1,
      text: "Gain 5 omens.",
      effects: [gainOmen(5)],
      effect: valueOmenGain(5),
    }),
  ];
  const resourceOption = pickSequentialVariant(
    drawContext,
    `${label}:resource-kind`,
    resourceOptions,
  );

  return [
    resourceOption,
    option({
      number: 2,
      text: `${cardDraftText(cardDraftProfile)} Gain 4 omens.`,
      effects: [cardDraft, gainOmen(4)],
      targets: [
        target("card", cardDraftProfile.targetDescription, cardDraft.predicate),
      ],
      effect: valueCardDraft(cardDraft) + valueOmenGain(4),
    }),
    context.state.quest.dreamsignPoolIds.length > 0
      ? option({
          number: 3,
          text: dreamsignDraftText(dreamsignChoiceCount),
          effects: [dreamsignChoice],
          targets: [
            target(
              "dreamsign",
              DREAMSIGN_POOL_TARGET_DESCRIPTION,
              dreamsignChoice.predicate,
            ),
          ],
          effect: valueDreamsignDraft(dreamsignChoice, context),
        })
      : fallbackReward,
  ];
}
