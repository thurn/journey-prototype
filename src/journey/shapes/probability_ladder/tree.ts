import type { JourneyContext } from "../../../quest/context.js";
import type { DrawContext } from "../../../util/rng.js";
import { treeBuilderTools } from "../../fillers/shared.js";
import {
  createTreePrimitives,
  odds,
  tree,
  treeBranch,
} from "../../fillers/treeBuilders.js";
import type { JourneyStage, JourneyTree } from "../../manifest.js";
import { valueOmenGain } from "../../value.js";

type ProbabilityLadderReward = {
  readonly text: string;
  readonly effects: unknown[];
  readonly targets?: unknown[];
  readonly effect: number;
};

const REWARD_FAMILIES = [
  "essence",
  "omens",
  "dreamsign_draft",
  "starter_cleanup",
  "transfiguration",
] as const;

const STAGE_OMEN_BONUS: Record<JourneyStage, readonly number[]> = {
  early: [1, 2, 3, 4],
  mid: [2, 3, 4, 5],
  late: [3, 4, 5, 6],
};

function chanceProgression(
  drawContext: DrawContext,
  label: string,
  levels: number,
): number[] {
  const { pickSequentialVariant } = treeBuilderTools;
  const start = pickSequentialVariant(
    drawContext,
    `${label}:start`,
    [25, 30, 35],
  );
  const step = pickSequentialVariant(drawContext, `${label}:step`, [15, 20]);
  const ceiling = 95;

  return Array.from({ length: levels }, (_entry, index) =>
    Math.min(ceiling, start + step * index),
  );
}

function withoutFinalPeriod(text: string): string {
  return text.replace(/\.$/u, "");
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

function enhanceRewardForLevel(
  reward: ProbabilityLadderReward,
  stage: JourneyStage,
  levelIndex: number,
): ProbabilityLadderReward {
  const omenBonus = STAGE_OMEN_BONUS[stage][levelIndex]!;

  return addOmenBonus(reward, omenBonus);
}

function addOmenBonus(
  reward: ProbabilityLadderReward,
  omenBonus: number,
): ProbabilityLadderReward {
  const { gainOmen } = treeBuilderTools;
  const primaryEffect = reward.effects[0];

  if (isGainOmenPayload(primaryEffect)) {
    const amount = primaryEffect.amount + omenBonus;

    return {
      ...reward,
      text: `gain ${omenText(amount)}.`,
      effects: [gainOmen(amount), ...reward.effects.slice(1)],
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

function enforceRewardProgression(
  rewards: readonly ProbabilityLadderReward[],
): ProbabilityLadderReward[] {
  const minimumStep = 25;

  return rewards.reduce<ProbabilityLadderReward[]>((progression, reward) => {
    const previous = progression[progression.length - 1];
    const minimumValue = previous
      ? previous.effect + minimumStep
      : reward.effect;
    let adjusted = reward;

    if (adjusted.effect < minimumValue) {
      const omenUnit = valueOmenGain(1);
      const extraOmens = Math.ceil((minimumValue - adjusted.effect) / omenUnit);
      adjusted = addOmenBonus(adjusted, extraOmens);
    }

    progression.push(adjusted);

    return progression;
  }, []);
}

function attemptCost(
  context: JourneyContext,
  rewardValue: number,
  chance: number,
  previousCost: number,
): number {
  const { payableSequentialCost } = treeBuilderTools;
  const expectedValue = (rewardValue * chance) / 100;
  const preferred = roundDownToFive(expectedValue * 0.6);
  const positiveCeiling = roundDownToFive(expectedValue - 10);
  const progressiveFloor = previousCost + 5;
  const desired = Math.min(
    Math.max(progressiveFloor, preferred, 5),
    Math.max(5, positiveCeiling),
  );

  return payableSequentialCost(context, desired);
}

export function buildProbabilityLadderTree(
  context: JourneyContext,
  drawContext: DrawContext,
  stage: JourneyStage,
): JourneyTree {
  const { cost, pickSequentialVariant, sentenceCase } = treeBuilderTools;
  const { treeRewardFamily } = createTreePrimitives(treeBuilderTools);
  const levels = pickSequentialVariant(
    drawContext,
    "probability-ladder:levels",
    [3, 4],
  );
  const rewardFamily = treeRewardFamily(
    context,
    drawContext,
    "probability-ladder:reward",
    levels,
    REWARD_FAMILIES,
  );
  const rewards = enforceRewardProgression(
    rewardFamily.rewards.map((reward, index) =>
      enhanceRewardForLevel(reward, stage, index),
    ),
  );
  const chances = chanceProgression(
    drawContext,
    "probability-ladder:chances",
    levels,
  );
  const costs = rewards.reduce<number[]>((progression, reward, index) => {
    progression.push(
      attemptCost(
        context,
        reward.effect,
        chances[index]!,
        progression[index - 1] ?? 0,
      ),
    );

    return progression;
  }, []);

  return tree(
    costs.map((price, index) => {
      const level = index + 1;
      const chance = chances[index]!;
      const reward = rewards[index]!;
      const isFinal = level === costs.length;

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
            id: `level-${level}-attempt`,
            label: "Attempt",
            text: `Pay ${price} essence for a ${chance}% chance to ${reward.text}`,
            costs: [cost("essence", price)],
            cost: price,
            odds: odds(chance),
          }),
          treeBranch({
            id: `level-${level}-success`,
            label: "Success",
            kind: "random_chance",
            text: `${sentenceCase(reward.text)} End the Journey.`,
            effects: reward.effects,
            targets: reward.targets ?? [],
            effect: reward.effect,
            odds: odds(chance),
            terminal: {
              text: "End the Journey.",
              outcome: "claim",
              costs: [],
              effects: reward.effects,
              burdens: [],
              targets: reward.targets ?? [],
              routeEffects: [],
            },
          }),
          treeBranch({
            id: `level-${level}-failure`,
            label: "Failure",
            kind: "random_chance",
            text: isFinal ? "End the Journey." : `Go to Level ${level + 1}.`,
            odds: odds(100 - chance),
            ...(isFinal
              ? {
                  terminal: {
                    text: "End the Journey.",
                    outcome: "failure" as const,
                    costs: [],
                    effects: [],
                    burdens: [],
                    targets: [],
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
