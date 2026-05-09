import { drawInt } from "../../../util/rng.js";
import {
  cost,
  lowerFirst,
  option,
  pickSequentialVariant,
  rewardSlots,
} from "../../fillers/shared.js";
import { randomVisibility } from "../../fillers/randomPayloads.js";
import { odds } from "../../fillers/treeBuilders.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_ID = "single_wager";

export function singleWagerFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext } = args;
  const payablePrice = Math.min(30, context.state.quest.resources.essence);
  const wagerRewards = rewardSlots(
    context,
    drawContext,
    `${SHAPE_ID}:wager-rewards`,
  ).filter((entry) => entry.routeEffects === undefined);
  const firstReward = wagerRewards[0]!;
  const secondReward = wagerRewards[1] ?? wagerRewards[0]!;
  const firstSuccessPercent = pickSequentialVariant(
    drawContext,
    `${SHAPE_ID}:first-odds`,
    [45, 50, 55],
  );
  const firstSuccessReward = firstReward.effects;
  const firstRoll = drawInt(drawContext, "single-wager-roll:1", 1, 100);
  const firstCommittedResult =
    firstRoll <= firstSuccessPercent ? "success" : "failure";
  const secondPrice = Math.min(50, context.state.quest.resources.essence);
  const secondSuccessPercent = pickSequentialVariant(
    drawContext,
    `${SHAPE_ID}:second-odds`,
    [60, 65, 70],
  );
  const secondSuccessReward = secondReward.effects;
  const secondRoll = drawInt(drawContext, "single-wager-roll:2", 1, 100);
  const secondCommittedResult =
    secondRoll <= secondSuccessPercent ? "success" : "failure";
  const wagerConstraint = {
    constraintKind: "shape_invariant" as const,
    shapeId: SHAPE_ID,
    ruleId: "single_wager_known_stake" as const,
    label:
      "The stake, odds, success reward, and failure outcome are visible before commitment.",
  };
  const firstWagerEnvelope = {
    kind: "wager" as const,
    optionNumber: 1,
    odds: odds(firstSuccessPercent),
    stake: cost("essence", payablePrice),
    success: firstSuccessReward,
    failure: { kind: "no_reward" },
    roll: firstRoll,
    committedResult: firstCommittedResult,
    visibilityPolicy: randomVisibility(
      "pre_rolled",
      "The wager odds, stake, success, and failure are visible; the roll is precommitted.",
      true,
    ),
    expectedConvertedEssence:
      Math.round(firstReward.effect * (firstSuccessPercent / 100)) -
      payablePrice,
    riskPremiumConvertedEssence: -12,
    constraints: [wagerConstraint],
    presentation: "visible_odds_debug_roll",
  };
  const secondWagerEnvelope = {
    kind: "wager" as const,
    optionNumber: 2,
    odds: odds(secondSuccessPercent),
    stake: cost("essence", secondPrice),
    success: secondSuccessReward,
    failure: { kind: "no_reward" },
    roll: secondRoll,
    committedResult: secondCommittedResult,
    visibilityPolicy: randomVisibility(
      "pre_rolled",
      "The wager odds, stake, success, and failure are visible; the roll is precommitted.",
      true,
    ),
    expectedConvertedEssence:
      Math.round(secondReward.effect * (secondSuccessPercent / 100)) -
      secondPrice,
    riskPremiumConvertedEssence: -16,
    constraints: [wagerConstraint],
    presentation: "visible_odds_debug_roll",
  };

  return {
    options: [
      option({
        number: 1,
        text: `Pay ${payablePrice} essence. ${firstSuccessPercent}% chance to ${lowerFirst(firstReward.text).replace(/\.$/u, "")}; otherwise gain nothing.`,
        costs: [cost("essence", payablePrice)],
        effects: [
          {
            kind: "wager",
            odds: odds(firstSuccessPercent),
            stake: cost("essence", payablePrice),
            success: firstSuccessReward,
            failure: { kind: "no_reward" },
            visibilityPolicy: randomVisibility(
              "visible",
              "The wager odds, stake, success, and failure are visible before choosing.",
              true,
            ),
            constraints: [wagerConstraint],
          },
        ],
        cost: payablePrice,
        effect: Math.round(firstReward.effect * (firstSuccessPercent / 100)),
        uncertainty: -12,
      }),
      option({
        number: 2,
        text: `Pay ${secondPrice} essence. ${secondSuccessPercent}% chance to ${lowerFirst(secondReward.text).replace(/\.$/u, "")}; otherwise gain nothing.`,
        costs: [cost("essence", secondPrice)],
        effects: [
          {
            kind: "wager",
            odds: odds(secondSuccessPercent),
            stake: cost("essence", secondPrice),
            success: secondSuccessReward,
            failure: { kind: "no_reward" },
            visibilityPolicy: randomVisibility(
              "visible",
              "The wager odds, stake, success, and failure are visible before choosing.",
              true,
            ),
            constraints: [wagerConstraint],
          },
        ],
        cost: secondPrice,
        effect: Math.round(secondReward.effect * (secondSuccessPercent / 100)),
        uncertainty: -16,
      }),
    ],
    precommitted: {
      random: [firstWagerEnvelope, secondWagerEnvelope],
    },
  };
}
