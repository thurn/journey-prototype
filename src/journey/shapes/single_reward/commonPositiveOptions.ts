import type { JourneyContext } from "../../../quest/context.js";
import type { DrawContext } from "../../../util/rng.js";
import {
  gainEssence,
  gainOmen,
  option,
  pickSequentialVariant,
  stageFromContext,
} from "../../fillers/shared.js";
import {
  cardExactTarget,
  cardQualityValue,
  namedCardPayload,
  selectContentBackedCard,
} from "../../fillers/namedCardPayloads.js";
import {
  dreamsignExactTarget,
  namedDreamsignPayload,
  selectContentBackedDreamsign,
} from "../../fillers/dreamsignPayloads.js";
import type { JourneyOption, JourneyStage } from "../../manifest.js";
import {
  CARD_VALUE_CONSTANTS,
  DREAMSIGN_VALUE_CONSTANTS,
  valueEssenceGain,
  valueOmenGain,
} from "../../value.js";

const ESSENCE_REWARD_AMOUNTS = {
  early: [180, 220, 260],
  mid: [320, 360, 400],
  late: [480, 540, 600],
} as const satisfies Record<JourneyStage, readonly number[]>;

const OMEN_REWARD_AMOUNTS = {
  early: [2, 3],
  mid: [4, 5],
  late: [6, 7],
} as const satisfies Record<JourneyStage, readonly number[]>;

export function commonPositiveOptions(
  context: JourneyContext,
  drawContext: DrawContext,
  label: string,
  stageOverride?: JourneyStage,
): JourneyOption[] {
  const stage = stageOverride ?? stageFromContext(context);
  const essenceAmount = pickSequentialVariant(
    drawContext,
    `${label}:essence-amount`,
    ESSENCE_REWARD_AMOUNTS[stage],
  );
  const omenAmount = pickSequentialVariant(
    drawContext,
    `${label}:omen-amount`,
    OMEN_REWARD_AMOUNTS[stage],
  );
  const namedCard = selectContentBackedCard({
    context,
    drawContext,
    label: `${label}:named-card`,
    stage,
    sources: stage === "early" ? ["draftPool"] : ["draftPool", "catalog"],
  });
  const namedDreamsign = selectContentBackedDreamsign({
    context,
    drawContext,
    label: `${label}:named-dreamsign`,
    stage,
    sources: context.state.quest.dreamsignPoolIds.length > 0
      ? ["pool", "catalog"]
      : ["catalog"],
  });
  const options: JourneyOption[] = [
    option({
      number: 1,
      text: `Gain ${essenceAmount} essence.`,
      effects: [gainEssence(essenceAmount)],
      effect: valueEssenceGain(essenceAmount, context),
    }),
    option({
      number: 1,
      text: `Gain ${omenAmount} omens.`,
      effects: [gainOmen(omenAmount)],
      effect: valueOmenGain(omenAmount),
    }),
  ];

  if (namedCard) {
    const payload = namedCardPayload(
      {
        kind: "card_gain",
        result: namedCard.card,
        source: namedCard.source,
        extra: {
          targetOrigin: namedCard.targetOrigin,
          selectionWeight: namedCard.weight,
          weightHooks: namedCard.weightHooks,
        },
      },
      context,
    );

    options.push(option({
      number: 1,
      text: `Gain {${namedCard.card.name}}.`,
      effects: [payload],
      targets: [
        cardExactTarget(
          namedCard.card,
          namedCard.source,
          `${namedCard.card.name} as a visible reward`,
        ),
      ],
      effect: Math.max(
        CARD_VALUE_CONSTANTS.namedVisibleByRarity.common,
        cardQualityValue(namedCard.card),
      ),
    }));
  }

  if (namedDreamsign) {
    const payload = namedDreamsignPayload(
      {
        kind: "dreamsign_gain",
        dreamsign: namedDreamsign.dreamsign,
        source: namedDreamsign.source,
        extra: {
          targetOrigin: namedDreamsign.targetOrigin,
          selectionWeight: namedDreamsign.weight,
          weightHooks: namedDreamsign.weightHooks,
        },
      },
      context,
    );

    options.push(option({
      number: 1,
      text: `Gain {${namedDreamsign.dreamsign.name}}.`,
      effects: [payload],
      targets: [
        dreamsignExactTarget(namedDreamsign.dreamsign, namedDreamsign.source),
      ],
      effect: DREAMSIGN_VALUE_CONSTANTS.namedGain +
        (namedDreamsign.targetOrigin === "dreamsign_pool_candidate"
          ? DREAMSIGN_VALUE_CONSTANTS.selectedTideMatchBonus
          : 0),
    }));
  }

  return options;
}
