import {
  delayedHookFillFromExpanded,
  expandedDelayedHookFills,
} from "../../fillers/hookPayloads.js";
import { pickSequentialVariant } from "../../fillers/shared.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_ID = "reward_after_trigger";

export function rewardAfterTriggerFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext, stage } = args;
  const expandedHooks = expandedDelayedHookFills({
    context,
    drawContext,
    label: `${SHAPE_ID}:expanded`,
    stage,
  });
  const hookFamily = pickSequentialVariant(
    drawContext,
    `${SHAPE_ID}:hook-family`,
    [
      "expanded_pair",
      "site_visit_pair",
      "counter_pair",
    ] as const,
  );
  const selectedHooks = hookFamily === "site_visit_pair"
    ? expandedHooks.filter((entry) => entry.triggerKind === "site_visit")
    : hookFamily === "counter_pair"
      ? [
          expandedHooks.find(
            (entry) =>
              entry.triggerKind === "named_card_play" &&
              entry.resolutionKind === "essence_gain",
          ),
          expandedHooks.find(
            (entry) =>
              entry.triggerKind === "dreamsign_trigger" &&
              entry.resolutionKind === "omen_gain",
          ),
        ].filter((entry): entry is (typeof expandedHooks)[number] => Boolean(entry))
      : expandedHooks;
  const firstHook = delayedHookFillFromExpanded({
    shapeId: SHAPE_ID,
    optionNumber: 1,
    fill: selectedHooks[0] ?? expandedHooks[0]!,
  });
  const secondHook = delayedHookFillFromExpanded({
    shapeId: SHAPE_ID,
    optionNumber: 2,
    fill: selectedHooks[1] ?? selectedHooks[0] ?? expandedHooks[1] ?? expandedHooks[0]!,
  });

  return {
    options: [firstHook.option, secondHook.option],
    precommitted: {
      delayed: [firstHook.precommit, secondHook.precommit],
    },
  };
}
