import { shuffleDeterministic } from "../../../util/rng.js";
import {
  baneBurden,
  baneNameText,
  cost,
  option,
  pickSequentialVariant,
  renumberOptions,
} from "../../fillers/shared.js";
import type { JourneyOption } from "../../manifest.js";
import { valueBaneBurden, valueOmenLoss } from "../../value.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";
import {
  CHOOSE_YOUR_LOSS_BANE_COUNTS,
  chooseYourLossBaneCandidates,
  comparableEssenceLossAmount,
} from "./losses.js";

const SHAPE_LABEL = "choose_your_loss";

export function chooseYourLossFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext, stage } = args;
  const includeOmenLoss = context.state.quest.resources.omens >= 1;
  const baneCount = pickSequentialVariant(
    drawContext,
    `${SHAPE_LABEL}:bane-count`,
    CHOOSE_YOUR_LOSS_BANE_COUNTS[stage],
  );
  const baneName = pickSequentialVariant(
    drawContext,
    `${SHAPE_LABEL}:bane-name`,
    chooseYourLossBaneCandidates(baneCount, includeOmenLoss),
  );
  const omenLoss = valueOmenLoss(1);
  const baneLoss = valueBaneBurden({ baneName, count: baneCount });
  const essenceLoss = comparableEssenceLossAmount(
    [...(includeOmenLoss ? [omenLoss] : []), baneLoss],
    context.state.quest.resources.essence,
  );
  const options: JourneyOption[] = [];

  if (essenceLoss !== null) {
    options.push(
      option({
        number: options.length + 1,
        text: `Pay ${essenceLoss} essence.`,
        costs: [cost("essence", essenceLoss)],
        cost: essenceLoss,
      }),
    );
  }

  if (includeOmenLoss && baneCount === 1) {
    options.push(
      option({
        number: options.length + 1,
        text: "Lose 1 omen.",
        costs: [cost("omens", 1)],
        cost: Math.abs(omenLoss),
      }),
    );
  }

  options.push(
    option({
      number: options.length + 1,
      text: `Gain ${baneNameText(baneName, baneCount)}.`,
      burdens: [baneBurden(baneName, baneCount)],
      burden: baneLoss,
    }),
  );

  return {
    options: renumberOptions(
      shuffleDeterministic(drawContext, `${SHAPE_LABEL}:loss-order`, options),
    ),
    precommitted: {},
  };
}
