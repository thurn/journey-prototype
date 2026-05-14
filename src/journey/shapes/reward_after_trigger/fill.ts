import {
  drawInt,
  shuffleDeterministic,
  weightedChoice,
  type DrawContext,
} from "../../../util/rng.js";
import type { HookTriggerSelector, JourneyOption } from "../../manifest.js";
import {
  buildJourneyOptionOperations,
  buildPrecommittedOperations,
} from "../../operationBuilders.js";
import { REWARDS } from "../../shared/rewards.js";
import type { Reward, TemplateParams } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_ID = "reward_after_trigger";
const MIN_REWARD_CEC = 40;
const STAGE_REWARD_CEILINGS = {
  early: 180,
  mid: 260,
  late: 380,
} as const;

type TriggerProfile = {
  readonly key: string;
  readonly optionPrefix: string;
  readonly triggerSelector: HookTriggerSelector;
  readonly duration: Record<string, unknown>;
  readonly expiration: Record<string, unknown>;
};

type MaterializedReward = {
  readonly template: Reward;
  readonly params: TemplateParams;
  readonly text: string;
  readonly convertedEssence: number;
};

const TRIGGERS: readonly TriggerProfile[] = [
  {
    key: "next-victory",
    optionPrefix: "After your next victory",
    triggerSelector: {
      triggerKind: "victory",
      label: "your next victory",
      count: 1,
    },
    duration: {
      durationKind: "battle_count",
      label: "next 2 battles",
      count: 2,
    },
    expiration: {
      policyKind: "forfeit_reward",
      label: "If you do not win within 2 battles, discard this hook with no reward.",
    },
  },
  {
    key: "next-dreamscape",
    optionPrefix: "At the next dreamscape",
    triggerSelector: {
      triggerKind: "dreamscape",
      label: "the next dreamscape",
      count: 1,
    },
    duration: {
      durationKind: "dreamscape_count",
      label: "next dreamscape",
      count: 1,
    },
    expiration: {
      policyKind: "forfeit_reward",
      label: "If the next dreamscape does not resolve, discard this hook with no reward.",
    },
  },
  {
    key: "future-shop",
    optionPrefix: "When you reach your next Shop",
    triggerSelector: {
      triggerKind: "site_visit",
      label: "your next Shop site",
      siteType: "Shop",
      count: 1,
    },
    duration: {
      durationKind: "dreamscape_count",
      label: "next 2 dreamscapes",
      count: 2,
    },
    expiration: {
      policyKind: "forfeit_reward",
      label: "If no Shop appears in the next 2 dreamscapes, discard this hook with no reward.",
    },
  },
  {
    key: "next-battle",
    optionPrefix: "After your next battle",
    triggerSelector: {
      triggerKind: "battle",
      label: "your next battle",
      count: 1,
    },
    duration: {
      durationKind: "battle_count",
      label: "next battle",
      count: 1,
    },
    expiration: {
      policyKind: "forfeit_reward",
      label: "If the next battle is abandoned, discard this hook with no reward.",
    },
  },
  {
    key: "next-card-draft",
    optionPrefix: "After you next draft a card",
    triggerSelector: {
      triggerKind: "card_added",
      label: "your next card draft",
      count: 1,
    },
    duration: {
      durationKind: "dreamscape_count",
      label: "next 2 dreamscapes",
      count: 2,
    },
    expiration: {
      policyKind: "forfeit_reward",
      label: "If you do not draft a card in the next 2 dreamscapes, discard this hook with no reward.",
    },
  },
  {
    key: "next-dreamsign",
    optionPrefix: "After you next gain a Dreamsign",
    triggerSelector: {
      triggerKind: "dreamsign_trigger",
      label: "your next Dreamsign gain",
      count: 1,
    },
    duration: {
      durationKind: "dreamscape_count",
      label: "next 3 dreamscapes",
      count: 3,
    },
    expiration: {
      policyKind: "forfeit_reward",
      label: "If you do not gain a Dreamsign in the next 3 dreamscapes, discard this hook with no reward.",
    },
  },
  {
    key: "spend-essence",
    optionPrefix: "After you next spend essence",
    triggerSelector: {
      triggerKind: "essence_payment",
      label: "your next essence spend",
      count: 1,
    },
    duration: {
      durationKind: "dreamscape_count",
      label: "next 2 dreamscapes",
      count: 2,
    },
    expiration: {
      policyKind: "forfeit_reward",
      label: "If you do not spend essence in the next 2 dreamscapes, discard this hook with no reward.",
    },
  },
  {
    key: "future-rest",
    optionPrefix: "When you reach your next Rest",
    triggerSelector: {
      triggerKind: "site_visit",
      label: "your next Rest site",
      siteType: "Rest",
      count: 1,
    },
    duration: {
      durationKind: "dreamscape_count",
      label: "next 2 dreamscapes",
      count: 2,
    },
    expiration: {
      policyKind: "forfeit_reward",
      label: "If no Rest appears in the next 2 dreamscapes, discard this hook with no reward.",
    },
  },
  {
    key: "future-purge",
    optionPrefix: "When you reach your next Purge",
    triggerSelector: {
      triggerKind: "site_visit",
      label: "your next Purge site",
      siteType: "Purge",
      count: 1,
    },
    duration: {
      durationKind: "dreamscape_count",
      label: "next 2 dreamscapes",
      count: 2,
    },
    expiration: {
      policyKind: "forfeit_reward",
      label: "If no Purge appears in the next 2 dreamscapes, discard this hook with no reward.",
    },
  },
];

