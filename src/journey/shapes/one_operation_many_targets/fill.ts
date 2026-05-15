// src/journey/shapes/one_operation_many_targets/fill.ts
import type { JourneyOption, JourneySymmetryContractDebug } from "../../manifest.js";
import {
  ONE_OPERATION_MANY_TARGETS_REWARDS,
  type OneOperationManyTargetsReward,
  type TargetedRewardTarget,
} from "./rewards.js";
import { shuffleDeterministic, weightedChoice } from "../../../util/rng.js";
import type { TemplateParams } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

type Candidate = {
  readonly template: OneOperationManyTargetsReward;
  readonly params: TemplateParams;
  readonly targets: readonly TargetedRewardTarget[];
};

const LATE_MIN_EFFECT_CEC = 60;

function hasLateStageValue(candidate: Candidate, args: ShapeFillArgs): boolean {
  if (args.stage !== "late") {
    return true;
  }

  return candidate.targets.some((target) =>
    candidate.template.cec(candidate.params, target, args.context) >= LATE_MIN_EFFECT_CEC
  );
}

function optionFor(
  number: number,
  template: OneOperationManyTargetsReward,
  params: TemplateParams,
  target: TargetedRewardTarget,
  args: ShapeFillArgs,
): JourneyOption {
  const cec = template.cec(params, target, args.context);

  return {
    number,
    symbols: [...template.symbols],
    text: template.render(params, target, args.context),
    operations: [...template.operations(params, target, { optionNumber: number, cec })],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence: cec,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: cec,
    pickBehavior: "record_and_generate_next",
    rewardTemplateIds: [template.rewardTypeId],
  };
}

function symmetryContract(
  operationKey: string,
  template: OneOperationManyTargetsReward,
  targets: readonly TargetedRewardTarget[],
): JourneySymmetryContractDebug {
  return {
    contractKind: "shared_axis_rotated_attribute",
    sharedProperty: `rewardType=${template.rewardTypeId}`,
    variedProperty: template.targetKind,
    sharedFirst: true,
    optionNumbers: targets.map((_target, index) => index + 1),
    sharedPayloadKeys: [`rewardType=${template.rewardTypeId}`, `operation=${operationKey}`],
    variedPayloadKeys: targets.map((target) => `${template.targetKind}=${target.key}`),
    weight: template.targetKind === "visible_named_card_target" ? 4 : 1,
  };
}

export function oneOperationManyTargetsFill(args: ShapeFillArgs): FilledJourney {
  const candidates: Candidate[] = ONE_OPERATION_MANY_TARGETS_REWARDS.flatMap((template) => {
    if (template.stages !== undefined && !template.stages.includes(args.stage)) {
      return [];
    }

    const params = template.rollParams(args.context, args.drawContext, args.stage);
    const targets = template.targets(params, args.context);

    const candidate = { template, params, targets };

    return targets.length >= 3 && hasLateStageValue(candidate, args)
      ? [candidate]
      : [];
  });

  if (candidates.length === 0) {
    throw new Error("one_operation_many_targets fill could not find an operation with at least three targets");
  }

  const selected = weightedChoice(
    args.drawContext,
    "oomt:template",
    candidates.map((candidate) => ({
      item: candidate,
      weight: 1,
    })),
  );
  const targets = shuffleDeterministic(
    args.drawContext,
    `oomt:targets:${selected.template.id}:${selected.template.operationKey(selected.params)}`,
    selected.targets,
  ).slice(0, 3);
  const options = targets.map((target, index) =>
    optionFor(index + 1, selected.template, selected.params, target, args)
  );

  return {
    options,
    precommitted: {},
    symmetryContracts: [
      symmetryContract(
        selected.template.operationKey(selected.params),
        selected.template,
        targets,
      ),
    ],
  };
}
