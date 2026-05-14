import type { JourneyContext } from "../../../quest/context.js";
import type { DrawContext } from "../../../util/rng.js";
import type { JourneyOption, JourneyStage } from "../../manifest.js";
import { COSTS } from "../../shared/costs.js";
import { REWARDS } from "../../shared/rewards.js";
import type { Cost, Reward, TemplateParams } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const SHAPE_ID = "single_offer";

const STAGE_OFFER_BANDS: Record<
  JourneyStage,
  {
    readonly minimumNet: number;
    readonly targetNet: number;
    readonly maximumNet: number;
  }
> = {
  early: { minimumNet: 20, targetNet: 95, maximumNet: 190 },
  mid: { minimumNet: -20, targetNet: 90, maximumNet: 170 },
  late: { minimumNet: -40, targetNet: 130, maximumNet: 180 },
};

const REWARD_IDS = new Set([
  "gain_essence",
  "gain_omens",
  "set_essence_to_percent_of_max",
  "gain_essence_to_max",
  "gain_named_card",
  "gain_named_dreamsign",
  "duplicate_named_card_X",
  "duplicate_chosen_cards",
  "transform_starter_into_named_card",
  "transform_dreamsign_to_named",
  "next_X_shop_rerolls_free",
  "shop_essence_discount",
  "shop_omen_discount",
]);

const COST_IDS = new Set([
  "pay_essence",
  "pay_omens",
  "pay_percent_essence",
  "purge_named_card",
  "purge_named_dreamsign",
  "gain_named_banes",
  "lose_max_essence",
]);

type MaterializedReward = {
  readonly template: Reward;
  readonly params: TemplateParams;
  readonly text: string;
  readonly convertedEssence: number;
};

type MaterializedCost = {
  readonly template: Cost;
  readonly params: TemplateParams;
  readonly text: string;
  readonly convertedEssence: number;
};

type OfferCandidate = {
  readonly cost: MaterializedCost;
  readonly reward: MaterializedReward;
  readonly net: number;
  readonly distanceFromTarget: number;
  readonly downside: number;
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

  if (/\b(?:Draft \d|Choose 1 of|random|chosen Starter)\b/iu.test(text)) {
    return undefined;
  }

  return {
    template,
    params,
    text,
    convertedEssence: template.cec(params as never, context),
  };
}

function materializeCost(
  context: JourneyContext,
  drawContext: DrawContext,
  template: Cost,
  attempt: number,
): MaterializedCost | undefined {
  if (!COST_IDS.has(template.id)) {
    return undefined;
  }

  const params = template.rollParams(context, drawFor(drawContext, template.id, attempt));

  if (!template.viable(params as never, context)) {
    return undefined;
  }

  const text = template.render(params as never, context);

  if (text.startsWith("[LOCKED] ")) {
    return undefined;
  }

  return {
    template,
    params,
    text,
    convertedEssence: template.cec(params as never, context),
  };
}

function rewardWithRealizableEssence(
  reward: MaterializedReward,
  cost: MaterializedCost,
  context: JourneyContext,
): MaterializedReward {
  if (reward.template.id !== "gain_essence") {
    return reward;
  }

  const amount = reward.params.x;

  if (typeof amount !== "number") {
    return reward;
  }

  const resources = context.state.quest.resources;
  const availableAfterCost =
    cost.template.id === "pay_essence" && typeof cost.params.x === "number"
      ? Math.max(0, resources.essence - cost.params.x)
      : resources.essence;
  const realizableAmount = Math.max(
    0,
    Math.min(amount, resources.maxEssence - availableAfterCost),
  );

  if (realizableAmount === amount) {
    return reward;
  }

  return {
    ...reward,
    params: { ...reward.params, x: realizableAmount, rawAmount: amount },
    text: `Gain ${realizableAmount} essence`,
    convertedEssence: realizableAmount,
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

function costPayload(cost: MaterializedCost) {
  return {
    kind: "shared_cost_template",
    templateId: cost.template.id,
    params: cost.params,
    text: cost.text,
    convertedEssence: cost.convertedEssence,
  };
}

function offerOption(
  cost: MaterializedCost,
  reward: MaterializedReward,
): JourneyOption {
  return {
    number: 1,
    symbols: ["cost", "reward", "offer"],
    text: `${sentence(cost.text)} ${sentence(reward.text)}`,
    operations: [],
    costs: [costPayload(cost)],
    effects: [rewardPayload(reward)],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: cost.convertedEssence,
    effectConvertedEssence: reward.convertedEssence,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: reward.convertedEssence - cost.convertedEssence,
    pickBehavior: "record_and_generate_next",
  };
}

function chooseViableOffer(args: {
  readonly costs: readonly MaterializedCost[];
  readonly rewards: readonly MaterializedReward[];
  readonly context: JourneyContext;
  readonly stage: JourneyStage;
}): { cost: MaterializedCost; reward: MaterializedReward } {
  const band = STAGE_OFFER_BANDS[args.stage];
  const candidates: OfferCandidate[] = [];
  const fallbackCandidates: OfferCandidate[] = [];

  for (const reward of args.rewards) {
    for (const cost of args.costs) {
      const adjustedReward = rewardWithRealizableEssence(
        reward,
        cost,
        args.context,
      );
      const net = adjustedReward.convertedEssence - cost.convertedEssence;
      const candidate = {
        cost,
        reward: adjustedReward,
        net,
        distanceFromTarget: Math.abs(net - band.targetNet),
        downside: cost.convertedEssence,
      };

      fallbackCandidates.push(candidate);

      if (
        net >= band.minimumNet &&
        net <= band.maximumNet &&
        candidate.downside > 0
      ) {
        candidates.push(candidate);
      }
    }
  }

  const sortedCandidates = [
    ...(candidates.length > 0 ? candidates : fallbackCandidates),
  ].sort((left, right) =>
    left.distanceFromTarget - right.distanceFromTarget ||
    right.downside - left.downside ||
    left.net - right.net
  );
  const best = sortedCandidates[0];

  if (!best) {
    throw new Error(`${SHAPE_ID} fill could not roll a viable offer`);
  }

  return { cost: best.cost, reward: best.reward };
}

export function singleOfferFill(args: ShapeFillArgs): FilledJourney {
  const rewards = REWARDS.flatMap((template, index) => {
    const reward = materializeReward(
      args.context,
      args.drawContext,
      template,
      index,
    );

    return reward ? [reward] : [];
  });
  const costs = COSTS.flatMap((template, index) => {
    const cost = materializeCost(args.context, args.drawContext, template, index);

    return cost ? [cost] : [];
  });
  const offer = chooseViableOffer({
    costs,
    rewards,
    context: args.context,
    stage: args.stage,
  });

  return {
    options: [offerOption(offer.cost, offer.reward)],
    precommitted: {},
  };
}
