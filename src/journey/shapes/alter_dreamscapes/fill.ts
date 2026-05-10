import {
  cardOperationTargetModeForClass,
  compatibleCardOperations,
  renderChosenCardOperationText,
} from "../../fillers/cardOperationCatalog.js";
import { routeEditMenuRewards } from "../../fillers/routeEditCatalog.js";
import {
  baneBurdenSlot,
  chosenCardText,
  gainEssence,
  gainOmen,
  option,
  symmetryContract,
  target,
} from "../../fillers/shared.js";
import { valueOmenGain } from "../../value.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_LABEL = "alter_dreamscapes";

export function alterDreamscapesFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext, stage } = args;
  const routeMenu = routeEditMenuRewards({
    drawContext,
    label: `${SHAPE_LABEL}:routes`,
  });
  const routeBane = baneBurdenSlot(
    drawContext,
    `${SHAPE_LABEL}:route-bane`,
    1,
  );
  const companionCardOperation = compatibleCardOperations(drawContext, {
    slot: {
      provides: [
        "single_target",
        "all_matching_scope",
        "named_target",
        "deck_side",
        "deck_mutation_consumer",
        "text_or_subtype_mutation_consumer",
      ],
    },
    targetClasses: ["deck_card"],
    targetModes: [cardOperationTargetModeForClass("deck_card")],
    valueBands: ["standard"],
    timings: ["immediate"],
    context,
    stage,
    label: `${SHAPE_LABEL}:route-card-operation`,
    count: 1,
  })[0]!;
  const companionCardTarget = target(
    "card",
    chosenCardText(),
    { source: "deck" },
    {
      selection: "chosen_after_commitment",
      cardOperationTargetMode: "chosen",
    },
  );
  const routeOptions = routeMenu.rewards.map((reward, index) => {
    const effects: unknown[] = [];
    const targets: unknown[] = [];
    let text = reward.text;
    let effect = reward.effect;
    let burden = 0;
    let burdens: unknown[] = [];

    if (reward.companion === "small_essence_reward") {
      const amount = 45;

      text = `${text} Gain ${amount} essence.`;
      effects.push(gainEssence(amount));
      effect += amount;
    } else if (reward.companion === "small_omen_reward") {
      const amount = 1;

      text = `${text} Gain ${amount} omen.`;
      effects.push(gainOmen(amount));
      effect += valueOmenGain(amount);
    } else if (reward.companion === "bane_burden") {
      const compensation = Math.max(
        45,
        Math.min(
          90,
          Math.round(Math.abs(routeBane.burden) * 0.7 / 5) * 5,
        ),
      );

      text = `${routeBane.prefix} ${text}`;
      text = `${text} Gain ${compensation} essence.`;
      effects.push(gainEssence(compensation));
      effect += compensation;
      burdens = routeBane.burdens;
      burden = routeBane.burden;
    } else if (reward.companion === "card_operation") {
      text = `${text} ${renderChosenCardOperationText(companionCardOperation)}`;
      effects.push(companionCardOperation.effect);
      targets.push(companionCardTarget);
      effect += companionCardOperation.value;
    }

    return option({
      number: index + 1,
      text,
      effects,
      burdens,
      targets,
      routeEffects: [reward.payload],
      burden,
      effect,
      uncertainty: reward.companion === "card_operation"
        ? companionCardOperation.uncertainty
        : undefined,
    });
  });

  return {
    options: routeOptions,
    precommitted: {
      routeEdits: routeOptions
        .flatMap((reward) => reward.routeEffects ?? []),
    },
    symmetryContracts: [
      symmetryContract({
        contractKind: "shared_source_site_destinations",
        sharedProperty: routeMenu.sharedProperty,
        variedProperty: "route destination or companion payload",
        sharedFirst: true,
        optionNumbers: routeOptions.map((entry) => entry.number),
        sharedPayloadKeys: [routeMenu.variantId],
        variedPayloadKeys: routeMenu.rewards.map((reward) => reward.key),
        weight: 1,
      }),
    ],
  };
}
