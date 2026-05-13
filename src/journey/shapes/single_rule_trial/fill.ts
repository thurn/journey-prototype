import { statusPayload } from "../../fillers/environmentPayloads.js";
import {
  DREAMSIGN_POOL_TARGET_DESCRIPTION,
  dreamsignDraft,
  gainEssence,
  option,
  pickSequentialVariant,
  target,
} from "../../fillers/shared.js";
import {
  DREAMWELL_VALUE_CONSTANTS,
  valueEssenceGain,
  valueStatusRuleMutation,
} from "../../value.js";
import type { JourneyStage } from "../../manifest.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_LABEL = "single_rule_trial";

type RuleTrial = {
  text: string;
  effects: unknown[];
  targets?: unknown[];
  effect: number;
  uncertainty?: number;
};

type RuleTrialBuilder = (args: ShapeFillArgs) => RuleTrial;

const STAGE_DREAMSIGN_DRAFT_COUNTS = {
  early: [2] as const,
  mid: [2, 3] as const,
  late: [3] as const,
} satisfies Record<JourneyStage, readonly number[]>;

const STAGE_ESSENCE_AMOUNTS = {
  early: [160, 180] as const,
  mid: [220, 240] as const,
  late: [260, 300] as const,
} satisfies Record<JourneyStage, readonly number[]>;

function stageMultiplier(stage: JourneyStage): number {
  switch (stage) {
    case "early":
      return 0.8;
    case "mid":
      return 1;
    case "late":
      return 1.15;
    default:
      return 1;
  }
}

function stagedValue(base: number, stage: JourneyStage): number {
  return Math.round((base * stageMultiplier(stage)) / 5) * 5;
}

function dreamsignRewardReplacement(args: ShapeFillArgs): RuleTrial {
  const { drawContext, stage } = args;
  const dreamsignChoiceCount = pickSequentialVariant(
    drawContext,
    `${SHAPE_LABEL}:replacement-dreamsign-choice`,
    STAGE_DREAMSIGN_DRAFT_COUNTS[stage],
  );
  const dreamsignReplacement = dreamsignDraft(dreamsignChoiceCount);

  return {
    text: `Your next victory yields a ${dreamsignChoiceCount}-Dreamsign draft instead of card rewards.`,
    effects: [
      statusPayload({
        kind: "status_reward_replacement",
        statusName: "Spoiled Victory",
        statusScope: "reward",
        duration: "one_time",
        ruleMutationKind: "next_victory_reward_replacement",
        rewardTrigger: "next_victory",
        replacedRewardKind: "card_rewards",
        replacement: `${dreamsignChoiceCount}-Dreamsign draft`,
        replacementKind: "dreamsign_draft",
        replacementPayload: dreamsignReplacement,
      }),
    ],
    targets: [
      target(
        "dreamsign",
        DREAMSIGN_POOL_TARGET_DESCRIPTION,
        dreamsignReplacement.predicate,
      ),
    ],
    effect: stagedValue(
      valueStatusRuleMutation("next_victory_reward_replacement"),
      stage,
    ),
    uncertainty: -8,
  };
}

function essenceRewardReplacement(args: ShapeFillArgs): RuleTrial {
  const { context, drawContext, stage } = args;
  const essenceAmount = pickSequentialVariant(
    drawContext,
    `${SHAPE_LABEL}:replacement-essence`,
    STAGE_ESSENCE_AMOUNTS[stage],
  );

  return {
    text: `Your next victory yields ${essenceAmount} essence instead of card rewards.`,
    effects: [
      statusPayload({
        kind: "status_reward_replacement",
        statusName: "Spoiled Victory",
        statusScope: "reward",
        duration: "one_time",
        ruleMutationKind: "next_victory_reward_replacement",
        rewardTrigger: "next_victory",
        replacedRewardKind: "card_rewards",
        replacement: `${essenceAmount} essence`,
        replacementKind: "resource",
        replacementPayload: gainEssence(essenceAmount),
        resource: "essence",
        amount: essenceAmount,
      }),
    ],
    effect: Math.max(
      stagedValue(
        valueStatusRuleMutation("next_victory_reward_replacement"),
        stage,
      ),
      valueEssenceGain(essenceAmount, context),
    ),
    uncertainty: -8,
  };
}

function dreamwellOpeningRule(args: ShapeFillArgs): RuleTrial {
  const { stage } = args;
  const battleCount = stage === "early" ? 1 : stage === "mid" ? 2 : 3;
  const battleWindow = battleCount === 1
    ? "your next battle"
    : `the next ${battleCount} battles`;

  return {
    text:
      `For ${battleWindow}, your first Dreamwell draw produces 1 additional energy.`,
    effects: [
      statusPayload({
        kind: "status_dreamwell_rule",
        statusName: "Bright First Draw",
        statusScope: "dreamwell",
        duration: "one_time",
        ruleMutationKind: "first_draw_energy_bonus",
        dreamwellRuleKind: "first_draw_energy",
        amount: 1,
      }),
    ],
    effect: stagedValue(DREAMWELL_VALUE_CONSTANTS.firstDrawEnergy, stage),
  };
}

function shopRerollRule(args: ShapeFillArgs): RuleTrial {
  const { stage } = args;
  const durationText = stage === "early"
    ? "next 2 dreamscapes"
    : "next 3 dreamscapes";

  return {
    text: `For the ${durationText}, shop rerolls cost at most 1 omen.`,
    effects: [
      statusPayload({
        kind: "status_shop_rule",
        statusName: "Shop Treaty",
        statusScope: "shop",
        duration: "one_time",
        ruleMutationKind: "reroll_omen_cap",
        cappedAction: "reroll",
        rerollOmenCap: 1,
      }),
    ],
    effect: stagedValue(145, stage),
  };
}

function battleOpeningRule(args: ShapeFillArgs): RuleTrial {
  const { stage } = args;
  const battleCount = stage === "late" ? 3 : 2;

  return {
    text:
      `For the next ${battleCount} battles, draw 1 additional card in your opening hand.`,
    effects: [
      statusPayload({
        kind: "status_battle_rule",
        statusName: "Prepared Opening",
        statusScope: "battle",
        duration: "one_time",
        ruleMutationKind: "opening_hand_bonus",
        affectedPlayer: "you",
        amount: 1,
      }),
    ],
    effect: stagedValue(120, stage),
  };
}

const RULE_TRIALS_BY_STAGE = {
  early: [
    dreamsignRewardReplacement,
    essenceRewardReplacement,
    dreamwellOpeningRule,
    battleOpeningRule,
  ],
  mid: [
    dreamsignRewardReplacement,
    essenceRewardReplacement,
    dreamwellOpeningRule,
    shopRerollRule,
    battleOpeningRule,
  ],
  late: [
    dreamsignRewardReplacement,
    essenceRewardReplacement,
    dreamwellOpeningRule,
    shopRerollRule,
    battleOpeningRule,
  ],
} satisfies Record<JourneyStage, readonly RuleTrialBuilder[]>;

export function singleRuleTrialFill(args: ShapeFillArgs): FilledJourney {
  const { drawContext, stage } = args;
  const trialBuilder = pickSequentialVariant(
    drawContext,
    `${SHAPE_LABEL}:trial`,
    RULE_TRIALS_BY_STAGE[stage],
  );
  const trial = trialBuilder(args);

  return {
    options: [
      option({
        number: 1,
        text: trial.text,
        effects: trial.effects,
        targets: trial.targets,
        effect: trial.effect,
        uncertainty: trial.uncertainty,
      }),
    ],
    precommitted: {},
  };
}
