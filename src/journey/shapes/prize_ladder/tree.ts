import type { JourneyContext } from "../../../quest/context.js";
import type { DrawContext } from "../../../util/rng.js";
import { treeBuilderTools } from "../../fillers/shared.js";
import { tree, treeBranch } from "../../fillers/treeBuilders.js";
import type { JourneyStage, JourneyTree } from "../../manifest.js";
import {
  valueCardDraft,
  valueDreamsignDraft,
  valueOmenGain,
} from "../../value.js";

type PrizeLadderReward = {
  readonly text: string;
  readonly effects: unknown[];
  readonly targets?: unknown[];
  readonly effect: number;
};

type PrizeLadderRewardFamily =
  | "essence"
  | "omens"
  | "card_draft"
  | "dreamsign_draft";

type CostBands = {
  readonly first: readonly number[];
  readonly second: readonly number[];
  readonly claim: readonly number[];
  readonly margin: number;
};

const COST_BANDS: Record<JourneyStage, CostBands> = {
  early: {
    first: [15, 20],
    second: [30, 35],
    claim: [45, 50],
    margin: 15,
  },
  mid: {
    first: [35, 40, 45],
    second: [70, 80, 90],
    claim: [125, 140, 155],
    margin: 80,
  },
  late: {
    first: [50, 55, 60],
    second: [100, 110, 120],
    claim: [165, 175, 185],
    margin: 30,
  },
};

const CLAIM_PREMIUM: Record<JourneyStage, number> = {
  early: 30,
  mid: 50,
  late: 70,
};

