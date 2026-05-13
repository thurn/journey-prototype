import type { JourneyContext } from "../../../quest/context.js";
import type { DrawContext } from "../../../util/rng.js";
import { treeBuilderTools } from "../../fillers/shared.js";
import {
  createTreePrimitives,
  tree,
  treeBranch,
} from "../../fillers/treeBuilders.js";
import type { JourneyStage, JourneyTree } from "../../manifest.js";
import { valueOmenGain } from "../../value.js";

type EscalatingReward = {
  readonly text: string;
  readonly effects: unknown[];
  readonly targets?: unknown[];
  readonly effect: number;
};

const REWARD_FAMILIES = [
  "essence",
  "omens",
  "card_draft",
  "dreamsign_draft",
] as const;

const STAGE_OMEN_BONUS: Record<JourneyStage, readonly number[]> = {
  early: [0, 1, 2],
  mid: [1, 2, 3],
  late: [2, 3, 4],
};

const STAGE_PATH_MARGIN: Record<JourneyStage, number> = {
  early: 15,
  mid: 60,
  late: 80,
};

const COST_SHARES = [0.2, 0.3, 0.5] as const;

function withoutFinalPeriod(text: string): string {
  return text.replace(/\.$/u, "");
}

function stripOmenBonusText(text: string): string {
  return text
    .replace(/\s+Gain \d+ omens?\.?$/u, "")
    .replace(/\s+and gain \d+ omens?\.?$/u, "")
    .trim();
}

function omenText(amount: number): string {
  return `${amount} ${amount === 1 ? "omen" : "omens"}`;
}

function isGainOmenPayload(effect: unknown): effect is { amount: number } {
  return (
    typeof effect === "object" &&
    effect !== null &&
    "kind" in effect &&
    effect.kind === "gain_omens" &&
    "amount" in effect &&
    typeof effect.amount === "number"
  );
}

function roundDownToFive(amount: number): number {
  return Math.floor(amount / 5) * 5;
}

function addOmenBonus(
  reward: EscalatingReward,
  omenBonus: number,
): EscalatingReward {
  if (omenBonus <= 0) {
    return reward;
  }

  const { gainOmen } = treeBuilderTools;
  const primaryEffect = reward.effects[0];
  const existingOmenIndex = reward.effects.findIndex(isGainOmenPayload);

  if (isGainOmenPayload(primaryEffect)) {
    const amount = primaryEffect.amount + omenBonus;

    return {
      ...reward,
      text: `gain ${omenText(amount)}.`,
      effects: [gainOmen(amount), ...reward.effects.slice(1)],
      effect: reward.effect + valueOmenGain(omenBonus),
    };
  }

  if (existingOmenIndex >= 0) {
    const existingOmen = reward.effects[existingOmenIndex] as { amount: number };
    const amount = existingOmen.amount + omenBonus;
    const effects = reward.effects.filter(
      (effect, index) => index !== existingOmenIndex && !isGainOmenPayload(effect),
    );

    return {
      ...reward,
      text: `${withoutFinalPeriod(stripOmenBonusText(reward.text))}. Gain ${omenText(amount)}.`,
      effects: [...effects, gainOmen(amount)],
      effect: reward.effect + valueOmenGain(omenBonus),
    };
  }

  return {
    ...reward,
    text: `${withoutFinalPeriod(reward.text)}. Gain ${omenText(omenBonus)}.`,
    effects: [...reward.effects, gainOmen(omenBonus)],
    effect: reward.effect + valueOmenGain(omenBonus),
  };
}

function rewardForStageAndLevel(
  reward: EscalatingReward,
  stage: JourneyStage,
  levelIndex: number,
): EscalatingReward {
  return addOmenBonus(reward, STAGE_OMEN_BONUS[stage][levelIndex]!);
}

function enforceRewardProgression(
  rewards: readonly EscalatingReward[],
): EscalatingReward[] {
  const minimumStep = 25;

  return rewards.reduce<EscalatingReward[]>((progression, reward) => {
    const previous = progression[progression.length - 1];
    const minimumValue = previous
      ? previous.effect + minimumStep
      : reward.effect;
    let adjusted = reward;

    if (adjusted.effect < minimumValue) {
      const extraOmens = Math.ceil(
        (minimumValue - adjusted.effect) / valueOmenGain(1),
      );
      adjusted = addOmenBonus(adjusted, extraOmens);
    }

    progression.push(adjusted);

    return progression;
  }, []);
}

function chainPathBudget(
  context: JourneyContext,
  stage: JourneyStage,
): number {
  return Math.max(
    15,
    context.state.quest.resources.essence - STAGE_PATH_MARGIN[stage],
  );
}

function takeCosts(
  context: JourneyContext,
  stage: JourneyStage,
  rewards: readonly EscalatingReward[],
): number[] {
  const pathBudget = chainPathBudget(context, stage);

  return rewards.reduce<number[]>((costs, reward, index) => {
    const rewardCeiling = Math.max(5, roundDownToFive(reward.effect - 20));
    const budgetTarget = roundDownToFive(pathBudget * COST_SHARES[index]!);
    const progressionFloor = costs[index - 1] === undefined
      ? 5
      : costs[index - 1]! + 5;
    const price = Math.min(
      rewardCeiling,
      Math.max(progressionFloor, budgetTarget, 5),
    );

    costs.push(price);

    return costs;
  }, []);
}

export function buildEscalatingRewardChainTree(
  context: JourneyContext,
  drawContext: DrawContext,
  stage: JourneyStage,
): JourneyTree {
  const { treeRewardFamily } = createTreePrimitives(treeBuilderTools);
  const { cost } = treeBuilderTools;
  const profile = {
    rewards: enforceRewardProgression(
      treeRewardFamily(
        context,
        drawContext,
        "escalating-chain:reward-family",
        3,
        REWARD_FAMILIES,
      ).rewards.map((reward, index) =>
        rewardForStageAndLevel(reward, stage, index),
      ),
    ),
  };
  const costs = takeCosts(context, stage, profile.rewards);

  return tree(
    profile.rewards.map((reward, index) => {
      const level = index + 1;
      const price = costs[index]!;
      const isFinal = level === profile.rewards.length;

      return {
        id: `level-${level}`,
        levelLabel: `Level ${level}`,
        branches: [
          treeBranch({
            id: `level-${level}-stop`,
            label: "Stop",
            text: "Leave.",
            terminal: {
              text: "Leave.",
              outcome: "leave",
              costs: [],
              effects: [],
              burdens: [],
              targets: [],
              routeEffects: [],
            },
          }),
          treeBranch({
            id: `level-${level}-take`,
            label: "Take",
            text: `Pay ${price} essence and ${reward.text} ${isFinal ? "End the Journey." : `Go to Level ${level + 1}.`}`,
            costs: [cost("essence", price)],
            effects: reward.effects,
            targets: reward.targets ?? [],
            cost: price,
            effect: reward.effect,
            ...(isFinal
              ? {
                  terminal: {
                    text: "End the Journey.",
                    outcome: "claim" as const,
                    costs: [cost("essence", price)],
                    effects: reward.effects,
                    burdens: [],
                    targets: reward.targets ?? [],
                    routeEffects: [],
                  },
                }
              : { nextNodeId: `level-${level + 1}` }),
          }),
        ],
      };
    }),
  );
}
