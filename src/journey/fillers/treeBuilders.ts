import type { JourneyContext } from "../../quest/context.js";
import type { DrawContext } from "../../util/rng.js";
import type {
  JourneyRewardPool,
  JourneyTree,
  JourneyTreeBranch,
  PrecommittedOutcomes,
} from "../manifest.js";
import {
  adaptTreeBranchOperations,
  adaptTreeTerminalOperations,
} from "../operationAdapters.js";
import type { JourneyShapeId } from "../shapes.js";
import { visibleWheelPool } from "./randomPayloads.js";
import {
  valueBaneGain,
  valueCardDraft,
  valueDreamsignDraft,
  valueOmenGain,
} from "../value.js";
import {
  compatibleCardOperations,
  renderChosenCardOperationText,
  type MaterializedCardOperation,
} from "./cardOperationCatalog.js";

export type TreeCardDraftProfile = {
  label: string;
  targetDescription: string;
  predicate: unknown;
};

type TreeCardDraftProfiles = {
  characters: TreeCardDraftProfile;
  events: TreeCardDraftProfile;
  lowCostCharacters: TreeCardDraftProfile;
};

type CardDraftReward = {
  predicate?: unknown;
  takeCount: number;
  choiceCount: number;
} & Record<string, unknown>;

type DreamsignDraftReward = {
  predicate?: unknown;
  choiceCount: number;
} & Record<string, unknown>;

type SequentialReward = {
  text: string;
  effects: unknown[];
  targets?: unknown[];
  effect: number;
};

type TreeRewardFamilyId =
  | "essence"
  | "omens"
  | "card_draft"
  | "dreamsign_draft"
  | "starter_cleanup"
  | "transfiguration"
  | "battle_window";

type TreeRewardFamily = {
  id: TreeRewardFamilyId;
  rewards: SequentialReward[];
};

export type TreeBuilderTools = {
  BATTLE_WINDOW_DURATION: string;
  CARD_DRAFT_PROFILES: TreeCardDraftProfiles;
  DREAMSIGN_POOL_TARGET_DESCRIPTION: string;
  cardDraftText(profile: TreeCardDraftProfile, takeCount?: number): string;
  cost(kind: "essence" | "omens", amount: number): unknown;
  draftCards(profile: TreeCardDraftProfile): CardDraftReward;
  dreamsignDraft(choiceCount: number): DreamsignDraftReward;
  gainEssence(amount: number): unknown;
  gainOmen(amount: number): unknown;
  legalCardDraftProfile(
    context: JourneyContext,
    profiles: readonly TreeCardDraftProfile[],
  ): TreeCardDraftProfile;
  lowerFirst(text: string): string;
  payableSequentialCost(context: JourneyContext, desiredAmount: number): number;
  pickSequentialVariant<T>(
    drawContext: DrawContext,
    label: string,
    variants: readonly T[],
  ): T;
  sentenceCase(text: string): string;
  sequentialReward(
    context: JourneyContext,
    drawContext: DrawContext,
    label: string,
  ): SequentialReward;
  starterCleanup(count: number): unknown;
  target(
    kind: "card" | "dreamsign",
    description: string,
    predicate: unknown,
    options?: {
      selection?: "exact" | "predicate" | "chosen_after_commitment" | "visible_random" | "hidden_random";
      cardOperationTargetMode?: string;
      dreamsignOperationTargetMode?: string;
    },
  ): unknown;
};

type TreeBranchArgs = {
  id: string;
  label: string;
  kind?: JourneyTreeBranch["kind"];
  text: string;
  odds?: JourneyTreeBranch["odds"];
  costs?: unknown[];
  effects?: unknown[];
  burdens?: unknown[];
  targets?: unknown[];
  triggers?: unknown[];
  routeEffects?: unknown[];
  cost?: number;
  effect?: number;
  burden?: number;
  uncertainty?: number;
  nextNodeId?: string;
  terminal?: Omit<NonNullable<JourneyTreeBranch["terminal"]>, "operations">;
};