function roundUpToFive(amount: number): number {
  return Math.ceil(amount / 5) * 5;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function rewardTuple(
  rewards: readonly PrizeLadderReward[],
): readonly [PrizeLadderReward, PrizeLadderReward, PrizeLadderReward] {
  return [rewards[0]!, rewards[1]!, rewards[2]!];
}

function fitCostsToBudget(
  selectedCosts: readonly [number, number, number],
  budget: number,
): [number, number, number] {
  const costs = [...selectedCosts] as [number, number, number];

  while (sum(costs) > budget) {
    const reducibleIndex = [2, 1, 0].find((index) => {
      const floor = index === 0 ? 5 : costs[index - 1]! + 5;

      return costs[index]! > floor;
    });

    if (reducibleIndex === undefined) {
      break;
    }

    costs[reducibleIndex] -= 5;
  }

  return costs;
}

function prizeLadderCosts(
  context: JourneyContext,
  drawContext: DrawContext,
  stage: JourneyStage,
): [number, number, number] {
  const band = COST_BANDS[stage];
  const { pickSequentialVariant } = treeBuilderTools;
  const selected: [number, number, number] = [
    pickSequentialVariant(drawContext, "prize-ladder:costs:first", band.first),
    pickSequentialVariant(drawContext, "prize-ladder:costs:second", band.second),
    pickSequentialVariant(drawContext, "prize-ladder:costs:claim", band.claim),
  ];
  const pathBudget = Math.max(
    15,
    context.state.quest.resources.essence - band.margin,
  );

  return fitCostsToBudget(selected, pathBudget);
}

function essenceStopRewards(
  drawContext: DrawContext,
  stage: JourneyStage,
): readonly [PrizeLadderReward, PrizeLadderReward, PrizeLadderReward] {
  const { gainEssence, pickSequentialVariant } = treeBuilderTools;
  const bands = {
    early: { base: [45, 55], growth: [35, 40] },
    mid: { base: [65, 75], growth: [45, 55] },
    late: { base: [85, 95], growth: [60, 70] },
  } as const;
  const selected = bands[stage];
  const base = pickSequentialVariant(
    drawContext,
    "prize-ladder:essence-reward:base",
    selected.base,
  );
  const growth = pickSequentialVariant(
    drawContext,
    "prize-ladder:essence-reward:growth",
    selected.growth,
  );

  return rewardTuple([0, 1, 2].map((index) => {
    const amount = roundUpToFive(base + growth * index);

    return {
      text: `gain ${amount} essence.`,
      effects: [gainEssence(amount)],
      effect: amount,
    };
  }));
}

function omenCountsForStage(stage: JourneyStage): [number, number, number] {
  switch (stage) {
    case "late":
      return [2, 3, 5];
    case "mid":
      return [1, 2, 4];
    case "early":
      return [1, 2, 3];
  }
}

function omenReward(amount: number): PrizeLadderReward {
  const { gainOmen } = treeBuilderTools;

  return {
    text: `gain ${amount} ${amount === 1 ? "omen" : "omens"}.`,
    effects: [gainOmen(amount)],
    effect: valueOmenGain(amount),
  };
}

function stopRewards(
  context: JourneyContext,
  drawContext: DrawContext,
  stage: JourneyStage,
): {
  readonly family: PrizeLadderRewardFamily;
  readonly rewards: readonly [PrizeLadderReward, PrizeLadderReward, PrizeLadderReward];
} {
  const {
    CARD_DRAFT_PROFILES,
    DREAMSIGN_POOL_TARGET_DESCRIPTION,
    cardDraftText,
    draftCards,
    dreamsignDraft,
    gainOmen,
    legalCardDraftProfile,
    lowerFirst,
    pickSequentialVariant,
    target,
  } = treeBuilderTools;
  const legalFamilies: PrizeLadderRewardFamily[] = [
    "essence",
    "omens",
    "card_draft",
  ];

  if (context.state.quest.dreamsignPoolIds.length > 0) {
    legalFamilies.push("dreamsign_draft");
  }

  const family = pickSequentialVariant(
    drawContext,
    "prize-ladder:reward-family:family",
    legalFamilies,
  );

  if (family === "essence") {
    return { family, rewards: essenceStopRewards(drawContext, stage) };
  }

  if (family === "omens") {
    return {
      family,
      rewards: rewardTuple(omenCountsForStage(stage).map(omenReward)),
    };
  }

  if (family === "card_draft") {
    const profile = legalCardDraftProfile(context, [
      CARD_DRAFT_PROFILES.events,
      CARD_DRAFT_PROFILES.lowCostCharacters,
      CARD_DRAFT_PROFILES.characters,
    ]);
    const draft = draftCards(profile);

    return {
      family,
      rewards: rewardTuple([0, 1, 2].map((index) => {
        const omenCount = omenCountsForStage(stage)[index] - 1;
        const effects = omenCount > 0 ? [draft, gainOmen(omenCount)] : [draft];

        return {
          text:
            omenCount > 0
              ? `${lowerFirst(cardDraftText(profile))} Gain ${omenCount} ${omenCount === 1 ? "omen" : "omens"}.`
              : lowerFirst(cardDraftText(profile)),
          effects,
          targets: [
            target("card", profile.targetDescription, draft.predicate),
          ],
          effect: valueCardDraft(draft) + valueOmenGain(omenCount),
        };
      })),
    };
  }

  return {
    family,
    rewards: rewardTuple([0, 1, 2].map((index) => {
      const choiceCount = Math.min(4, 2 + Math.floor(index / 2));
      const omenCount = omenCountsForStage(stage)[index] - 1;
      const draft = dreamsignDraft(choiceCount);
      const effects = omenCount > 0 ? [draft, gainOmen(omenCount)] : [draft];

      return {
        text:
          omenCount > 0
            ? `${lowerFirst(`Choose 1 of ${choiceCount} Dreamsigns.`)} Gain ${omenCount} ${omenCount === 1 ? "omen" : "omens"}.`
            : lowerFirst(`Choose 1 of ${choiceCount} Dreamsigns.`),
        effects,
        targets: [
          target(
            "dreamsign",
            DREAMSIGN_POOL_TARGET_DESCRIPTION,
            draft.predicate,
          ),
        ],
        effect: valueDreamsignDraft(draft, context) + valueOmenGain(omenCount),
      };
    })),
  };
}

function claimReward(args: {
  readonly context: JourneyContext;
  readonly stage: JourneyStage;
  readonly family: PrizeLadderRewardFamily;
  readonly levelThreeStop: PrizeLadderReward;
  readonly claimCost: number;
  readonly fullPathCost: number;
}): PrizeLadderReward {
  const {
    CARD_DRAFT_PROFILES,
    DREAMSIGN_POOL_TARGET_DESCRIPTION,
    cardDraftText,
    draftCards,
    dreamsignDraft,
    gainEssence,
    gainOmen,
    legalCardDraftProfile,
    lowerFirst,
    target,
  } = treeBuilderTools;
  const premium = CLAIM_PREMIUM[args.stage];
  const minimumClaimEffect =
    args.levelThreeStop.effect + args.claimCost + premium;

  if (args.family === "essence") {
    const amount = roundUpToFive(
      args.levelThreeStop.effect + args.fullPathCost + premium,
    );

    return {
      text: `gain ${amount} essence.`,
      effects: [gainEssence(amount)],
      effect: amount,
    };
  }

  if (args.family === "omens") {
    const amount = Math.max(
      omenCountsForStage(args.stage)[2] + 3,
      Math.ceil(minimumClaimEffect / valueOmenGain(1)),
    );

    return omenReward(amount);
  }

  if (args.family === "card_draft") {
    const profile = legalCardDraftProfile(args.context, [
      CARD_DRAFT_PROFILES.events,
      CARD_DRAFT_PROFILES.lowCostCharacters,
      CARD_DRAFT_PROFILES.characters,
    ]);
    const takeCount = args.stage === "early" ? 2 : 3;
    const baseDraft = draftCards(profile);
    const draft = { ...baseDraft, takeCount };
    const omenCount = Math.max(
      omenCountsForStage(args.stage)[2] + 2,
      Math.ceil(
        (minimumClaimEffect - valueCardDraft(draft)) /
          valueOmenGain(1),
      ),
    );

    return {
      text: `${lowerFirst(cardDraftText(profile, takeCount))} Gain ${omenCount} ${omenCount === 1 ? "omen" : "omens"}.`,
      effects: [draft, gainOmen(omenCount)],
      targets: [target("card", profile.targetDescription, draft.predicate)],
      effect: valueCardDraft(draft) + valueOmenGain(omenCount),
    };
  }

  const choiceCount = args.stage === "late" ? 5 : 4;
  const draft = dreamsignDraft(choiceCount);
  const omenCount = Math.max(
    omenCountsForStage(args.stage)[2] + 2,
    Math.ceil(
      (minimumClaimEffect - valueDreamsignDraft(draft, args.context)) /
        valueOmenGain(1),
    ),
  );

  return {
    text: `${lowerFirst(`Choose 1 of ${choiceCount} Dreamsigns.`)} Gain ${omenCount} ${omenCount === 1 ? "omen" : "omens"}.`,
    effects: [draft, gainOmen(omenCount)],
    targets: [
      target(
        "dreamsign",
        DREAMSIGN_POOL_TARGET_DESCRIPTION,
        draft.predicate,
      ),
    ],
    effect: valueDreamsignDraft(draft, args.context) + valueOmenGain(omenCount),
  };
}

export function buildPrizeLadderTree(
  context: JourneyContext,
  drawContext: DrawContext,
  stage: JourneyStage,
): JourneyTree {
  const { cost, lowerFirst, sentenceCase } = treeBuilderTools;
  const rewardFamily = stopRewards(context, drawContext, stage);
  const costs = prizeLadderCosts(context, drawContext, stage);
  const finalClaimReward = claimReward({
    context,
    stage,
    family: rewardFamily.family,
    levelThreeStop: rewardFamily.rewards[2],
    claimCost: costs[2],
    fullPathCost: sum(costs),
  });

  return tree(
    [1, 2, 3].map((level) => {
      const stopReward = rewardFamily.rewards[level - 1]!;
      const stopText = `${sentenceCase(stopReward.text)} End the Journey.`;
      const price = costs[level - 1]!;
      const isFinal = level === 3;

      return {
        id: `level-${level}`,
        levelLabel: `Level ${level}`,
        branches: [
          treeBranch({
            id: `level-${level}-stop`,
            label: "Stop",
            text: stopText,
            effects: stopReward.effects,
            targets: stopReward.targets ?? [],
            effect: stopReward.effect,
            terminal: {
              text: "End the Journey.",
              outcome: "end",
              costs: [],
              effects: stopReward.effects,
              burdens: [],
              targets: stopReward.targets ?? [],
              routeEffects: [],
            },
          }),
          treeBranch({
            id: `level-${level}-${isFinal ? "claim" : "continue"}`,
            label: isFinal ? "Claim" : "Continue",
            text: isFinal
              ? `Pay ${price} essence and ${lowerFirst(finalClaimReward.text)} End the Journey.`
              : `Pay ${price} essence. Go to Level ${level + 1}.`,
            costs: [cost("essence", price)],
            effects: isFinal ? finalClaimReward.effects : [],
            targets: isFinal ? (finalClaimReward.targets ?? []) : [],
            cost: price,
            effect: isFinal ? finalClaimReward.effect : 0,
            ...(isFinal
              ? {
                  terminal: {
                    text: "End the Journey.",
                    outcome: "claim" as const,
                    costs: [cost("essence", price)],
                    effects: finalClaimReward.effects,
                    burdens: [],
                    targets: finalClaimReward.targets ?? [],
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