function normalizedId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function drawFor(base: DrawContext, row: number, attempt: number): DrawContext {
  return {
    ...base,
    sequenceStep: (base.sequenceStep ?? 0) * 100 + row,
    selectionAttempt: (base.selectionAttempt ?? 0) * 1000 + attempt,
  };
}

function splitSentences(text: string): readonly string[] {
  return text
    .split(/\.\s*/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function delayedRewardClause(text: string): string {
  const parts = splitSentences(text).map((part) => lowerFirst(part));

  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]}, and ${parts[1]}`;

  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

function rewardSubIds(templateId: string, params: TemplateParams): readonly string[] {
  if (templateId !== "meta_gain_2_rewards") return [];

  return (params as { readonly subIds?: readonly string[] }).subIds ?? [];
}

function consumedRewardIds(reward: MaterializedReward): readonly string[] {
  return [reward.template.id, ...rewardSubIds(reward.template.id, reward.params)];
}

function rewardFitsShape(reward: MaterializedReward, args: ShapeFillArgs): boolean {
  if (!Number.isFinite(reward.convertedEssence)) return false;
  if (reward.convertedEssence < MIN_REWARD_CEC) return false;
  if (reward.convertedEssence > STAGE_REWARD_CEILINGS[args.stage]) return false;
  if (delayedRewardClause(reward.text).length === 0) return false;

  return true;
}

function materializeReward(
  args: ShapeFillArgs,
  optionNumber: number,
  usedRewardIds: ReadonlySet<string>,
): MaterializedReward {
  const candidates: Array<{ readonly reward: MaterializedReward; readonly weight: number }> = [];

  for (const template of REWARDS) {
    const params = template.rollParams(
      args.context,
      drawFor(args.drawContext, optionNumber, template.id.length),
    ) as TemplateParams;

    if (!template.viable(params as never, args.context)) continue;
    if (rewardSubIds(template.id, params).some((id) => usedRewardIds.has(id))) continue;
    if (usedRewardIds.has(template.id)) continue;

    const reward = {
      template,
      params,
      text: template.render(params as never, args.context),
      convertedEssence: template.cec(params as never, args.context),
    };

    if (!rewardFitsShape(reward, args)) continue;

    candidates.push({
      reward,
      weight: template.weight,
    });
  }

  if (candidates.length === 0) {
    throw new Error(`${SHAPE_ID} fill could not roll a viable shared reward for option ${optionNumber}`);
  }

  return weightedChoice(
    args.drawContext,
    `${SHAPE_ID}:reward:${optionNumber}`,
    candidates.map((candidate) => ({
      item: candidate.reward,
      weight: candidate.weight,
    })),
  );
}

function delayedHook(args: {
  readonly optionNumber: number;
  readonly trigger: TriggerProfile;
  readonly reward: MaterializedReward;
}): Record<string, unknown> {
  const rewardLabel = delayedRewardClause(args.reward.text);
  const reward = {
    kind: "shared_reward_template",
    templateId: args.reward.template.id,
    params: args.reward.params,
    text: args.reward.text,
    timing: "delayed",
    convertedEssence: args.reward.convertedEssence,
  };

  return {
    kind: "delayed_hook_contract",
    hookId: normalizedId(`${SHAPE_ID}-${args.optionNumber}-${args.trigger.key}-${args.reward.template.id}`),
    optionNumber: args.optionNumber,
    trigger: String(args.trigger.triggerSelector.label).toLowerCase(),
    triggerSelector: args.trigger.triggerSelector,
    trackedCondition: `Track ${String(args.trigger.triggerSelector.label).toLowerCase()} for option ${args.optionNumber}.`,
    resolution: `${args.trigger.optionPrefix}, ${rewardLabel}.`,
    expiration: args.trigger.expiration,
    duration: args.trigger.duration,
    controlledScene: {
      sceneKind: "reward",
      label: rewardLabel,
    },
    visibilityPolicy: {
      outcomeVisibility: "visible",
      disclosure: "The delayed trigger, expiration window, and committed reward are shown before choosing.",
    },
    reward: [reward],
    hookBudgetCost: 1,
    sourceShapeId: SHAPE_ID,
    timingKey: args.trigger.key,
    rewardMetadata: {
      rewardKey: args.reward.template.id,
      consumedRewardKeys: consumedRewardIds(args.reward),
      expectedConvertedEssence: args.reward.convertedEssence,
    },
  };
}

function optionFor(args: {
  readonly optionNumber: number;
  readonly trigger: TriggerProfile;
  readonly reward: MaterializedReward;
}): { readonly option: JourneyOption; readonly precommit: Record<string, unknown> } {
  const precommit = delayedHook(args);
  const built = {
    number: args.optionNumber,
    symbols: ["trigger", "delayed", "reward"],
    text: `${args.trigger.optionPrefix}, ${delayedRewardClause(args.reward.text)}.`,
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [precommit],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence: args.reward.convertedEssence,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: args.reward.convertedEssence,
    pickBehavior: "record_and_generate_next" as const,
  };

  return {
    option: {
      ...built,
      operations: buildJourneyOptionOperations(built),
    },
    precommit,
  };
}

export function rewardAfterTriggerFill(args: ShapeFillArgs): FilledJourney {
  const triggerOrder = shuffleDeterministic(
    args.drawContext,
    `${SHAPE_ID}:trigger-order`,
    TRIGGERS,
  );
  const start = drawInt(args.drawContext, `${SHAPE_ID}:trigger-start`, 0, triggerOrder.length - 1);
  const selectedTriggers = [
    triggerOrder[start]!,
    triggerOrder[(start + 1) % triggerOrder.length]!,
  ];
  const usedRewardIds = new Set<string>();
  const rows = selectedTriggers.map((trigger, index) => {
    const reward = materializeReward(args, index + 1, usedRewardIds);

    for (const id of consumedRewardIds(reward)) {
      usedRewardIds.add(id);
    }

    return optionFor({
      optionNumber: index + 1,
      trigger,
      reward,
    });
  });

  const precommitted = {
    delayed: rows.map((row) => row.precommit),
  };

  return {
    options: rows.map((row) => row.option),
    precommitted: {
      ...precommitted,
      operations: buildPrecommittedOperations(precommitted),
    },
  };
}
