import { weightedChoice } from "../../../util/rng.js";
import {
  fillOptions,
  sharedBaneBurdenRewardFill,
  sharedStarterCleanupRewardFill,
} from "../../fillers/shapeFills.js";
import { gainOmen, option } from "../../fillers/shared.js";
import type { JourneyOption, JourneyStage } from "../../manifest.js";
import { valueOmenGain } from "../../value.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_LABEL = "shared_prefix_menu";
const BANE_PREFIX_OMEN_BONUS: Record<JourneyStage, number> = {
  early: 0,
  mid: 1,
  late: 2,
};

type BaneGainBurden = {
  readonly kind: "bane_gain";
  readonly baneName: string;
  readonly count: number;
};

function countText(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function isBaneGainBurden(entry: unknown): entry is BaneGainBurden {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "kind" in entry &&
    entry.kind === "bane_gain" &&
    "baneName" in entry &&
    typeof entry.baneName === "string" &&
    "count" in entry &&
    typeof entry.count === "number"
  );
}

function banePrefixText(option: JourneyOption): string | undefined {
  const burden = option.burdens.find(isBaneGainBurden);

  if (!burden) {
    return undefined;
  }

  return `Gain ${countText(burden.count, `${burden.baneName} Bane`)}.`;
}

function replaceFirstSentence(text: string, replacement: string): string {
  return text.replace(/^.*?\.\s*/u, replacement.endsWith(" ") ? replacement : `${replacement} `);
}

function stageBanePrefixOption(
  journeyOption: JourneyOption,
  stage: JourneyStage,
): JourneyOption {
  const prefix = banePrefixText(journeyOption);
  const hasRouteReward = journeyOption.routeEffects.length > 0;
  const omenBonus = hasRouteReward ? 0 : BANE_PREFIX_OMEN_BONUS[stage];
  const effects = omenBonus > 0
    ? [...journeyOption.effects, gainOmen(omenBonus)]
    : journeyOption.effects;
  const bonusText = omenBonus > 0
    ? ` Gain ${countText(omenBonus, "omen")}.`
    : "";

  return option({
    number: journeyOption.number,
    text: `${prefix ? replaceFirstSentence(journeyOption.text, prefix) : journeyOption.text}${bonusText}`,
    costs: journeyOption.costs,
    burdens: journeyOption.burdens,
    effects,
    targets: journeyOption.targets,
    triggers: journeyOption.triggers,
    routeEffects: journeyOption.routeEffects,
    cost: journeyOption.costConvertedEssence,
    burden: journeyOption.burdenConvertedEssence,
    effect:
      journeyOption.effectConvertedEssence +
      (omenBonus > 0 ? valueOmenGain(omenBonus) : 0),
    uncertainty: journeyOption.uncertaintyConvertedEssence,
    pickBehavior: journeyOption.pickBehavior,
  });
}

export function sharedPrefixMenuFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext, stage } = args;
  const prefixFamily = weightedChoice(
    drawContext,
    `${SHAPE_LABEL}:prefix-family`,
    [
      { item: "shared_bane_burden", weight: 3 },
      { item: "starter_cleanup_prefix", weight: 2 },
    ] as const,
  );
  const cleanupPrefixFill = prefixFamily === "starter_cleanup_prefix"
    ? sharedStarterCleanupRewardFill({
        context,
        drawContext,
        label: SHAPE_LABEL,
        stage,
      })
    : undefined;
  const prefixFill =
    cleanupPrefixFill ??
    sharedBaneBurdenRewardFill({
      context,
      drawContext,
      label: SHAPE_LABEL,
      stage,
    });

  if (prefixFill) {
    const hasBanePrefix = prefixFill.options.some((entry) =>
      banePrefixText(entry) !== undefined
    );
    const options = hasBanePrefix
      ? prefixFill.options.map((entry) => stageBanePrefixOption(entry, stage))
      : prefixFill.options;

    return {
      options,
      precommitted: {
        routeEdits: options.flatMap(
          (journeyOption) => journeyOption.routeEffects,
        ),
      },
      symmetryContracts: prefixFill.symmetryContracts,
    };
  }

  return fillOptions("same_cost_different_rewards", context, drawContext, stage);
}
