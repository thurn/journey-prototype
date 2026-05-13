import { drawInt, shuffleDeterministic } from "../../../util/rng.js";
import type { JourneyOption } from "../../manifest.js";
import {
  buildJourneyOptionOperations,
  buildPrecommittedOperations,
} from "../../operationBuilders.js";
import { getReward } from "../../shared/rewards.js";
import type { TemplateParams } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_ID = "reward_after_trigger";

type TriggerProfile = {
  readonly key: string;
  readonly optionPrefix: string;
  readonly triggerSelector: Record<string, unknown>;
  readonly duration: Record<string, unknown>;
  readonly expiration: Record<string, unknown>;
};

type MaterializedReward = {
  readonly templateId: "gain_essence" | "gain_omens";
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
];

function normalizedId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function materializeReward(
  args: ShapeFillArgs,
  optionNumber: number,
): MaterializedReward {
  const templateId = optionNumber === 1 ? "gain_essence" : "gain_omens";
  const template = getReward(templateId);
  const params = template.rollParams(args.context, {
    ...args.drawContext,
    selectionAttempt:
      (args.drawContext.selectionAttempt ?? 0) * 100 + optionNumber,
  }) as TemplateParams;

  return {
    templateId,
    params,
    text: template.render(params as never, args.context),
    convertedEssence: template.cec(params as never, args.context),
  };
}

function delayedHook(args: {
  readonly optionNumber: number;
  readonly trigger: TriggerProfile;
  readonly reward: MaterializedReward;
}): Record<string, unknown> {
  const rewardLabel = lowerFirst(args.reward.text).replace(/\.$/u, "");
  const reward = {
    kind: "shared_reward_template",
    templateId: args.reward.templateId,
    params: args.reward.params,
    text: args.reward.text,
    timing: "delayed",
    convertedEssence: args.reward.convertedEssence,
  };

  return {
    kind: "delayed_hook_contract",
    hookId: normalizedId(`${SHAPE_ID}-${args.optionNumber}-${args.trigger.key}-${args.reward.templateId}`),
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
      rewardKey: args.reward.templateId,
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
    text: `${args.trigger.optionPrefix}, ${lowerFirst(args.reward.text)}.`,
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
  const rows = selectedTriggers.map((trigger, index) =>
    optionFor({
      optionNumber: index + 1,
      trigger,
      reward: materializeReward(args, index + 1),
    })
  );

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