function treeBranch(args: TreeBranchArgs): JourneyTreeBranch {
  const costs = args.costs ?? [];
  const effects = args.effects ?? [];
  const burdens = args.burdens ?? [];
  const targets = args.targets ?? [];
  const routeEffects = args.routeEffects ?? [];
  const terminal = args.terminal
    ? {
        text: args.terminal.text,
        outcome: args.terminal.outcome,
        operations: [],
        costs,
        effects,
        burdens,
        targets,
        routeEffects,
      }
    : undefined;

  const branch = {
    id: args.id,
    label: args.label,
    kind: args.kind ?? "player_choice",
    text: args.text,
    operations: [],
    ...(args.odds ? { odds: args.odds } : {}),
    costs,
    effects,
    burdens,
    targets,
    triggers: args.triggers ?? [],
    routeEffects,
    costConvertedEssence: args.cost ?? 0,
    effectConvertedEssence: args.effect ?? 0,
    burdenConvertedEssence: args.burden ?? 0,
    uncertaintyConvertedEssence: args.uncertainty ?? 0,
    netConvertedEssence:
      (args.effect ?? 0) -
      (args.cost ?? 0) +
      (args.burden ?? 0) +
      (args.uncertainty ?? 0),
    ...(args.nextNodeId ? { nextNodeId: args.nextNodeId } : {}),
    ...(terminal ? { terminal } : {}),
  };

  return {
    ...branch,
    operations: adaptTreeBranchOperations(branch),
    ...(branch.terminal
      ? {
          terminal: {
            ...branch.terminal,
            operations: adaptTreeTerminalOperations(
              branch.terminal,
              `tree:${branch.id}:terminal`,
            ),
          },
        }
      : {}),
  };
}

export function odds(percent: number): JourneyTreeBranch["odds"] {
  return { numerator: percent, denominator: 100, percent };
}

function tree(nodes: JourneyTree["nodes"]): JourneyTree {
  return {
    rootNodeId: nodes[0]?.id ?? "level-1",
    nodes,
  };
}

function stageForContext(context: JourneyContext): "early" | "mid" | "late" {
  const dreamscape = context.state.quest.resources.dreamscape;

  if (dreamscape <= 1) {
    return "early";
  }

  return dreamscape <= 3 ? "mid" : "late";
}

