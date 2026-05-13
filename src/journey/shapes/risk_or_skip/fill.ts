import { option, pickSequentialVariant } from "../../fillers/shared.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";
import {
  randomBaneChanceEnvelope,
  randomRiskCostEnvelope,
} from "./envelopes.js";
import { namedDreamsignRiskReward } from "./rewards.js";

const SHAPE_ID = "risk_or_skip";

export function riskOrSkipFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext, stage } = args;
  const reward = namedDreamsignRiskReward({
    context,
    drawContext,
    label: `${SHAPE_ID}:risk-reward`,
    stage,
  });
  const downsideChancePercent = pickSequentialVariant(
    drawContext,
    `${SHAPE_ID}:downside-chance`,
    stage === "early"
      ? [35, 45, 50, 65, 75]
      : stage === "mid"
        ? [45, 50, 65, 75, 85]
        : [50, 65, 75, 85, 90],
  );
  const downsideKind = pickSequentialVariant(
    drawContext,
    `${SHAPE_ID}:downside-kind`,
    ["bane", "random_cost"] as const,
  );
  const riskConstraint = {
    constraintKind: "shape_invariant" as const,
    shapeId: SHAPE_ID,
    ruleId: "risk_or_skip_bounded_downside" as const,
    label:
      "The accept option has one bounded random downside and the leave option stays safe.",
  };
  const downside = downsideKind === "bane"
    ? randomBaneChanceEnvelope({
        drawContext,
        label: `${SHAPE_ID}:risk-bane`,
        optionNumber: 1,
        chancePercent: downsideChancePercent,
        stage,
      })
    : randomRiskCostEnvelope({
        context,
        drawContext,
        label: `${SHAPE_ID}:risk-cost`,
        optionNumber: 1,
        chancePercent: downsideChancePercent,
        stage,
      });
  const riskEnvelope = {
    ...downside.envelope,
    constraints: [riskConstraint],
  };
  const downsideUncertainty = Math.max(downside.value, -reward.value + 5);

  return {
    options: [
      option({
        number: 1,
        text: `${reward.text} ${downsideChancePercent}% chance to ${downside.text}; otherwise no downside.`,
        effects: reward.payloads,
        targets: reward.targets ?? [],
        effect: reward.value,
        uncertainty: downsideUncertainty,
      }),
      option({
        number: 2,
        text: "Leave with no effect.",
        pickBehavior: "leave",
      }),
    ],
    precommitted: {
      random: [riskEnvelope],
    },
  };
}
