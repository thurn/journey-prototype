import type { DrawContext } from "../../../util/rng.js";
import type { JourneyStage } from "../../manifest.js";
import { BANE_NAMES } from "../../effects.js";
import { baneBurden, pickSequentialVariant } from "../../fillers/shared.js";
import { valueBaneBurden } from "../../value.js";

const REVEAL_BURDEN_COUNT_BANDS = {
  early: [1],
  mid: [1, 1, 2],
  late: [1, 2],
} as const satisfies Record<JourneyStage, readonly number[]>;

export function revealBurdenProfile(args: {
  drawContext: DrawContext;
  label: string;
  stage: JourneyStage;
}) {
  const baneName = pickSequentialVariant(
    args.drawContext,
    `${args.label}:reveal-burden-name`,
    BANE_NAMES,
  );
  const count = pickSequentialVariant(
    args.drawContext,
    `${args.label}:reveal-burden-count`,
    REVEAL_BURDEN_COUNT_BANDS[args.stage],
  );

  return {
    baneName,
    count,
    text: `gain ${count} {${baneName}}`,
    payload: baneBurden(baneName, count),
    value: valueBaneBurden({ baneName, count }),
  };
}
