import { drawInt, shuffleDeterministic } from "../../../util/rng.js";
import type {
  JourneyOption,
  JourneyStage,
  JourneySymmetryContractDebug,
} from "../../manifest.js";
import { adaptJourneyOptionOperations } from "../../operationAdapters.js";
import { BANE_NAMES } from "../../shared/content.js";
import { getReward } from "../../shared/rewards.js";
import type { TemplateParams } from "../../shared/types.js";
import { valueBaneGain, valueOmenGain } from "../../value.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_LABEL = "shared_prefix_menu";
const OPTION_COUNT = 3;
const BANE_PREFIX_OMEN_BONUS: Record<JourneyStage, number> = {
  early: 0,
  mid: 1,
  late: 2,
};
const REWARD_IDS = [
  "gain_essence",
  "gain_omens",
  "increase_max_essence",
  "next_X_shop_rerolls_free",
  "shop_essence_discount",
] as const;

type SharedPrefixRewardId = (typeof REWARD_IDS)[number];

type MaterializedReward = {
  readonly templateId: SharedPrefixRewardId;
  readonly params: TemplateParams;
  readonly text: string;
  readonly convertedEssence: number;
};

function countText(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function materializeReward(args: ShapeFillArgs, templateId: SharedPrefixRewardId): MaterializedReward {
  const template = getReward(templateId);
  const params = template.rollParams(args.context, {
    ...args.drawContext,
    selectionAttempt:
      (args.drawContext.selectionAttempt ?? 0) * 100 + templateId.length,
  }) as TemplateParams;

  if (!template.viable(params as never, args.context)) {
    throw new Error(`${SHAPE_LABEL} reward ${templateId} is not viable`);
  }

  return {
    templateId,
    params,
    text: template.render(params as never, args.context),
    convertedEssence: template.cec(params as never, args.context),
  };
}

function selectedRewards(args: ShapeFillArgs): readonly MaterializedReward[] {
  return shuffleDeterministic(
    args.drawContext,
    `${SHAPE_LABEL}:reward-order`,
    REWARD_IDS,
  )
    .slice(0, OPTION_COUNT)
    .map((templateId) => materializeReward(args, templateId));
}

function optionFor(args: {
  readonly number: number;
  readonly stage: JourneyStage;
  readonly baneName: (typeof BANE_NAMES)[number];
  readonly reward: MaterializedReward;
}): JourneyOption {
  const bane = {
    kind: "bane_gain",
    baneName: args.baneName,
    count: 1,
    timing: "immediate",
    source: SHAPE_LABEL,
  };
  const omenBonus = BANE_PREFIX_OMEN_BONUS[args.stage];
  const rewardPayload = {
    kind: "shared_reward_template",
    templateId: args.reward.templateId,
    params: args.reward.params,
    text: args.reward.text,
    convertedEssence: args.reward.convertedEssence,
  };
  const effects = omenBonus > 0
    ? [
        rewardPayload,
        { kind: "gain_omens", amount: omenBonus, timing: "immediate" },
      ]
    : [rewardPayload];
  const effectConvertedEssence =
    Math.max(340, args.reward.convertedEssence) +
    (omenBonus > 0 ? valueOmenGain(omenBonus) : 0);
  const burdenConvertedEssence = valueBaneGain(args.baneName, 1);
  const bonusText = omenBonus > 0
    ? ` Gain ${countText(omenBonus, "omen")}.`
    : "";
  const built = {
    number: args.number,
    symbols: ["burden", "reward", "prefix"],
    text: `Gain 1 ${args.baneName} Bane. ${args.reward.text}.${bonusText}`,
    operations: [],
    costs: [],
    effects,
    burdens: [bane],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence,
    burdenConvertedEssence,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: effectConvertedEssence + burdenConvertedEssence,
    pickBehavior: "record_and_generate_next" as const,
  };

  return {
    ...built,
    operations: adaptJourneyOptionOperations(built),
  };
}

function symmetryContract(
  options: readonly JourneyOption[],
): JourneySymmetryContractDebug {
  return {
    contractKind: "shared_burden_different_rewards",
    sharedProperty: "bane_prefix",
    variedProperty: "reward",
    sharedFirst: true,
    optionNumbers: options.map((option) => option.number),
    sharedPayloadKeys: ["bane_gain"],
    variedPayloadKeys: options.map((option) =>
      String((option.effects[0] as { readonly templateId?: string }).templateId ?? "reward")
    ),
  };
}

export function sharedPrefixMenuFill(args: ShapeFillArgs): FilledJourney {
  const baneName = BANE_NAMES[
    drawInt(args.drawContext, `${SHAPE_LABEL}:bane`, 0, BANE_NAMES.length - 1)
  ]!;
  const options = selectedRewards(args).map((reward, index) =>
    optionFor({
      number: index + 1,
      stage: args.stage,
      baneName,
      reward,
    })
  );

  return {
    options,
    precommitted: {},
    symmetryContracts: [symmetryContract(options)],
  };
}