function createDecisionTreeBuilders(tools: TreeBuilderTools) {
  const {
    CARD_DRAFT_PROFILES,
    DREAMSIGN_POOL_TARGET_DESCRIPTION,
    cardDraftText,
    cost,
    draftCards,
    dreamsignDraft,
    gainEssence,
    gainOmen,
    legalCardDraftProfile,
    lowerFirst,
    payableSequentialCost,
    pickSequentialVariant,
    sentenceCase,
    sequentialReward,
    target,
  } = tools;

  function essenceProgression(
    drawContext: DrawContext,
    label: string,
    levels: number,
    band: "modest" | "standard" | "rich",
  ): number[] {
    const bands = {
      modest: { base: [35, 45, 55], growth: [25, 35, 45], final: [0, 15, 30] },
      standard: {
        base: [45, 55, 65],
        growth: [35, 45, 55],
        final: [15, 30, 45],
      },
      rich: { base: [70, 85, 100], growth: [45, 60, 75], final: [30, 50, 70] },
    } as const;
    const selected = bands[band];
    const base = pickSequentialVariant(drawContext, `${label}:base`, selected.base);
    const growth = pickSequentialVariant(
      drawContext,
      `${label}:growth`,
      selected.growth,
    );
    const finalBonus = pickSequentialVariant(
      drawContext,
      `${label}:final`,
      selected.final,
    );

    return Array.from({ length: levels }, (_, index) => {
      const level = index + 1;
      const amount = base + growth * index + (level === levels ? finalBonus : 0);

      return Math.round(amount / 5) * 5;
    });
  }

  function essenceCostProgression(
    context: JourneyContext,
    drawContext: DrawContext,
    label: string,
    levels: number,
    band: "light" | "standard" | "steep",
  ): number[] {
    const bands = {
      light: { base: [10, 15, 20], growth: [15, 20, 25], final: [0, 5, 10] },
      standard: { base: [20, 25, 30], growth: [25, 30, 35], final: [5, 10, 15] },
      steep: { base: [25, 30, 35], growth: [30, 40, 50], final: [10, 20, 30] },
    } as const;
    const selected = bands[band];
    const base = pickSequentialVariant(drawContext, `${label}:base`, selected.base);
    const growth = pickSequentialVariant(
      drawContext,
      `${label}:growth`,
      selected.growth,
    );
    const finalBonus = pickSequentialVariant(
      drawContext,
      `${label}:final`,
      selected.final,
    );

    return Array.from({ length: levels }, (_, index) => {
      const level = index + 1;
      const desired = base + growth * index + (level === levels ? finalBonus : 0);

      return payableSequentialCost(context, Math.round(desired / 5) * 5);
    });
  }

  function chanceProgression(
    drawContext: DrawContext,
    label: string,
    levels: number,
    band: "push" | "ladder",
  ): number[] {
    const selected =
      band === "push"
        ? {
            start: pickSequentialVariant(drawContext, `${label}:start`, [75, 80, 85]),
            step: pickSequentialVariant(drawContext, `${label}:step`, [15, 20]),
            floor: 30,
          }
        : {
            start: pickSequentialVariant(drawContext, `${label}:start`, [25, 30, 35]),
            step: pickSequentialVariant(drawContext, `${label}:step`, [15, 20]),
            floor: 95,
          };

    return Array.from({ length: levels }, (_, index) =>
      band === "push"
        ? Math.max(selected.floor, selected.start - selected.step * index)
        : Math.min(selected.floor, selected.start + selected.step * index),
    );
  }

  function omenProgression(
    drawContext: DrawContext,
    label: string,
    levels: number,
  ): number[] {
    const finalBonus = pickSequentialVariant(
      drawContext,
      `${label}:final-bonus`,
      [0, 1],
    );

    return Array.from({ length: levels }, (_, index) =>
      Math.max(1, index + 1 + (index === levels - 1 ? finalBonus : 0)),
    );
  }

  function withOmenBonus(text: string, omenCount: number): string {
    const baseText = lowerFirst(text).replace(/\.$/u, "");

    return omenCount > 0
      ? `${baseText} and gain ${omenCount} ${omenCount === 1 ? "omen" : "omens"}.`
      : `${baseText}.`;
  }

  function cardOperationTargets(operation: MaterializedCardOperation): unknown[] {
    const effect = operation.effect;
    const starterTarget = effect.starterTarget === true;
    const predicate =
      typeof effect.predicate === "object" && effect.predicate !== null
        ? effect.predicate
        : starterTarget
          ? { source: "deck", starter: true }
          : { source: "deck" };
    const description = starterTarget
      ? "Starter cards in deck"
      : effect.selection === "hidden_random"
        ? "a random matching card in deck"
        : effect.selection === "predicate"
          ? "matching cards in deck"
          : "cards in deck";

    return [
      target("card", description, predicate, {
        selection: "chosen_after_commitment",
        cardOperationTargetMode: "chosen",
      }),
    ];
  }

  function treeRewardFamily(
    context: JourneyContext,
    drawContext: DrawContext,
    label: string,
    levels: number,
    allowedFamilies: readonly TreeRewardFamilyId[] = [
      "essence",
      "omens",
      "card_draft",
      "dreamsign_draft",
      "starter_cleanup",
      "transfiguration",
      "battle_window",
    ],
  ): TreeRewardFamily {
    const legalFamilies = allowedFamilies.filter((family) => {
      if (family === "dreamsign_draft") {
        return context.state.quest.dreamsignPoolIds.length > 0;
      }

      if (family === "starter_cleanup") {
        return context.state.quest.deck.summary.starterCards > 0;
      }

      return true;
    });
    const family = pickSequentialVariant(
      drawContext,
      `${label}:family`,
      legalFamilies.length > 0 ? legalFamilies : ["essence"],
    );

    switch (family) {
      case "essence": {
        const amounts = essenceProgression(drawContext, label, levels, "standard");

        return {
          id: family,
          rewards: amounts.map((amount) => ({
            text: `gain ${amount} essence.`,
            effects: [gainEssence(amount)],
            effect: amount,
          })),
        };
      }
      case "omens": {
        const amounts = omenProgression(drawContext, label, levels);

        return {
          id: family,
          rewards: amounts.map((amount) => ({
            text: `gain ${amount} ${amount === 1 ? "omen" : "omens"}.`,
            effects: [gainOmen(amount)],
            effect: valueOmenGain(amount),
          })),
        };
      }
      case "card_draft": {
        const profile = legalCardDraftProfile(context, [
          CARD_DRAFT_PROFILES.events,
          CARD_DRAFT_PROFILES.lowCostCharacters,
          CARD_DRAFT_PROFILES.characters,
        ]);
        const draft = draftCards(profile);

        return {
          id: family,
          rewards: Array.from({ length: levels }, (_, index) => {
            const omenCount = index;
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
          }),
        };
      }
      case "dreamsign_draft":
        return {
          id: family,
          rewards: Array.from({ length: levels }, (_, index) => {
            const choiceCount = Math.min(4, 2 + Math.floor(index / 2));
            const omenCount = index === 0 ? 0 : index;
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
          }),
        };
      case "starter_cleanup":
        return {
          id: family,
          rewards: compatibleCardOperations(drawContext, {
            topology: "mirrored_operations",
            targetClasses: ["starter_card"],
            targetModes: ["chosen"],
            timings: ["immediate"],
            families: ["purge", "replacement", "transfiguration"],
            context,
            stage: stageForContext(context),
            label: `${label}:starter-operations`,
            count: levels,
          }).map((operation, index) => {
            const omenCount = index;
            const effects = omenCount > 0
              ? [operation.effect, gainOmen(omenCount)]
              : [operation.effect];

            return {
              text: withOmenBonus(renderChosenCardOperationText(operation), omenCount),
              effects,
              targets: cardOperationTargets(operation),
              effect: operation.value + valueOmenGain(omenCount),
            };
          }),
        };
      case "transfiguration": {
        return {
          id: family,
          rewards: compatibleCardOperations(drawContext, {
            topology: "mirrored_operations",
            targetClasses: ["deck_card", "starter_card"],
            targetModes: ["chosen"],
            valueBands: ["standard", "premium"],
            timings: ["immediate"],
            families: ["transfiguration"],
            context,
            stage: stageForContext(context),
            label: `${label}:transfiguration-operations`,
            count: levels,
          }).map((operation) => {
            return {
              text: lowerFirst(renderChosenCardOperationText(operation)),
              effects: [operation.effect],
              targets: cardOperationTargets(operation),
              effect: operation.value,
            };
          }),
        };
      }
      case "battle_window": {
        const operations = compatibleCardOperations(drawContext, {
          topology: "one_operation_many_targets",
          targetClasses: ["deck_card", "starter_card"],
          targetModes: ["chosen"],
          valueBands: ["temporary"],
          timings: ["battle_window"],
          context,
          stage: stageForContext(context),
          label: `${label}:battle-window-operations`,
          count: 2,
        });

        return {
          id: family,
          rewards: Array.from({ length: levels }, (_, index) => {
            const operation = operations[index % operations.length]!;

            return {
              text: lowerFirst(renderChosenCardOperationText(operation)),
              effects: [operation.effect],
              targets: cardOperationTargets(operation),
              effect: operation.value,
            };
          }),
        };
      }
    }

    return treeRewardFamily(context, drawContext, `${label}:fallback`, levels, [
      "essence",
    ]);
  }

  function buildPrizeLadderTree(
    context: JourneyContext,
    drawContext: DrawContext,
  ): JourneyTree {
    const rewardFamily = treeRewardFamily(
      context,
      drawContext,
      "prize-ladder:reward-family",
      4,
      ["essence", "omens", "card_draft", "dreamsign_draft", "starter_cleanup"],
    );
    const claimReward = rewardFamily.rewards[3] ?? sequentialReward(
      context,
      drawContext,
      "prize-ladder:claim-reward",
    );
    const costs = essenceCostProgression(
      context,
      drawContext,
      "prize-ladder:costs",
      3,
      "steep",
    );

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
                ? `Pay ${price} essence and ${lowerFirst(claimReward.text)} End the Journey.`
                : `Pay ${price} essence. Go to Level ${level + 1}.`,
              costs: [cost("essence", price)],
              effects: isFinal ? claimReward.effects : [],
              targets: isFinal ? (claimReward.targets ?? []) : [],
              cost: price,
              effect: isFinal ? claimReward.effect : 0,
              ...(isFinal
                ? {
                    terminal: {
                      text: "End the Journey.",
                      outcome: "claim" as const,
                      costs: [cost("essence", price)],
                      effects: claimReward.effects,
                      burdens: [],
                      targets: claimReward.targets ?? [],
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

  function buildProbabilityLadderTree(
    context: JourneyContext,
    drawContext: DrawContext,
  ): JourneyTree {
    const reward = sequentialReward(
      context,
      drawContext,
      "probability-ladder:reward",
    );
    const levels = pickSequentialVariant(
      drawContext,
      "probability-ladder:levels",
      [3, 4],
    );
    const costs = essenceCostProgression(
      context,
      drawContext,
      "probability-ladder:costs",
      levels,
      "standard",
    );
    const chances = chanceProgression(
      drawContext,
      "probability-ladder:chances",
      levels,
      "ladder",
    );

    return tree(
      costs.map((price, index) => {
        const level = index + 1;
        const chance = chances[index]!;
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

  function buildRandomPoolDrawsTree(
    context: JourneyContext,
    drawContext: DrawContext,
  ): JourneyTree {
    const levelCount = pickSequentialVariant(
      drawContext,
      "random-pool:levels",
      [3, 4],
    );
    const price = payableSequentialCost(
      context,
      pickSequentialVariant(drawContext, "random-pool:price", [35, 45, 55]),
    );

    return tree(
      Array.from({ length: levelCount }, (_, index) => index + 1).map(
        (level) => ({
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
              id: `level-${level}-draw`,
              label: "Draw",
              text: `Pay ${price} essence and gain a random reward from the pool. ${level === levelCount ? "End the Journey." : `Go to Level ${level + 1}.`}`,
              costs: [cost("essence", price)],
              effects: [
                {
                  kind: "random_reward",
                  pool: "visible_pool",
                  replacement: "with_replacement",
                },
              ],
              cost: price,
              effect: 100,
              uncertainty: -15,
              ...(level === levelCount
                ? {
                    terminal: {
                      text: "End the Journey.",
                      outcome: "claim" as const,
                      costs: [cost("essence", price)],
                      effects: [
                        {
                          kind: "random_reward",
                          pool: "visible_pool",
                          replacement: "with_replacement",
                        },
                      ],
                      burdens: [],
                      targets: [],
                      routeEffects: [],
                    },
                  }
                : { nextNodeId: `level-${level + 1}` }),
            }),
          ],
        }),
      ),
    );
  }

  function buildEscalatingRewardChainTree(
    context: JourneyContext,
    drawContext: DrawContext,
  ): JourneyTree {
    const profile = {
      costs: essenceCostProgression(
        context,
        drawContext,
        "escalating-chain:costs",
        3,
        "standard",
      ),
      rewards: treeRewardFamily(
        context,
        drawContext,
        "escalating-chain:reward-family",
        3,
        [
          "essence",
          "omens",
          "card_draft",
          "dreamsign_draft",
          "starter_cleanup",
          "transfiguration",
          "battle_window",
        ],
      ).rewards,
    };
    const costShift = pickSequentialVariant(
      drawContext,
      "escalating-chain:cost-shift",
      [0, 5, 10],
    );

    return tree(
      profile.rewards.map((reward, index) => {
        const level = index + 1;
        const price = payableSequentialCost(context, profile.costs[index]! + costShift);
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

  function buildPushYourLuckTree(
    context: JourneyContext,
    drawContext: DrawContext,
  ): JourneyTree {
    const profile = {
      chances: chanceProgression(
        drawContext,
        "push-your-luck:chances",
        3,
        "push",
      ),
      rewards: treeRewardFamily(
        context,
        drawContext,
        "push-your-luck:reward-family",
        3,
        [
          "essence",
          "omens",
          "card_draft",
          "dreamsign_draft",
          "starter_cleanup",
          "transfiguration",
          "battle_window",
        ],
      ).rewards,
    };
    const failureBaneName = pickSequentialVariant(
      drawContext,
      "push-your-luck:failure-bane",
      ["Nightmare", "Despair", "Envy", "Silence", "Paranoia"] as const,
    );
    const failureBane = {
      kind: "bane_gain",
      baneName: failureBaneName,
      count: 1,
    };
    const failureBurden = valueBaneGain(failureBaneName, 1);

    return tree(
      [1, 2, 3].map((level) => {
        const reward = profile.rewards[level - 1]!;
        const successPercent = profile.chances[level - 1]!;

        return {
          id: `level-${level}`,
          levelLabel: `Level ${level}`,
          branches: [
            treeBranch({
              id: `level-${level}-stop`,
              label: "Stop",
              text:
                level === 1
                  ? "Leave."
                  : "Keep the last safe reward. End the Journey.",
              terminal: {
                text: "End the Journey.",
                outcome: level === 1 ? "leave" : "end",
                costs: [],
                effects: [],
                burdens: [],
                targets: [],
                routeEffects: [],
              },
            }),
            treeBranch({
              id: `level-${level}-push`,
              label: "Push",
              text: `Risk immediate failure for a ${successPercent}% chance to ${reward.text} ${level === 3 ? "End the Journey." : `Go to Level ${level + 1}.`}`,
              odds: odds(successPercent),
              effects: reward.effects,
              targets: reward.targets ?? [],
              effect: reward.effect,
              uncertainty: -30,
              nextNodeId: level === 3 ? undefined : `level-${level + 1}`,
              ...(level === 3
                ? {
                    terminal: {
                      text: "End the Journey.",
                      outcome: "claim" as const,
                      costs: [],
                      effects: reward.effects,
                      burdens: [],
                      targets: reward.targets ?? [],
                      routeEffects: [],
                    },
                  }
                : {}),
            }),
            treeBranch({
              id: `level-${level}-failure`,
              label: "Failure",
              kind: "random_chance",
              text: `Gain 1 ${failureBaneName}. End the Journey.`,
              odds: odds(100 - successPercent),
              burdens: [failureBane],
              burden: failureBurden,
              terminal: {
                text: "End the Journey.",
                outcome: "failure",
                costs: [],
                effects: [],
                burdens: [failureBane],
                targets: [],
                routeEffects: [],
              },
            }),
          ],
        };
      }),
    );
  }

  function decisionTreeForShape(
    shapeId: JourneyShapeId,
    context: JourneyContext,
    drawContext: DrawContext,
  ): {
    tree?: JourneyTree;
    rewardPool?: JourneyRewardPool;
    precommitted: PrecommittedOutcomes;
  } {
    switch (shapeId) {
      case "prize_ladder":
        return {
          tree: buildPrizeLadderTree(context, drawContext),
          precommitted: {},
        };
      case "probability_ladder":
        return {
          tree: buildProbabilityLadderTree(context, drawContext),
          precommitted: {
            random: [
              {
                kind: "probability_ladder",
                bounded: true,
                visibilityPolicy: {
                  outcomeVisibility: "visible",
                  disclosure:
                    "Probability ladder odds are bounded and shown on each branch.",
                  playerVisible: true,
                },
              },
            ],
          },
        };
      case "random_pool_draws": {
        const wheel = visibleWheelPool({
          context,
          drawContext,
          label: "random-pool",
          stage: stageForContext(context),
          size: pickSequentialVariant(drawContext, "random-pool:size", [5, 6]),
        });
        const pool = wheel.rewardPool;
        const drawCount = 2;

        return {
          tree: buildRandomPoolDrawsTree(context, drawContext),
          rewardPool: pool,
          precommitted: {
            random: [
              {
                ...wheel.visiblePoolEnvelope,
                poolId: "random-pool-draws",
              },
              {
                kind: "repeated_pool_draws",
                poolId: "random-pool-draws",
                drawCount,
                rewards: pool.rewards,
                committedDraws: wheel.candidates
                  .slice(0, drawCount)
                  .map((candidate) => candidate.payloads),
                replacement: pool.replacement,
                visibilityPolicy: {
                  outcomeVisibility: "pre_rolled",
                  disclosure:
                    "Repeated draws use the fixed visible pool with replacement and are committed in metadata.",
                  playerVisible: true,
                },
                expectedConvertedEssence:
                  Number(wheel.visiblePoolEnvelope.expectedConvertedEssence ?? 0) *
                  drawCount,
                riskPremiumConvertedEssence: -12,
                worstCaseBurdenConvertedEssence:
                  Number(wheel.visiblePoolEnvelope.worstCaseBurdenConvertedEssence ?? 0) *
                  drawCount,
                presentation: "random_pool_repeated_draws",
              },
            ],
          },
        };
      }
      case "push_your_luck": {
        const pushTree = buildPushYourLuckTree(context, drawContext);
        const failureBranches = pushTree.nodes.flatMap((node) =>
          node.branches.filter((branch) => branch.kind === "random_chance"),
        );
        const firstFailure = failureBranches[0];

        return {
          tree: pushTree,
          precommitted: {
            random: [
              {
                kind: "push_choice",
                bounded: true,
                odds: firstFailure?.odds ?? odds(50),
                hazard: {
                  branches: failureBranches.map((branch) => ({
                    id: branch.id,
                    odds: branch.odds,
                    burdens: branch.burdens ?? [],
                  })),
                },
                visibilityPolicy: {
                  outcomeVisibility: "visible",
                  disclosure:
                    "Push-your-luck failure odds and hazards are visible on each push branch.",
                  playerVisible: true,
                },
              },
            ],
          },
        };
      }
      case "escalating_reward_chain":
        return {
          tree: buildEscalatingRewardChainTree(context, drawContext),
          precommitted: {},
        };
      default:
        return { precommitted: {} };
    }
  }

  return { decisionTreeForShape };
}

export function decisionTreeForShape(
  shapeId: JourneyShapeId,
  context: JourneyContext,
  drawContext: DrawContext,
  tools: TreeBuilderTools,
): {
  tree?: JourneyTree;
  rewardPool?: JourneyRewardPool;
  precommitted: PrecommittedOutcomes;
} {
  return createDecisionTreeBuilders(tools).decisionTreeForShape(
    shapeId,
    context,
    drawContext,
  );
}
