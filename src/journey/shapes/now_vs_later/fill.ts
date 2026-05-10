import { shuffleDeterministic } from "../../../util/rng.js";
import {
  dreamsignExactTarget,
  namedDreamsignPayload,
  selectContentBackedDreamsign,
} from "../../fillers/dreamsignPayloads.js";
import {
  delayedHookFillFromExpanded,
  delayedRewardHookFill,
  expandedDelayedHookFills,
} from "../../fillers/hookPayloads.js";
import {
  gainEssence,
  option,
  rewardSlotOption,
  rewardSlots,
  timingSlots,
} from "../../fillers/shared.js";
import type { JourneyStage } from "../../manifest.js";
import { valueDreamsignOperation } from "../../value.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_ID = "now_vs_later";

const NOW_VS_LATER_IMMEDIATE_ESSENCE_AMOUNTS = {
  early: [80, 100],
  mid: [100, 120],
  late: [120, 150],
} as const satisfies Record<JourneyStage, readonly number[]>;

export function nowVsLaterFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext, stage } = args;
  const expandedHooks = expandedDelayedHookFills({
    context,
    drawContext,
    label: `${SHAPE_ID}:expanded`,
    stage,
  });
  const namedFuture = expandedHooks.find(
    (entry) =>
      entry.triggerKind === "victory" &&
      entry.resolutionKind === "named_dreamsign_grant",
  );
  const immediateDreamsign = selectContentBackedDreamsign({
    context,
    drawContext,
    label: `${SHAPE_ID}:immediate-dreamsign`,
    stage,
    sources: ["catalog"],
  });
  if (namedFuture && immediateDreamsign) {
    const immediateEffect = namedDreamsignPayload(
      {
        kind: "dreamsign_gain",
        dreamsign: immediateDreamsign.dreamsign,
        source: immediateDreamsign.source,
        extra: {
          targetOrigin: immediateDreamsign.targetOrigin,
          selectionWeight: immediateDreamsign.weight,
          weightHooks: immediateDreamsign.weightHooks,
        },
      },
      context,
    );
    const delayedHook = delayedHookFillFromExpanded({
      shapeId: SHAPE_ID,
      optionNumber: 2,
      fill: namedFuture,
    });

    return {
      options: [
        option({
          number: 1,
          text: `Gain {${immediateDreamsign.dreamsign.name}}.`,
          effects: [immediateEffect],
          targets: [
            dreamsignExactTarget(
              immediateDreamsign.dreamsign,
              immediateDreamsign.source,
            ),
          ],
          effect: valueDreamsignOperation("gain", {
            tideOverlap: immediateDreamsign.weightHooks.tideOverlap > 0,
          }),
        }),
        delayedHook.option,
      ],
      precommitted: {
        delayed: [delayedHook.precommit],
      },
    };
  }

  const reward = rewardSlots(
    context,
    drawContext,
    `${SHAPE_ID}:reward`,
  ).filter((entry) => entry.routeEffects === undefined)[0]!;
  const immediateEssenceAmount = shuffleDeterministic(
    drawContext,
    `${SHAPE_ID}:immediate-essence:${stage}`,
    NOW_VS_LATER_IMMEDIATE_ESSENCE_AMOUNTS[stage],
  )[0]!;
  const immediateReward = {
    ...reward,
    text: reward.key === "essence"
      ? `Gain ${immediateEssenceAmount} essence.`
      : reward.text,
    effects: reward.key === "essence"
      ? [gainEssence(immediateEssenceAmount)]
      : reward.effects,
    effect:
      reward.key === "essence"
        ? immediateEssenceAmount
        : Math.max(120, Math.round(reward.effect * 0.65)),
  };
  const timing = timingSlots(drawContext, `${SHAPE_ID}:timing`).find(
    (entry) =>
      entry.key === "two-dreamscapes" || entry.key === "next-dreamscape",
  )!;
  const delayedReward = {
    ...reward,
    effect: Math.round(
      reward.effect * (timing.key === "two-dreamscapes" ? 2.6 : 1.45),
    ),
  };
  const delayedHook = delayedRewardHookFill({
    shapeId: SHAPE_ID,
    optionNumber: 2,
    timing,
    reward: delayedReward,
  });

  return {
    options: [rewardSlotOption(1, immediateReward), delayedHook.option],
    precommitted: {
      delayed: [delayedHook.precommit],
    },
  };
}
