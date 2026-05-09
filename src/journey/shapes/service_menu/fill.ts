import { weightedChoice } from "../../../util/rng.js";
import { sharedStarterCleanupRewardFill } from "../../fillers/shapeFills.js";
import {
  optionFromResolvedShapeFill,
  rewardSlotOption,
  rewardSlots,
  starterSurgeryRewardSlots,
} from "../../fillers/shared.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";
import { compoundPayloadMenuFill } from "./compoundPayloads.js";

const SHAPE_ID = "service_menu";

export function serviceMenuFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext, stage } = args;
  const starterRewards = starterSurgeryRewardSlots(
    context,
    drawContext,
    `${SHAPE_ID}:starter-services`,
    stage,
  ).filter((reward) => reward.effect >= 140);
  const serviceFamily = weightedChoice(
    drawContext,
    `${SHAPE_ID}:service-family`,
    [
      { item: "compound_payload", weight: 2 },
      { item: "starter_cleanup_prefix", weight: 1 },
      { item: "starter_surgery", weight: 2 },
      { item: "general", weight: 5 },
    ] as const,
  );
  const compoundFill = serviceFamily === "compound_payload"
    ? compoundPayloadMenuFill({
        context,
        drawContext,
        label: `${SHAPE_ID}:compound`,
        shapeId: SHAPE_ID,
        stage,
      })
    : undefined;
  const cleanupPrefixFill = serviceFamily === "starter_cleanup_prefix"
    ? sharedStarterCleanupRewardFill({
        context,
        drawContext,
        label: SHAPE_ID,
        stage,
      })
    : undefined;

  if (compoundFill) {
    return {
      options: compoundFill.options.map((fill) =>
        optionFromResolvedShapeFill(fill),
      ),
      precommitted: {
        routeEdits: compoundFill.options.flatMap((fill) =>
          fill.routeEffects ?? [],
        ),
      },
    };
  }

  if (cleanupPrefixFill) {
    return {
      options: cleanupPrefixFill.options,
      precommitted: {},
      symmetryContracts: cleanupPrefixFill.symmetryContracts,
    };
  }

  const rewards =
    serviceFamily === "starter_surgery" && starterRewards.length >= 3
      ? starterRewards
      : rewardSlots(context, drawContext, `${SHAPE_ID}:services`).filter(
          (reward) => reward.effect >= 140,
        );

  return {
    options: rewards
      .slice(0, 3)
      .map((reward, index) => rewardSlotOption(index + 1, reward)),
    precommitted: {},
  };
}
