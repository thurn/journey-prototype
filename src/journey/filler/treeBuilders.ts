import type { JourneyContext } from "../../quest/context.js";
import type { DrawContext } from "../../util/rng.js";
import type {
  JourneyRewardPool,
  JourneyTree,
  JourneyTreeBranch,
  PrecommittedOutcomes,
} from "../manifest.js";
import {
  adaptRewardPoolOperations,
  adaptTreeBranchOperations,
  adaptTreeTerminalOperations,
} from "../operationAdapters.js";
import type { JourneyShapeId } from "../shapes.js";
import {
  valueBaneGain,
  valueCardDraft,
  valueDreamsignDraft,
  valueOmenGain,
} from "../value.js";

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
  target(kind: "card" | "dreamsign", description: string, predicate: unknown): unknown;
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
      (args.effect ?? 0) - (args.cost ?? 0) + (args.burden ?? 0) + (args.uncertainty ?? 0),
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
            operations: adaptTreeTerminalOperations(branch.terminal, `tree:${branch.id}:terminal`),
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

function createDecisionTreeBuilders(tools: TreeBuilderTools) {
  const {
    BATTLE_WINDOW_DURATION,
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
    starterCleanup,
    target,
  } = tools;

  function buildPrizeLadderTree(context: JourneyContext, drawContext: DrawContext): JourneyTree {
    const claimReward = sequentialReward(context, drawContext, "prize-ladder:claim-reward");
    const profile = pickSequentialVariant(drawContext, "prize-ladder:profile", [
      { costs: [25, 55, 85], stop: [gainEssence(45), gainEssence(80), gainEssence(120)], stopText: ["Gain 45 essence.", "Gain 80 essence.", "Gain 120 essence."], stopValue: [45, 80, 120] },
      { costs: [30, 60, 95], stop: [gainOmen(1), gainOmen(2), gainOmen(3)], stopText: ["Gain 1 omen.", "Gain 2 omens.", "Gain 3 omens."], stopValue: [valueOmenGain(1), valueOmenGain(2), valueOmenGain(3)] },
      { costs: [20, 50, 90], stop: [gainEssence(35), gainOmen(1), gainOmen(2)], stopText: ["Gain 35 essence.", "Gain 1 omen.", "Gain 2 omens."], stopValue: [35, valueOmenGain(1), valueOmenGain(2)] },
    ]);
  
    return tree([1, 2, 3].map((level) => {
      const stopEffect = profile.stop[level - 1]!;
      const stopText = `${profile.stopText[level - 1]!} End the Journey.`;
      const stopValue = profile.stopValue[level - 1]!;
      const price = payableSequentialCost(context, profile.costs[level - 1]!);
      const isFinal = level === 3;
  
      return {
        id: `level-${level}`,
        levelLabel: `Level ${level}`,
        branches: [
          treeBranch({
            id: `level-${level}-stop`,
            label: "Stop",
            text: stopText,
            effects: [stopEffect],
            effect: stopValue,
            terminal: { text: "End the Journey.", outcome: "end", costs: [], effects: [stopEffect], burdens: [], targets: [], routeEffects: [] },
          }),
          treeBranch({
            id: `level-${level}-${isFinal ? "claim" : "continue"}`,
            label: isFinal ? "Claim" : "Continue",
            text: isFinal
              ? `Pay ${price} essence and ${lowerFirst(claimReward.text)} End the Journey.`
              : `Pay ${price} essence. Go to Level ${level + 1}.`,
            costs: [cost("essence", price)],
            effects: isFinal ? claimReward.effects : [],
            targets: isFinal ? claimReward.targets ?? [] : [],
            cost: price,
            effect: isFinal ? claimReward.effect : 0,
            ...(isFinal
              ? { terminal: { text: "End the Journey.", outcome: "claim" as const, costs: [cost("essence", price)], effects: claimReward.effects, burdens: [], targets: claimReward.targets ?? [], routeEffects: [] } }
              : { nextNodeId: `level-${level + 1}` }),
          }),
        ],
      };
    }));
  }
  
  function buildProbabilityLadderTree(context: JourneyContext, drawContext: DrawContext): JourneyTree {
    const reward = sequentialReward(context, drawContext, "probability-ladder:reward");
    const profile = pickSequentialVariant(drawContext, "probability-ladder:profile", [
      { costs: [20, 40, 65], chances: [30, 50, 70] },
      { costs: [15, 35, 60], chances: [20, 45, 75] },
      { costs: [30, 50, 80], chances: [35, 55, 80] },
      { costs: [20, 35, 55, 75], chances: [25, 40, 55, 70] },
    ]);
  
    return tree(profile.costs.map((desiredPrice, index) => {
      const level = index + 1;
      const chance = profile.chances[index]!;
      const isFinal = level === profile.costs.length;
      const price = payableSequentialCost(context, desiredPrice);
  
      return {
        id: `level-${level}`,
        levelLabel: `Level ${level}`,
        branches: [
          treeBranch({ id: `level-${level}-stop`, label: "Stop", text: "Leave.", terminal: { text: "Leave.", outcome: "leave", costs: [], effects: [], burdens: [], targets: [], routeEffects: [] } }),
          treeBranch({ id: `level-${level}-attempt`, label: "Attempt", text: `Pay ${price} essence for a ${chance}% chance to ${reward.text}`, costs: [cost("essence", price)], cost: price, odds: odds(chance) }),
          treeBranch({ id: `level-${level}-success`, label: "Success", kind: "random_chance", text: `${sentenceCase(reward.text)} End the Journey.`, effects: reward.effects, targets: reward.targets ?? [], effect: reward.effect, odds: odds(chance), terminal: { text: "End the Journey.", outcome: "claim", costs: [], effects: reward.effects, burdens: [], targets: reward.targets ?? [], routeEffects: [] } }),
          treeBranch({
            id: `level-${level}-failure`,
            label: "Failure",
            kind: "random_chance",
            text: isFinal ? "End the Journey." : `Go to Level ${level + 1}.`,
            odds: odds(100 - chance),
            ...(isFinal
              ? { terminal: { text: "End the Journey.", outcome: "failure" as const, costs: [], effects: [], burdens: [], targets: [], routeEffects: [] } }
              : { nextNodeId: `level-${level + 1}` }),
          }),
        ],
      };
    }));
  }
  
  function randomPool(context: JourneyContext, drawContext: DrawContext): JourneyRewardPool {
    const eventDraft = draftCards(CARD_DRAFT_PROFILES.events);
    const characterProfile = legalCardDraftProfile(context, [
      CARD_DRAFT_PROFILES.lowCostCharacters,
      CARD_DRAFT_PROFILES.characters,
    ]);
    const characterDraft = draftCards(characterProfile);
    const transfiguration = pickSequentialVariant(drawContext, "random-pool:transfiguration", [
      "Bronze",
      "Scarlet",
      "Viridian",
    ]);
    const cleanupReward = context.state.quest.deck.summary.starterCards > 0
      ? starterCleanup(1)
      : gainEssence(100);
    const cleanupSummary = context.state.quest.deck.summary.starterCards > 0
      ? "purge a starter card"
      : "100 essence";
    const variants: { summary: string; rewards: unknown[] }[] = [
      {
        summary: `Randomly gain one: 60 essence, 1 omen, draft 1 of 4 ${characterProfile.label}, apply {${transfiguration} Transfiguration} to a random card, or ${cleanupSummary}. Outcomes draw with replacement.`,
        rewards: [
          gainEssence(60),
          gainOmen(1),
          characterDraft,
          { kind: "transfiguration", transfigurationName: transfiguration, scope: "random_card" },
          cleanupReward,
        ],
      },
      {
        summary: "Randomly gain one: 40 essence, 90 essence, 1 omen, 2 omens, or draft 1 of 4 events. Outcomes draw with replacement.",
        rewards: [
          gainEssence(40),
          gainEssence(90),
          gainOmen(1),
          gainOmen(2),
          eventDraft,
        ],
      },
    ];
  
    if (context.state.quest.dreamsignPoolIds.length > 0) {
      variants.push({
        summary: `Randomly gain one: a Dreamsign, draft 1 of 4 events, {${transfiguration} Transfiguration}, 2 omens, 75 essence, or ${cleanupSummary}. Outcomes draw with replacement.`,
        rewards: [
          dreamsignDraft(1),
          eventDraft,
          { kind: "transfiguration", transfigurationName: transfiguration },
          gainOmen(2),
          gainEssence(75),
          cleanupReward,
        ],
      });
    }
    const selected = pickSequentialVariant(drawContext, "random-pool:profile", variants);
  
    const pool = {
      summary: selected.summary,
      replacement: "with_replacement" as const,
      operations: [],
      rewards: selected.rewards,
    };

    return {
      ...pool,
      operations: adaptRewardPoolOperations(pool),
    };
  }
  
  function buildRandomPoolDrawsTree(context: JourneyContext, drawContext: DrawContext): JourneyTree {
    const levelCount = pickSequentialVariant(drawContext, "random-pool:levels", [3, 4]);
    const price = payableSequentialCost(
      context,
      pickSequentialVariant(drawContext, "random-pool:price", [35, 45, 55]),
    );
  
    return tree(Array.from({ length: levelCount }, (_, index) => index + 1).map((level) => ({
      id: `level-${level}`,
      levelLabel: `Level ${level}`,
      branches: [
        treeBranch({
          id: `level-${level}-stop`,
          label: "Stop",
          text: "Leave.",
          terminal: { text: "Leave.", outcome: "leave", costs: [], effects: [], burdens: [], targets: [], routeEffects: [] },
        }),
        treeBranch({
          id: `level-${level}-draw`,
          label: "Draw",
          text: `Pay ${price} essence and gain a random reward from the pool. ${level === levelCount ? "End the Journey." : `Go to Level ${level + 1}.`}`,
          costs: [cost("essence", price)],
          effects: [{ kind: "random_reward", pool: "visible_pool", replacement: "with_replacement" }],
          cost: price,
          effect: 100,
          uncertainty: -15,
          ...(level === levelCount
            ? { terminal: { text: "End the Journey.", outcome: "claim" as const, costs: [cost("essence", price)], effects: [{ kind: "random_reward", pool: "visible_pool", replacement: "with_replacement" }], burdens: [], targets: [], routeEffects: [] } }
            : { nextNodeId: `level-${level + 1}` }),
        }),
      ],
    })));
  }
  
  function buildEscalatingRewardChainTree(context: JourneyContext, drawContext: DrawContext): JourneyTree {
    const cardProfile = legalCardDraftProfile(context, [
      CARD_DRAFT_PROFILES.lowCostCharacters,
      CARD_DRAFT_PROFILES.characters,
    ]);
    const cardDraft = draftCards(cardProfile);
    const dreamsignReward = dreamsignDraft(2);
    const profiles: { costs: number[]; rewards: SequentialReward[] }[] = [
      {
        costs: [15, 35, 65],
        rewards: [
          { text: "apply Bronze to a random card.", effects: [{ kind: "transfiguration", transfigurationName: "Bronze", scope: "random_card" }], targets: [target("card", "a random card in deck", { source: "deck" })], effect: 85 },
          { text: "apply Viridian to a random card and gain 1 omen.", effects: [{ kind: "transfiguration", transfigurationName: "Viridian", scope: "random_card" }, gainOmen(1)], targets: [target("card", "a random card in deck", { source: "deck" })], effect: 85 + valueOmenGain(1) },
          { text: "apply Golden to up to 2 chosen cards.", effects: [{ kind: "transfiguration", transfigurationName: "Golden", scope: "up_to_2_chosen_cards" }], targets: [target("card", "cards in deck", { source: "deck" })], effect: 170 },
        ],
      },
      {
        costs: [20, 40, 70],
        rewards: [
          { text: "gain 1 omen.", effects: [gainOmen(1)], effect: valueOmenGain(1) },
          { text: "gain 2 omens.", effects: [gainOmen(2)], effect: valueOmenGain(2) },
          { text: "gain 4 omens.", effects: [gainOmen(4)], effect: valueOmenGain(4) },
        ],
      },
      {
        costs: [25, 45, 75],
        rewards: [
          { text: `${lowerFirst(cardDraftText(cardProfile))}`, effects: [cardDraft], targets: [target("card", cardProfile.targetDescription, cardDraft.predicate)], effect: valueCardDraft(cardDraft) },
          { text: `${lowerFirst(cardDraftText(cardProfile))} Gain 1 omen.`, effects: [cardDraft, gainOmen(1)], targets: [target("card", cardProfile.targetDescription, cardDraft.predicate)], effect: valueCardDraft(cardDraft) + valueOmenGain(1) },
          { text: `${lowerFirst(cardDraftText(cardProfile))} Gain 2 omens.`, effects: [cardDraft, gainOmen(2)], targets: [target("card", cardProfile.targetDescription, cardDraft.predicate)], effect: valueCardDraft(cardDraft) + valueOmenGain(2) },
        ],
      },
      {
        costs: [15, 30, 50],
        rewards: [
          { text: "gain 60 essence.", effects: [gainEssence(60)], effect: 60 },
          { text: "gain 120 essence.", effects: [gainEssence(120)], effect: 120 },
          { text: "gain 210 essence.", effects: [gainEssence(210)], effect: 210 },
        ],
      },
      {
        costs: [20, 45, 70],
        rewards: [
          { text: "choose 1 of 2 Dreamsigns.", effects: [dreamsignReward], targets: [target("dreamsign", DREAMSIGN_POOL_TARGET_DESCRIPTION, dreamsignReward.predicate)], effect: valueDreamsignDraft(dreamsignReward, context) },
          { text: "choose 1 of 2 Dreamsigns and gain 1 omen.", effects: [dreamsignReward, gainOmen(1)], targets: [target("dreamsign", DREAMSIGN_POOL_TARGET_DESCRIPTION, dreamsignReward.predicate)], effect: valueDreamsignDraft(dreamsignReward, context) + valueOmenGain(1) },
          { text: "choose 1 of 3 Dreamsigns and gain 2 omens.", effects: [dreamsignDraft(3), gainOmen(2)], targets: [target("dreamsign", DREAMSIGN_POOL_TARGET_DESCRIPTION, dreamsignReward.predicate)], effect: valueDreamsignDraft(dreamsignDraft(3), context) + valueOmenGain(2) },
        ],
      },
      {
        costs: [10, 25, 45],
        rewards: [
          { text: "draw 1 extra card in your opening hand for the next 3 battles.", effects: [{ kind: "battle_window_modifier", duration: BATTLE_WINDOW_DURATION, modifier: "opening_hand_cards", amount: 1 }], effect: 155 },
          { text: "gain 1 extra energy on turn 1 for the next 3 battles.", effects: [{ kind: "battle_window_modifier", duration: BATTLE_WINDOW_DURATION, modifier: "turn_1_energy", amount: 1 }], effect: 160 },
          { text: "give all event cards in your deck Fast for the next 3 battles.", effects: [{ kind: "card_rewrite", keyword: "Fast", duration: BATTLE_WINDOW_DURATION, scope: "all_matching_cards_in_deck", predicate: { cardType: "Event" } }], effect: 165 },
        ],
      },
    ];
  
    if (context.state.quest.deck.summary.starterCards > 0) {
      profiles.push({
        costs: [10, 30, 55],
        rewards: [
          { text: "purge up to 1 chosen Starter card.", effects: [starterCleanup(1)], targets: [target("card", "Starter cards in deck", { source: "deck", starter: true })], effect: 85 },
          { text: "purge up to 1 chosen Starter card and gain 1 omen.", effects: [starterCleanup(1), gainOmen(1)], targets: [target("card", "Starter cards in deck", { source: "deck", starter: true })], effect: 85 + valueOmenGain(1) },
          { text: "purge up to 2 chosen Starter cards and gain 2 omens.", effects: [starterCleanup(2), gainOmen(2)], targets: [target("card", "Starter cards in deck", { source: "deck", starter: true })], effect: 170 + valueOmenGain(2) },
        ],
      });
    }
  
    const profile = pickSequentialVariant(drawContext, "escalating-chain:profile", profiles);
    const costShift = pickSequentialVariant(drawContext, "escalating-chain:cost-shift", [0, 5, 10]);
  
    return tree(profile.rewards.map((reward, index) => {
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
          terminal: { text: "Leave.", outcome: "leave", costs: [], effects: [], burdens: [], targets: [], routeEffects: [] },
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
            ? { terminal: { text: "End the Journey.", outcome: "claim" as const, costs: [cost("essence", price)], effects: reward.effects, burdens: [], targets: reward.targets ?? [], routeEffects: [] } }
            : { nextNodeId: `level-${level + 1}` }),
        }),
      ],
      };
    }));
  }
  
  function buildPushYourLuckTree(context: JourneyContext, drawContext: DrawContext): JourneyTree {
    const cardProfile = legalCardDraftProfile(context, [
      CARD_DRAFT_PROFILES.events,
      CARD_DRAFT_PROFILES.characters,
    ]);
    const cardDraft = draftCards(cardProfile);
    const transfiguration = pickSequentialVariant(drawContext, "push-your-luck:transfiguration", [
      "Bronze",
      "Scarlet",
      "Viridian",
      "Golden",
      "Prismatic",
    ]);
    const profiles: { chances: number[]; rewards: SequentialReward[] }[] = [
      {
        chances: [80, 60, 40],
        rewards: [
          { text: "gain 45 essence.", effects: [gainEssence(45)], effect: 45 },
          { text: "gain 95 essence.", effects: [gainEssence(95)], effect: 95 },
          { text: "gain 170 essence.", effects: [gainEssence(170)], effect: 170 },
        ],
      },
      {
        chances: [75, 55, 35],
        rewards: [
          { text: "gain 1 omen.", effects: [gainOmen(1)], effect: valueOmenGain(1) },
          { text: "gain 2 omens.", effects: [gainOmen(2)], effect: valueOmenGain(2) },
          { text: "gain 4 omens.", effects: [gainOmen(4)], effect: valueOmenGain(4) },
        ],
      },
      {
        chances: [70, 50, 30],
        rewards: [
          { text: lowerFirst(cardDraftText(cardProfile)), effects: [cardDraft], targets: [target("card", cardProfile.targetDescription, cardDraft.predicate)], effect: valueCardDraft(cardDraft) },
          { text: `${lowerFirst(cardDraftText(cardProfile))} Gain 1 omen.`, effects: [cardDraft, gainOmen(1)], targets: [target("card", cardProfile.targetDescription, cardDraft.predicate)], effect: valueCardDraft(cardDraft) + valueOmenGain(1) },
          { text: `${lowerFirst(cardDraftText(cardProfile))} Gain 2 omens.`, effects: [cardDraft, gainOmen(2)], targets: [target("card", cardProfile.targetDescription, cardDraft.predicate)], effect: valueCardDraft(cardDraft) + valueOmenGain(2) },
        ],
      },
      {
        chances: [85, 65, 45],
        rewards: [
          { text: `apply {${transfiguration} Transfiguration} to a random card.`, effects: [{ kind: "transfiguration", transfigurationName: transfiguration, scope: "random_card" }], targets: [target("card", "a random card in deck", { source: "deck" })], effect: 100 },
          { text: `apply {${transfiguration} Transfiguration} to a random card and gain 1 omen.`, effects: [{ kind: "transfiguration", transfigurationName: transfiguration, scope: "random_card" }, gainOmen(1)], targets: [target("card", "a random card in deck", { source: "deck" })], effect: 100 + valueOmenGain(1) },
          { text: `apply {${transfiguration} Transfiguration} to up to 2 chosen cards.`, effects: [{ kind: "transfiguration", transfigurationName: transfiguration, scope: "up_to_2_chosen_cards" }], targets: [target("card", "cards in deck", { source: "deck" })], effect: 200 },
        ],
      },
      {
        chances: [65, 50, 35],
        rewards: [
          { text: "draw 1 extra card in your opening hand for the next 3 battles.", effects: [{ kind: "battle_window_modifier", duration: BATTLE_WINDOW_DURATION, modifier: "opening_hand_cards", amount: 1 }], effect: 155 },
          { text: "gain 1 extra energy on turn 1 for the next 3 battles.", effects: [{ kind: "battle_window_modifier", duration: BATTLE_WINDOW_DURATION, modifier: "turn_1_energy", amount: 1 }], effect: 160 },
          { text: "give all fast cards in your deck Reclaim 1 for the next 3 battles.", effects: [{ kind: "card_rewrite", keyword: "Reclaim", amount: 1, duration: BATTLE_WINDOW_DURATION, scope: "all_matching_cards_in_deck", predicate: { isFast: true } }], effect: 170 },
        ],
      },
    ];
    const profile = pickSequentialVariant(drawContext, "push-your-luck:profile", profiles);
    const failureBaneName = pickSequentialVariant(drawContext, "push-your-luck:failure-bane", [
      "Nightmare",
      "Despair",
      "Envy",
      "Silence",
      "Paranoia",
    ] as const);
    const failureBane = { kind: "bane_gain", baneName: failureBaneName, count: 1 };
    const failureBurden = valueBaneGain(failureBaneName, 1);
  
    return tree([1, 2, 3].map((level) => {
      const reward = profile.rewards[level - 1]!;
      const successPercent = profile.chances[level - 1]!;
  
      return {
        id: `level-${level}`,
        levelLabel: `Level ${level}`,
        branches: [
          treeBranch({
            id: `level-${level}-stop`,
            label: "Stop",
            text: level === 1 ? "Leave." : "Keep the last safe reward. End the Journey.",
            terminal: { text: "End the Journey.", outcome: level === 1 ? "leave" : "end", costs: [], effects: [], burdens: [], targets: [], routeEffects: [] },
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
              ? { terminal: { text: "End the Journey.", outcome: "claim" as const, costs: [], effects: reward.effects, burdens: [], targets: reward.targets ?? [], routeEffects: [] } }
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
            terminal: { text: "End the Journey.", outcome: "failure", costs: [], effects: [], burdens: [failureBane], targets: [], routeEffects: [] },
          }),
        ],
      };
    }));
  }
  
  function decisionTreeForShape(shapeId: JourneyShapeId, context: JourneyContext, drawContext: DrawContext): {
    tree?: JourneyTree;
    rewardPool?: JourneyRewardPool;
    precommitted: PrecommittedOutcomes;
  } {
    switch (shapeId) {
      case "prize_ladder":
        return { tree: buildPrizeLadderTree(context, drawContext), precommitted: {} };
      case "probability_ladder":
        return { tree: buildProbabilityLadderTree(context, drawContext), precommitted: { random: [{ kind: "probability_ladder", bounded: true }] } };
      case "random_pool_draws": {
        const pool = randomPool(context, drawContext);
  
        return {
          tree: buildRandomPoolDrawsTree(context, drawContext),
          rewardPool: pool,
          precommitted: { random: pool.rewards },
        };
      }
      case "push_your_luck":
        return { tree: buildPushYourLuckTree(context, drawContext), precommitted: { random: [{ kind: "push_failure", bounded: true }] } };
      case "escalating_reward_chain":
        return { tree: buildEscalatingRewardChainTree(context, drawContext), precommitted: {} };
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
