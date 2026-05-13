import { drawInt } from "../../../util/rng.js";
import type { JourneyContext } from "../../../quest/context.js";
import type { DrawContext } from "../../../util/rng.js";
import type { JourneyOption } from "../../manifest.js";
import { REWARDS } from "../../shared/rewards.js";
import type { Reward, TemplateParams } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_LABEL = "single_reward";
const REWARD_IDS = new Set([
  "gain_essence",
  "gain_omens",
  "gain_named_card",
  "gain_named_dreamsign",
]);

type MaterializedReward = {
  readonly template: Reward;
  readonly params: TemplateParams;
  readonly text: string;
  readonly convertedEssence: number;
};

function drawFor(
  drawContext: DrawContext,
  templateId: string,
  attempt: number,
): DrawContext {
  return {
    ...drawContext,
    selectionAttempt:
      ((drawContext.selectionAttempt ?? 0) * 1000) +
      attempt * 100 +
      templateId.length,
  };
}

function sentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

function materializeReward(
  context: JourneyContext,
  drawContext: DrawContext,
  template: Reward,
  attempt: number,
): MaterializedReward | undefined {
  if (!REWARD_IDS.has(template.id)) {
    return undefined;
  }

  const params = template.rollParams(context, drawFor(drawContext, template.id, attempt));

  if (!template.viable(params as never, context)) {
    return undefined;
  }

  const text = template.render(params as never, context);

  if (/\b(?:Draft|Choose|random)\b/iu.test(text)) {
    return undefined;
  }

  return {
    template,
    params,
    text,
    convertedEssence: template.cec(params as never, context),
  };
}

function rewardPayload(reward: MaterializedReward) {
  return {
    kind: "shared_reward_template",
    templateId: reward.template.id,
    params: reward.params,
    text: reward.text,
    convertedEssence: reward.convertedEssence,
  };
}

function rewardOption(reward: MaterializedReward): JourneyOption {
  return {
    number: 1,
    symbols: ["reward", "boon"],
    text: sentence(reward.text),
    operations: [],
    costs: [],
    effects: [rewardPayload(reward)],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence: reward.convertedEssence,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: reward.convertedEssence,
    pickBehavior: "record_and_generate_next",
  };
}

export function singleRewardFill(args: ShapeFillArgs): FilledJourney {
  const rewards = REWARDS.flatMap((template, index) => {
    const reward = materializeReward(
      args.context,
      args.drawContext,
      template,
      index,
    );

    return reward ? [reward] : [];
  });

  if (rewards.length === 0) {
    throw new Error(`${SHAPE_LABEL} fill could not find a visible shared reward`);
  }

  const selected = rewards[
    drawInt(
      args.drawContext,
      `${SHAPE_LABEL}:selected-visible-boon`,
      0,
      rewards.length - 1,
    )
  ]!;

  return {
    options: [rewardOption(selected)],
    precommitted: {},
  };
}
