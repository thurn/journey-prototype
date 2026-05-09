import { BANE_NAMES, type BaneName } from "../../effects.js";
import type { JourneyStage } from "../../manifest.js";
import { LOSS_CHOICE_VALUE_CONSTANTS, valueBaneGain } from "../../value.js";

export const CHOOSE_YOUR_LOSS_BANE_COUNTS = {
  early: [1],
  mid: [1, 2],
  late: [1, 2, 2],
} as const satisfies Record<JourneyStage, readonly number[]>;

export function chooseYourLossBaneCandidates(
  count: number,
  includeOmenLoss: boolean,
): readonly BaneName[] {
  if (count === 1 && !includeOmenLoss) {
    return BANE_NAMES;
  }

  const maximumSingleBaneMagnitude = count === 1 ? 130 : 110;
  const standardBanes = BANE_NAMES.filter(
    (baneName) =>
      Math.abs(valueBaneGain(baneName, 1)) <= maximumSingleBaneMagnitude,
  );

  return standardBanes.length > 0 ? standardBanes : BANE_NAMES;
}

export function comparableEssenceLossAmount(
  comparisonLosses: readonly number[],
  availableEssence: number,
): number | null {
  const magnitudes = comparisonLosses
    .map((loss) => Math.abs(loss))
    .filter(
      (loss) => loss >= LOSS_CHOICE_VALUE_CONSTANTS.minimumComparableMagnitude,
    )
    .sort((left, right) => left - right);

  if (magnitudes.length === 0) {
    return null;
  }

  const lowest = magnitudes[0]!;
  const highest = magnitudes[magnitudes.length - 1]!;
  const target = Math.round((lowest + highest) / 2 / 5) * 5;
  const payable = Math.min(target, availableEssence);

  return payable >= LOSS_CHOICE_VALUE_CONSTANTS.minimumComparableMagnitude
    ? payable
    : null;
}
