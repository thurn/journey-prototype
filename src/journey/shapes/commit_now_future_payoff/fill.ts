import {
  costSlots,
  lowerFirst,
  rewardSlots,
  symmetryContract,
  timingSlots,
} from "../../fillers/shared.js";
import {
  delayedHookFillFromExpanded,
  delayedRewardHookFill,
  expandedDelayedHookFills,
} from "../../fillers/hookPayloads.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_ID = "commit_now_future_payoff";

export function commitNowFuturePayoffFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext, stage } = args;
  const expandedHooks = expandedDelayedHookFills({
    context,
    drawContext,
    label: `${SHAPE_ID}:expanded`,
    stage,
  });
  const delayedBaneHooks = expandedHooks.filter((entry) =>
    entry.key.includes(":delayed-bane:"),
  );

  if (delayedBaneHooks.length === 3) {
    const hooks = delayedBaneHooks.map((fill, index) =>
      delayedHookFillFromExpanded({
        shapeId: SHAPE_ID,
        optionNumber: index + 1,
        fill,
      }),
    );

    return {
      options: hooks.map((entry) => entry.option),
      precommitted: {
        delayed: hooks.map((entry) => entry.precommit),
      },
      symmetryContracts: [
        symmetryContract({
          contractKind: "shared_future_trigger_outcomes",
          sharedProperty: String(
            delayedBaneHooks[0]?.triggerSelector.label ??
              "delayed Bane trigger",
          ),
          variedProperty: "delayed Bane outcome",
          sharedFirst: true,
          optionNumbers: [1, 2, 3],
          sharedPayloadKeys: [
            String(
              delayedBaneHooks[0]?.triggerSelector.triggerKind ??
                "delayed-bane",
            ),
          ],
          variedPayloadKeys: delayedBaneHooks.map((entry) => entry.key),
          weight: 1,
        }),
      ],
    };
  }

  const rewards = rewardSlots(
    context,
    drawContext,
    `${SHAPE_ID}:future-rewards`,
  ).filter((entry) => entry.routeEffects === undefined);
  const timing = timingSlots(drawContext, `${SHAPE_ID}:timing`).find(
    (entry) => entry.key === "next-dreamscape",
  )!;
  const commitments = [
    costSlots(context, drawContext, `${SHAPE_ID}:commitment:1`).find(
      (entry) => entry.key === "low-essence",
    )!,
    costSlots(context, drawContext, `${SHAPE_ID}:commitment:2`).find(
      (entry) => entry.key === "bane",
    )!,
    costSlots(context, drawContext, `${SHAPE_ID}:commitment:3`).find(
      (entry) => entry.key === "high-essence",
    )!,
  ];
  const futureRewards = rewards.slice(0, 3).map((reward, index) => {
    const commitment = commitments[index]!;

    return {
      ...reward,
      effect: Math.round(
        175 +
          (commitment.cost ?? 0) -
          (commitment.burden ?? 0) -
          timing.uncertainty +
          index * 10,
      ),
    };
  });
  const futureHooks = futureRewards.map((reward, index) =>
    delayedRewardHookFill({
      shapeId: SHAPE_ID,
      optionNumber: index + 1,
      timing,
      reward,
      optionText: `${commitments[index]!.prefix.replace(/\.$/u, "")} now. ${timing.text}, ${lowerFirst(reward.text)}`,
      costs: commitments[index]!.costs ?? [],
      burdens: commitments[index]!.burdens ?? [],
      cost: commitments[index]!.cost,
      burden: commitments[index]!.burden,
      effect: reward.effect,
      uncertainty: timing.uncertainty,
    }),
  );

  return {
    options: futureHooks.map((entry) => entry.option),
    precommitted: {
      delayed: futureHooks.map((entry) => entry.precommit),
    },
    symmetryContracts: [
      symmetryContract({
        contractKind: "shared_timing_different_rewards",
        sharedProperty: timing.key,
        variedProperty: "future reward and commitment",
        sharedFirst: true,
        optionNumbers: [1, 2, 3],
        sharedPayloadKeys: [timing.key],
        variedPayloadKeys: futureRewards.map((reward) => reward.key),
        weight: 1,
      }),
    ],
  };
}
