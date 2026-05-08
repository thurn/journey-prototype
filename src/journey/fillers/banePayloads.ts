import type { JourneyContext } from "../../quest/context.js";
import { type DrawContext } from "../../util/rng.js";
import type { JourneyOption } from "../manifest.js";
import { BANE_VALUE_CONSTANTS, valueBaneGain } from "../value.js";
import { cardQualityValue, catalogRewardCards } from "./namedCardPayloads.js";
import {
  BATTLE_WINDOW_DURATION,
  baneTarget,
  gainEssence,
  option,
  pickSequentialVariant,
  target,
} from "./shared.js";

export function banePayload(args: {
  kind: string;
  baneName: string;
  count?: number;
  targetContext?: "current_state" | "future_burden" | "manifest_obligation";
  selection?: "exact" | "chosen_after_commitment" | "visible_random";
  timing?: string;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    kind: args.kind,
    baneOperationKind: args.kind.replace(/^bane_/u, ""),
    baneName: args.baneName,
    count: args.count ?? 1,
    baneTargetContext: args.targetContext ?? "future_burden",
    selection: args.selection ?? "exact",
    timing: args.timing ?? "immediate",
    ...(args.extra ?? {}),
  };
}

export function baneGainPurgeTransformOptions(
  context: JourneyContext,
  drawContext: DrawContext,
): JourneyOption[] {
  const rewardCards = catalogRewardCards(context, drawContext);
  const transformCard =
    rewardCards[0] ??
    context.content.cards.find((card) => card.rarity !== "Starter") ??
    context.content.cards[0]!;
  const replacement = pickSequentialVariant(
    drawContext,
    "bane-gain-purge-transform:replacement",
    ["Doubt", "Silence", "Paranoia"],
  );
  const gained = banePayload({
    kind: "bane_gain",
    baneName: "Nightmare",
    count: 2,
    targetContext: "future_burden",
  });
  const delayed = banePayload({
    kind: "bane_gain",
    baneName: "Doubt",
    targetContext: "future_burden",
    timing: "after next battle",
    extra: { delayed: true },
  });
  const temporary = banePayload({
    kind: "bane_gain",
    baneName: "Paranoia",
    targetContext: "future_burden",
    timing: BATTLE_WINDOW_DURATION,
    extra: { temporary: true, duration: BATTLE_WINDOW_DURATION },
  });
  const chosenPurge = banePayload({
    kind: "bane_chosen_purge",
    baneName: "Nightmare",
    targetContext: "manifest_obligation",
    selection: "chosen_after_commitment",
  });
  const randomPurge = banePayload({
    kind: "bane_random_purge",
    baneName: "Despair",
    targetContext: "manifest_obligation",
    selection: "visible_random",
  });
  const replace = banePayload({
    kind: "bane_replace",
    baneName: "Oblivion",
    targetContext: "manifest_obligation",
    extra: { newBaneName: replacement },
  });
  const transform = banePayload({
    kind: "bane_transform_to_card",
    baneName: "Despair",
    targetContext: "manifest_obligation",
    extra: {
      cardId: transformCard.id,
      cardName: transformCard.name,
      source: "catalog",
    },
  });

  return [
    option({
      number: 1,
      text: "Gain 180 essence. Gain 2 Nightmares now and gain 1 Doubt after next battle.",
      effects: [gainEssence(180)],
      burdens: [gained, delayed],
      targets: [baneTarget("future Bane burden", ["Nightmare", "Doubt"])],
      effect: 330,
      burden:
        valueBaneGain("Nightmare", 2) +
        Math.round(
          valueBaneGain("Doubt", 1) * BANE_VALUE_CONSTANTS.delayedMultiplier,
        ),
    }),
    option({
      number: 2,
      text: `Choose a manifest Nightmare obligation to purge, purge one random visible Despair obligation, then replace Oblivion with ${replacement}.`,
      effects: [chosenPurge, randomPurge, replace],
      targets: [
        baneTarget(
          "manifest-local Bane obligations",
          ["Nightmare", "Despair", "Oblivion"],
          "vocabulary",
          "chosen_after_commitment",
        ),
      ],
      effect: 150,
    }),
    option({
      number: 3,
      text: `Transform a manifest Despair obligation into {${transformCard.name}}.`,
      effects: [transform],
      targets: [
        baneTarget("manifest-local Bane obligation", ["Despair"]),
        target("card", `${transformCard.name} in catalog`, {
          source: "catalog",
          ids: [transformCard.id],
          names: [transformCard.name],
        }),
      ],
      effect:
        BANE_VALUE_CONSTANTS.transformToCardBase +
        Math.min(35, cardQualityValue(transformCard) - 75),
    }),
    option({
      number: 4,
      text: "Gain 220 essence. Carry 1 temporary Paranoia for the next 3 battles.",
      effects: [gainEssence(220)],
      burdens: [temporary],
      targets: [baneTarget("temporary future Bane burden", ["Paranoia"])],
      effect: 195,
      burden: Math.round(
        valueBaneGain("Paranoia", 1) * BANE_VALUE_CONSTANTS.temporaryMultiplier,
      ),
    }),
  ];
}
