import {
  delayedHookFillFromExpanded,
  expandedDelayedHookFills,
  type ExpandedDelayedHookFill,
} from "../../fillers/hookPayloads.js";
import { pickSequentialVariant } from "../../fillers/shared.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_ID = "reward_after_trigger";

function hasNamedTriggerTarget(fill: ExpandedDelayedHookFill): boolean {
  const selector = fill.triggerSelector;

  if (
    fill.triggerKind === "named_card_play" ||
    fill.triggerKind === "card_added"
  ) {
    return (
      typeof selector.cardId === "string" ||
      typeof selector.cardName === "string"
    );
  }

  if (fill.triggerKind === "dreamsign_trigger") {
    return (
      typeof selector.dreamsignId === "string" ||
      typeof selector.dreamsignName === "string"
    );
  }

  return true;
}

function uniqueHookCandidates(
  fills: readonly ExpandedDelayedHookFill[],
): ExpandedDelayedHookFill[] {
  const seen = new Set<string>();

  return fills.filter((fill) => {
    const key = `${fill.triggerKind}:${fill.text}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}

function selectHookPair(args: {
  preferred: readonly ExpandedDelayedHookFill[];
  fallback: readonly ExpandedDelayedHookFill[];
}): readonly [ExpandedDelayedHookFill, ExpandedDelayedHookFill] {
  const selected: ExpandedDelayedHookFill[] = [];

  for (const fill of uniqueHookCandidates([...args.preferred, ...args.fallback])) {
    selected.push(fill);

    if (selected.length === 2) {
      break;
    }
  }

  return [selected[0]!, selected[1] ?? selected[0]!];
}

export function rewardAfterTriggerFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext, stage } = args;
  const expandedHooks = expandedDelayedHookFills({
    context,
    drawContext,
    label: `${SHAPE_ID}:expanded`,
    stage,
  }).filter(hasNamedTriggerTarget);
  const hookFamily = pickSequentialVariant(
    drawContext,
    `${SHAPE_ID}:hook-family`,
    [
      "expanded_pair",
      "site_visit_pair",
      "counter_pair",
    ] as const,
  );
  const preferredHooks = hookFamily === "site_visit_pair"
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
  const selectedHooks = selectHookPair({
    preferred: preferredHooks,
    fallback: expandedHooks,
  });
  const firstHook = delayedHookFillFromExpanded({
    shapeId: SHAPE_ID,
    optionNumber: 1,
    fill: selectedHooks[0],
  });
  const secondHook = delayedHookFillFromExpanded({
    shapeId: SHAPE_ID,
    optionNumber: 2,
    fill: selectedHooks[1],
  });

  return {
    options: [firstHook.option, secondHook.option],
    precommitted: {
      delayed: [firstHook.precommit, secondHook.precommit],
    },
  };
}
