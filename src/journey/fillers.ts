import type { ContentBundle } from "../content/model.js";
import type { JourneyContext } from "../quest/context.js";
import {
  BANE_NAMES,
  type CardTargetPredicate,
  resolveCardTargets,
  resolveDreamsignTargets,
  STANDARD_TRANSFIGURATIONS,
} from "./effects.js";
import type {
  JourneyManifest,
  JourneyOption,
  JourneyRewardPool,
  JourneyStage,
  JourneyTree,
  JourneyTreeBranch,
  ManifestReferences,
  PickBehavior,
  PrecommittedOutcomes,
} from "./manifest.js";
import { MANIFEST_SCHEMA_VERSION } from "./manifest.js";
import { getShapeDefinition, type JourneyShapeId } from "./shapes.js";
import { symbolsForOption } from "./symbols.js";
import {
  commonEssenceRewardAmount,
  evaluateOptionValue,
  LOSS_CHOICE_VALUE_CONSTANTS,
  TIMING_AND_RANDOMNESS_VALUE_CONSTANTS,
  valueBaneGain,
  valueCardDraft,
  valueDreamsignDraft,
  valueEssenceGain,
  valueOmenGain,
  valueOmenLoss,
  type ValueBreakdown,
} from "./value.js";
import { drawInt, shuffleDeterministic, type DrawContext } from "../util/rng.js";

type BuildArgs = {
  context: JourneyContext;
  drawContext: DrawContext;
  journeyId: string;
  shapeId: JourneyShapeId;
  stage: JourneyStage;
  selectedTags: string[];
  shapeScores: { shapeId: JourneyShapeId; score: number }[];
  previousPick?: JourneyManifest["debug"]["previousPick"];
};

type OptionArgs = {
  number: number;
  text: string;
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
  pickBehavior?: PickBehavior;
};

type SequentialReward = {
  text: string;
  effects: unknown[];
  targets?: unknown[];
  effect: number;
};

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en-US"));
}

function option(args: OptionArgs): JourneyOption {
  const built: JourneyOption = {
    number: args.number,
    symbols: [],
    text: args.text,
    costs: args.costs ?? [],
    effects: args.effects ?? [],
    burdens: args.burdens ?? [],
    targets: args.targets ?? [],
    triggers: args.triggers ?? [],
    routeEffects: args.routeEffects ?? [],
    costConvertedEssence: args.cost ?? 0,
    effectConvertedEssence: args.effect ?? 0,
    burdenConvertedEssence: args.burden ?? 0,
    uncertaintyConvertedEssence: args.uncertainty ?? 0,
    netConvertedEssence:
      (args.effect ?? 0) - (args.cost ?? 0) + (args.burden ?? 0) + (args.uncertainty ?? 0),
    pickBehavior: args.pickBehavior ?? "record_and_generate_next",
  };

  return {
    ...built,
    symbols: symbolsForOption(built),
  };
}

function selectedCardTargets(context: JourneyContext, drawContext: DrawContext) {
  const selected = resolveCardTargets(context.content, context.state.quest, {
    source: "draftPool",
    tideOverlap: "selected",
  });
  const fallback = resolveCardTargets(context.content, context.state.quest, {
    source: "draftPool",
  });

  return shuffleDeterministic(
    drawContext,
    "targets:cards",
    selected.length > 0 ? selected : fallback,
  );
}

function selectedDreamsignTargets(context: JourneyContext, drawContext: DrawContext) {
  const selected = resolveDreamsignTargets(context.content, context.state.quest, {
    source: "pool",
    tideOverlap: "selected",
  });
  const fallback = resolveDreamsignTargets(context.content, context.state.quest, {
    source: "pool",
  });

  return shuffleDeterministic(
    drawContext,
    "targets:dreamsigns",
    selected.length > 0 ? selected : fallback,
  );
}

const CARD_POOL_TARGET_DESCRIPTION = "eligible draft cards";
const DREAMSIGN_POOL_TARGET_DESCRIPTION = "eligible Dreamsigns";
const CARD_DRAFT_CHOICE_COUNT = 4;
const BATTLE_WINDOW_DURATION = "next 3 battles";

type CardDraftProfile = {
  label: string;
  targetDescription: string;
  predicate: Omit<CardTargetPredicate, "source">;
};

const CARD_DRAFT_PROFILES = {
  warriors: {
    label: "warriors",
    targetDescription: "Warrior draft cards",
    predicate: { cardType: "Character", subtype: "Warrior" },
  },
  survivors: {
    label: "survivors",
    targetDescription: "Survivor draft cards",
    predicate: { cardType: "Character", subtype: "Survivor" },
  },
  spiritAnimals: {
    label: "spirit animals",
    targetDescription: "Spirit Animal draft cards",
    predicate: { cardType: "Character", subtype: "Spirit Animal" },
  },
  characters: {
    label: "characters",
    targetDescription: "Character draft cards",
    predicate: { cardType: "Character" },
  },
  events: {
    label: "events",
    targetDescription: "Event draft cards",
    predicate: { cardType: "Event" },
  },
  dissolveEvents: {
    label: "Dissolve events",
    targetDescription: "Dissolve event draft cards",
    predicate: { cardType: "Event", renderedTextIncludes: "Dissolve" },
  },
  fastCharacters: {
    label: "fast characters",
    targetDescription: "Fast character draft cards",
    predicate: { cardType: "Character", isFast: true },
  },
  materializedCharacters: {
    label: "characters with a Materialized ability",
    targetDescription: "Character draft cards with a Materialized ability",
    predicate: { cardType: "Character", renderedTextIncludes: "Materialized" },
  },
  lowCostCharacters: {
    label: "low-cost characters",
    targetDescription: "Low-cost character draft cards",
    predicate: { cardType: "Character", maxEnergyCost: 2 },
  },
  reclaimEvents: {
    label: "Reclaim events",
    targetDescription: "Reclaim event draft cards",
    predicate: { cardType: "Event", renderedTextIncludes: "Reclaim" },
  },
} as const satisfies Record<string, CardDraftProfile>;

const GENERIC_CARD_DRAFT_PROFILE = {
  label: "cards",
  targetDescription: CARD_POOL_TARGET_DESCRIPTION,
  predicate: {},
} as const satisfies CardDraftProfile;

function cardDraftPredicate(profile: CardDraftProfile): CardTargetPredicate {
  return {
    source: "draftPool",
    ...profile.predicate,
  };
}

function legalCardDraftProfile(
  context: JourneyContext,
  profiles: readonly CardDraftProfile[],
): CardDraftProfile {
  return profiles.find((profile) =>
    resolveCardTargets(
      context.content,
      context.state.quest,
      cardDraftPredicate(profile),
    ).length >= CARD_DRAFT_CHOICE_COUNT
  ) ?? GENERIC_CARD_DRAFT_PROFILE;
}

function target(kind: "card" | "dreamsign", description: string, predicate: unknown) {
  return {
    kind,
    description,
    predicate,
    required: true,
  };
}

function cost(kind: "essence" | "omens", amount: number) {
  return {
    kind,
    amount,
    timing: "immediate",
  };
}

function gainEssence(amount: number) {
  return {
    kind: "gain_essence",
    amount,
  };
}

function gainOmen(amount: number) {
  return {
    kind: "gain_omens",
    amount,
  };
}

function cardDraftText(profile: CardDraftProfile, takeCount = 1): string {
  return `Draft ${takeCount} of ${CARD_DRAFT_CHOICE_COUNT} ${profile.label}.`;
}

function dreamsignDraftText(choiceCount: number): string {
  return `Choose 1 of ${choiceCount} Dreamsigns.`;
}

function chosenCardText(): string {
  return "a chosen card";
}

function draftCards(profile: CardDraftProfile) {
  return {
    kind: "card_draft",
    takeCount: 1,
    choiceCount: CARD_DRAFT_CHOICE_COUNT,
    predicate: cardDraftPredicate(profile),
  };
}

function dreamsignDraft(choiceCount: number) {
  return {
    kind: "dreamsign_draft",
    choiceCount,
    predicate: { source: "pool", tideOverlap: "selected" },
  };
}

function pickSequentialVariant<T>(
  drawContext: DrawContext,
  label: string,
  variants: readonly T[],
): T {
  return variants[drawInt(drawContext, label, 0, variants.length - 1)]!;
}

function sentenceCase(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function payableSequentialCost(context: JourneyContext, desiredAmount: number): number {
  return Math.min(desiredAmount, context.state.quest.resources.essence);
}

function sequentialReward(context: JourneyContext, drawContext: DrawContext, label: string): SequentialReward {
  const cardProfile = legalCardDraftProfile(context, [
    CARD_DRAFT_PROFILES.events,
    CARD_DRAFT_PROFILES.lowCostCharacters,
    CARD_DRAFT_PROFILES.characters,
  ]);
  const cardDraft = draftCards(cardProfile);
  const essenceAmount = pickSequentialVariant(drawContext, `${label}:essence`, [90, 110, 130]);
  const variants: SequentialReward[] = [
    {
      text: `gain ${essenceAmount} essence.`,
      effects: [gainEssence(essenceAmount)],
      effect: valueEssenceGain(essenceAmount, context),
    },
    {
      text: "gain 2 omens.",
      effects: [gainOmen(2)],
      effect: valueOmenGain(2),
    },
    {
      text: `${lowerFirst(cardDraftText(cardProfile))}`,
      effects: [cardDraft],
      targets: [target("card", cardProfile.targetDescription, cardDraft.predicate)],
      effect: valueCardDraft(cardDraft),
    },
  ];

  if (context.state.quest.dreamsignPoolIds.length > 0) {
    const choiceCount = pickSequentialVariant(drawContext, `${label}:dreamsign-choice`, [2, 3]);
    const dreamsignReward = dreamsignDraft(choiceCount);

    variants.push({
      text: `${lowerFirst(dreamsignDraftText(choiceCount))}`,
      effects: [dreamsignReward],
      targets: [target("dreamsign", DREAMSIGN_POOL_TARGET_DESCRIPTION, dreamsignReward.predicate)],
      effect: valueDreamsignDraft(dreamsignReward, context),
    });
  }

  if (context.state.quest.deck.summary.starterCards > 0) {
    variants.push({
      text: "purge up to 1 chosen Starter card.",
      effects: [starterCleanup(1)],
      targets: [target("card", "Starter cards in deck", { source: "deck", starter: true })],
      effect: 85,
    });
  }

  return pickSequentialVariant(drawContext, label, variants);
}

function delayedDreamsignDraftValue(
  reward: ReturnType<typeof dreamsignDraft>,
  context: JourneyContext,
  multiplier: number,
): number {
  return Math.round(valueDreamsignDraft(reward, context) * multiplier);
}

function starterCleanup(count: number) {
  return {
    kind: "starter_cleanup",
    count,
    predicate: { source: "deck", starter: true },
  };
}

function nightmare(count: number) {
  return {
    kind: "bane_gain",
    baneName: "Nightmare",
    count,
  };
}

function comparableEssenceLossAmount(comparisonLosses: readonly number[], availableEssence: number): number | null {
  const magnitudes = comparisonLosses
    .map((loss) => Math.abs(loss))
    .filter((loss) => loss >= LOSS_CHOICE_VALUE_CONSTANTS.minimumComparableMagnitude)
    .sort((left, right) => left - right);

  if (magnitudes.length === 0) {
    return null;
  }

  const lowest = magnitudes[0]!;
  const highest = magnitudes[magnitudes.length - 1]!;
  const target = Math.round(((lowest + highest) / 2) / 5) * 5;
  const payable = Math.min(target, availableEssence);

  return payable >= LOSS_CHOICE_VALUE_CONSTANTS.minimumComparableMagnitude ? payable : null;
}

function referencesFor(content: ContentBundle, cardIds: readonly string[], dreamsignIds: readonly string[]): ManifestReferences {
  const dreamcallerIds = content.dreamcallers.map((dreamcaller) => dreamcaller.id);

  return {
    cardIds: uniqueSorted(cardIds),
    dreamsignIds: uniqueSorted(dreamsignIds),
    dreamcallerIds: uniqueSorted(dreamcallerIds),
    baneNames: ["Nightmare"],
  };
}

function commonPositiveOptions(context: JourneyContext): JourneyOption[] {
  const essenceAmount = commonEssenceRewardAmount(context);
  const essenceValue = valueEssenceGain(essenceAmount, context);
  const cardDraftProfile = legalCardDraftProfile(context, [
    CARD_DRAFT_PROFILES.characters,
    CARD_DRAFT_PROFILES.events,
  ]);
  const cardDraft = draftCards(cardDraftProfile);
  const dreamsignChoice = dreamsignDraft(3);
  const fallbackReward = context.state.quest.deck.summary.starterCards > 0
    ? option({
        number: 3,
        text: "Purge up to 1 chosen Starter card. Gain 4 omens.",
        effects: [starterCleanup(1), gainOmen(4)],
        targets: [target("card", "Starter cards in deck", { source: "deck", starter: true })],
        effect: 85 + valueOmenGain(4),
      })
    : option({
        number: 3,
        text: "Gain 330 essence.",
        effects: [gainEssence(330)],
        effect: valueEssenceGain(330, context),
      });
  const resourceOption = essenceValue >= 300
    ? option({
        number: 1,
        text: `Gain ${essenceAmount} essence.`,
        effects: [gainEssence(essenceAmount)],
        effect: essenceValue,
      })
    : option({
        number: 1,
        text: "Gain 6 omens.",
        effects: [gainOmen(6)],
        effect: valueOmenGain(6),
      });

  return [
    resourceOption,
    option({
      number: 2,
      text: `${cardDraftText(cardDraftProfile)} Gain 4 omens.`,
      effects: [cardDraft, gainOmen(4)],
      targets: [target("card", cardDraftProfile.targetDescription, cardDraft.predicate)],
      effect: valueCardDraft(cardDraft) + valueOmenGain(4),
    }),
    context.state.quest.dreamsignPoolIds.length > 0
      ? option({
          number: 3,
          text: dreamsignDraftText(3),
          effects: [dreamsignChoice],
          targets: [target("dreamsign", DREAMSIGN_POOL_TARGET_DESCRIPTION, { source: "pool", tideOverlap: "selected" })],
          effect: valueDreamsignDraft(dreamsignChoice, context),
        })
      : fallbackReward,
  ];
}

function paidDraft(
  context: JourneyContext,
  number: number,
  price: number,
  profiles: readonly CardDraftProfile[],
): JourneyOption {
  const cardDraftProfile = legalCardDraftProfile(context, profiles);
  const cardDraft = draftCards(cardDraftProfile);

  return option({
    number,
    text: `Pay ${price} essence. ${cardDraftText(cardDraftProfile)}`,
    costs: [cost("essence", price)],
    effects: [cardDraft],
    targets: [target("card", cardDraftProfile.targetDescription, cardDraft.predicate)],
    cost: price,
    effect: valueCardDraft(cardDraft),
  });
}

function routeEdit(number: number, future = false): JourneyOption {
  const timing = future ? "in the next dreamscape" : "in the current dreamscape";

  return option({
    number,
    text: `Replace a Shop site ${timing} with a Purge site.`,
    routeEffects: [
      {
        kind: future ? "future_route_replacement" : "current_route_replacement",
        fromSite: "Shop",
        toSite: "Purge",
        timing: future ? "next dreamscape" : "current dreamscape",
        source: "simulated_manifest_only",
      },
    ],
    effect: future ? 50 : 95,
  });
}

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
  terminal?: JourneyTreeBranch["terminal"];
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
        costs,
        effects,
        burdens,
        targets,
        routeEffects,
      }
    : undefined;

  return {
    id: args.id,
    label: args.label,
    kind: args.kind ?? "player_choice",
    text: args.text,
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
}

function odds(percent: number): JourneyTreeBranch["odds"] {
  return { numerator: percent, denominator: 100, percent };
}

function tree(nodes: JourneyTree["nodes"]): JourneyTree {
  return {
    rootNodeId: nodes[0]?.id ?? "level-1",
    nodes,
  };
}

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

  return {
    summary: selected.summary,
    replacement: "with_replacement",
    rewards: selected.rewards,
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

  return tree(profile.rewards.map((reward, index) => {
    const level = index + 1;
    const price = payableSequentialCost(context, profile.costs[index]!);
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
  ];
  const profile = pickSequentialVariant(drawContext, "push-your-luck:profile", profiles);

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
          text: "Gain 1 Nightmare. End the Journey.",
          odds: odds(100 - successPercent),
          burdens: [nightmare(1)],
          burden: -125,
          terminal: { text: "End the Journey.", outcome: "failure", costs: [], effects: [], burdens: [nightmare(1)], targets: [], routeEffects: [] },
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

function fillOptions(shapeId: JourneyShapeId, context: JourneyContext, drawContext: DrawContext): {
  options: JourneyOption[];
  tree?: JourneyTree;
  rewardPool?: JourneyRewardPool;
  precommitted: PrecommittedOutcomes;
} {
  const payablePrice = Math.min(30, context.state.quest.resources.essence);
  const premiumPrice = Math.min(45, context.state.quest.resources.essence);

  switch (shapeId) {
    case "random_allocation":
      return { options: commonPositiveOptions(context), precommitted: {} };
    case "same_cost_different_rewards":
      return {
        options: [
          paidDraft(context, 1, Math.min(20, context.state.quest.resources.essence), [
            CARD_DRAFT_PROFILES.warriors,
            CARD_DRAFT_PROFILES.characters,
          ]),
          paidDraft(context, 2, Math.min(20, context.state.quest.resources.essence), [
            CARD_DRAFT_PROFILES.dissolveEvents,
            CARD_DRAFT_PROFILES.events,
          ]),
          paidDraft(context, 3, Math.min(20, context.state.quest.resources.essence), [
            CARD_DRAFT_PROFILES.materializedCharacters,
            CARD_DRAFT_PROFILES.spiritAnimals,
          ]),
        ],
        precommitted: {},
      };
    case "same_reward_different_costs": {
      const discountProfile = legalCardDraftProfile(context, [
        CARD_DRAFT_PROFILES.lowCostCharacters,
        CARD_DRAFT_PROFILES.characters,
      ]);
      const discountDraft = draftCards(discountProfile);
      const omenProfile = legalCardDraftProfile(context, [
        CARD_DRAFT_PROFILES.events,
        CARD_DRAFT_PROFILES.characters,
      ]);
      const omenDraft = draftCards(omenProfile);
      const premiumProfile = legalCardDraftProfile(context, [
        CARD_DRAFT_PROFILES.reclaimEvents,
        CARD_DRAFT_PROFILES.dissolveEvents,
        CARD_DRAFT_PROFILES.events,
      ]);
      const premiumDraft = draftCards(premiumProfile);
      const premiumOmenCount = premiumProfile === omenProfile ? 2 : 1;

      return {
        options: [
          option({
            number: 1,
            text: `Pay ${Math.min(20, context.state.quest.resources.essence)} essence. ${cardDraftText(discountProfile)}`,
            costs: [cost("essence", Math.min(20, context.state.quest.resources.essence))],
            effects: [discountDraft],
            targets: [target("card", discountProfile.targetDescription, discountDraft.predicate)],
            cost: Math.min(20, context.state.quest.resources.essence),
            effect: valueCardDraft(discountDraft),
          }),
          option({
            number: 2,
            text: `Pay ${payablePrice} essence. ${cardDraftText(omenProfile)} Gain 1 omen.`,
            costs: [cost("essence", payablePrice)],
            effects: [omenDraft, gainOmen(1)],
            targets: [target("card", omenProfile.targetDescription, omenDraft.predicate)],
            cost: payablePrice,
            effect: valueCardDraft(omenDraft) + valueOmenGain(1),
          }),
          option({
            number: 3,
            text: `Pay ${premiumPrice} essence. ${cardDraftText(premiumProfile)} Gain ${premiumOmenCount} ${premiumOmenCount === 1 ? "omen" : "omens"}.`,
            costs: [cost("essence", premiumPrice)],
            effects: [premiumDraft, gainOmen(premiumOmenCount)],
            targets: [target("card", premiumProfile.targetDescription, premiumDraft.predicate)],
            cost: premiumPrice,
            effect: valueCardDraft(premiumDraft) + valueOmenGain(premiumOmenCount),
          }),
        ],
        precommitted: {},
      };
    }
    case "service_menu":
      return {
        options: [
          option({
            number: 1,
            text: "Purge up to 1 chosen Starter card. Gain 4 omens.",
            effects: [starterCleanup(1), gainOmen(4)],
            targets: [target("card", "Starter cards in deck", { source: "deck", starter: true })],
            effect: 85 + valueOmenGain(4),
          }),
          (() => {
            const price = Math.min(25, context.state.quest.resources.essence);
            const cardDraftProfile = legalCardDraftProfile(context, [
              CARD_DRAFT_PROFILES.survivors,
              CARD_DRAFT_PROFILES.characters,
            ]);
            const cardDraft = draftCards(cardDraftProfile);

            return option({
              number: 2,
              text: `Pay ${price} essence. ${cardDraftText(cardDraftProfile)} Gain 4 omens.`,
              costs: [cost("essence", price)],
              effects: [cardDraft, gainOmen(4)],
              targets: [target("card", cardDraftProfile.targetDescription, cardDraft.predicate)],
              cost: price,
              effect: valueCardDraft(cardDraft) + valueOmenGain(4),
            });
          })(),
          option({
            number: 3,
            text: dreamsignDraftText(3),
            effects: [dreamsignDraft(3)],
            targets: [target("dreamsign", DREAMSIGN_POOL_TARGET_DESCRIPTION, { source: "pool", tideOverlap: "selected" })],
            effect: valueDreamsignDraft(dreamsignDraft(3), context),
          }),
        ],
        precommitted: {},
      };
    case "shop_row":
      return {
        options: [
          paidDraft(context, 1, 15, [
            CARD_DRAFT_PROFILES.lowCostCharacters,
            CARD_DRAFT_PROFILES.characters,
          ]),
          paidDraft(context, 2, 20, [
            CARD_DRAFT_PROFILES.fastCharacters,
            CARD_DRAFT_PROFILES.events,
          ]),
          paidDraft(context, 3, 25, [
            CARD_DRAFT_PROFILES.spiritAnimals,
            CARD_DRAFT_PROFILES.materializedCharacters,
          ]),
        ],
        precommitted: {},
      };
    case "curated_reward_trio":
      return { options: commonPositiveOptions(context), precommitted: {} };
    case "heterogeneous_pair": {
      const positiveOptions = commonPositiveOptions(context);
      const options = positiveOptions.length >= 3
        ? [positiveOptions[0]!, positiveOptions[2]!]
        : positiveOptions.slice(0, 2);

      return {
        options: options.map((item, index) => ({
          ...item,
          number: index + 1,
        })),
        precommitted: {},
      };
    }
    case "one_target_many_operations":
      return {
        options: [
          option({
            number: 1,
            text: `Apply Viridian to ${chosenCardText()}.`,
            effects: [{ kind: "transfiguration", transfigurationName: "Viridian" }],
            targets: [target("card", CARD_POOL_TARGET_DESCRIPTION, { source: "draftPool", tideOverlap: "selected" })],
            effect: 85,
          }),
          option({
            number: 2,
            text: `Add Fast to ${chosenCardText()}.`,
            effects: [{ kind: "card_rewrite", keyword: "Fast" }],
            targets: [target("card", CARD_POOL_TARGET_DESCRIPTION, { source: "draftPool", tideOverlap: "selected" })],
            effect: 70,
          }),
          option({
            number: 3,
            text: `Add Reclaim 1 to ${chosenCardText()}.`,
            effects: [{ kind: "card_rewrite", keyword: "Reclaim", amount: 1 }],
            targets: [target("card", CARD_POOL_TARGET_DESCRIPTION, { source: "draftPool", tideOverlap: "selected" })],
            effect: 75,
          }),
        ],
        precommitted: {},
      };
    case "take_any_number": {
      const price = Math.min(15, context.state.quest.resources.essence);
      return {
        options: [
          option({
            number: 1,
            text: "Take up to 2 rewards from this cache. Pay 15 essence to gain 1 omen.",
            costs: [cost("essence", price)],
            effects: [gainOmen(1)],
            cost: price,
            effect: valueOmenGain(1),
          }),
          option({
            number: 2,
            text: "Take up to 2 rewards from this cache. Purge up to 1 chosen Starter card and gain 1 Nightmare.",
            effects: [starterCleanup(1)],
            burdens: [nightmare(1)],
            targets: [target("card", "Starter cards in deck", { source: "deck", starter: true })],
            effect: 85,
            burden: -125,
          }),
          option({
            number: 3,
            text: "Leave the cache.",
            pickBehavior: "leave",
          }),
        ],
        precommitted: {},
      };
    }
    case "prize_ladder":
    case "probability_ladder":
    case "random_pool_draws":
    case "push_your_luck":
    case "escalating_reward_chain": {
      const filled = decisionTreeForShape(shapeId, context, drawContext);

      return {
        options: [],
        ...filled,
      };
    }
    case "mirrored_operations":
      return {
        options: [
          option({
            number: 1,
            text: `Apply Bronze to ${chosenCardText()}.`,
            effects: [{ kind: "transfiguration", transfigurationName: "Bronze" }],
            targets: [target("card", CARD_POOL_TARGET_DESCRIPTION, { source: "draftPool", tideOverlap: "selected" })],
            effect: 85,
          }),
          option({
            number: 2,
            text: `Apply Viridian to ${chosenCardText()}.`,
            effects: [{ kind: "transfiguration", transfigurationName: "Viridian" }],
            targets: [target("card", CARD_POOL_TARGET_DESCRIPTION, { source: "draftPool", tideOverlap: "selected" })],
            effect: 85,
          }),
          option({
            number: 3,
            text: `Apply Golden to ${chosenCardText()}.`,
            effects: [{ kind: "transfiguration", transfigurationName: "Golden" }],
            targets: [target("card", CARD_POOL_TARGET_DESCRIPTION, { source: "draftPool", tideOverlap: "selected" })],
            effect: 85,
          }),
        ],
        precommitted: {},
      };
    case "one_operation_many_targets":
      return {
        options: [
          option({
            number: 1,
            text: `Apply Viridian to ${chosenCardText()}.`,
            effects: [{ kind: "transfiguration", transfigurationName: "Viridian" }],
            targets: [target("card", CARD_POOL_TARGET_DESCRIPTION, { source: "draftPool", tideOverlap: "selected" })],
            effect: 85,
          }),
          option({
            number: 2,
            text: "Apply Viridian to a chosen Starter card.",
            effects: [{ kind: "transfiguration", transfigurationName: "Viridian" }],
            targets: [target("card", "Starter cards in deck", { source: "deck", starter: true })],
            effect: 85,
          }),
          option({
            number: 3,
            text: "Apply Viridian to a chosen card in your deck.",
            effects: [{ kind: "transfiguration", transfigurationName: "Viridian" }],
            targets: [target("card", "cards in deck", { source: "deck" })],
            effect: 85,
          }),
        ],
        precommitted: {},
      };
    case "choose_your_loss":
      {
        const omenLoss = valueOmenLoss(1);
        const nightmareLoss = valueBaneGain("Nightmare", 1);
        const essenceLoss = comparableEssenceLossAmount(
          [
            ...(context.state.quest.resources.omens >= 1 ? [omenLoss] : []),
            nightmareLoss,
          ],
          context.state.quest.resources.essence,
        );
        const options: JourneyOption[] = [];

        if (essenceLoss !== null) {
          options.push(option({
            number: options.length + 1,
            text: `Pay ${essenceLoss} essence.`,
            costs: [cost("essence", essenceLoss)],
            cost: essenceLoss,
          }));
        }

        if (context.state.quest.resources.omens >= 1) {
          options.push(option({
            number: options.length + 1,
            text: "Lose 1 omen.",
            costs: [cost("omens", 1)],
            cost: Math.abs(omenLoss),
          }));
        }

        options.push(option({
          number: options.length + 1,
          text: "Gain 1 Nightmare.",
          burdens: [nightmare(1)],
          burden: nightmareLoss,
        }));

        return {
          options,
          precommitted: {},
        };
      }
    case "single_reward":
      return { options: commonPositiveOptions(context).slice(0, 2), precommitted: {} };
    case "single_offer":
      return {
        options: [
          paidDraft(context, 1, payablePrice, [
            CARD_DRAFT_PROFILES.materializedCharacters,
            CARD_DRAFT_PROFILES.characters,
          ]),
          option({ number: 2, text: "Leave with no effect.", pickBehavior: "leave" }),
        ],
        precommitted: {},
      };
    case "risk_or_skip":
      {
        const rewardAmount = 160;
        const downsideChancePercent = 50;
        const roll = drawInt(drawContext, "risk-or-skip-downside-roll:1", 1, 100);
        const downside = nightmare(1);

        return {
          options: [
            option({
              number: 1,
              text: `Gain ${rewardAmount} essence. ${downsideChancePercent}% chance to gain 1 Nightmare; otherwise no downside.`,
              effects: [gainEssence(rewardAmount)],
              effect: valueEssenceGain(rewardAmount, context),
              uncertainty: Math.round(valueBaneGain("Nightmare", 1) * (downsideChancePercent / 100)),
            }),
            option({ number: 2, text: "Leave with no effect.", pickBehavior: "leave" }),
          ],
          precommitted: {
            random: [
              {
                kind: "risk_downside_roll",
                optionNumber: 1,
                odds: odds(downsideChancePercent),
                downside,
                safe: { kind: "no_downside" },
                committedResult: roll <= downsideChancePercent ? "downside" : "safe",
                presentation: "visible_odds_debug_roll",
              },
            ],
          },
        };
      }
    case "single_wager":
      {
        const firstSuccessPercent = 50;
        const firstSuccessReward = gainEssence(160);
        const firstRoll = drawInt(drawContext, "single-wager-roll:1", 1, 100);
        const firstCommittedResult = firstRoll <= firstSuccessPercent ? "success" : "failure";
        const secondPrice = Math.min(50, context.state.quest.resources.essence);
        const secondSuccessPercent = 65;
        const secondSuccessReward = gainEssence(190);
        const secondRoll = drawInt(drawContext, "single-wager-roll:2", 1, 100);
        const secondCommittedResult = secondRoll <= secondSuccessPercent ? "success" : "failure";

        return {
          options: [
            option({
              number: 1,
              text: "Pay 30 essence. 50% chance to gain 160 essence; otherwise gain nothing.",
              costs: [cost("essence", payablePrice)],
              effects: [{ kind: "random_reward", table: "wager", odds: odds(firstSuccessPercent) }],
              cost: payablePrice,
              effect: 80,
              uncertainty: -12,
            }),
            option({
              number: 2,
              text: `Pay ${secondPrice} essence. 65% chance to gain 190 essence; otherwise gain nothing.`,
              costs: [cost("essence", secondPrice)],
              effects: [{ kind: "random_reward", table: "wager", odds: odds(secondSuccessPercent) }],
              cost: secondPrice,
              effect: 124,
              uncertainty: -16,
            }),
          ],
          precommitted: {
            random: [
              {
                kind: "wager_roll",
                optionNumber: 1,
                odds: odds(firstSuccessPercent),
                success: firstSuccessReward,
                failure: { kind: "no_reward" },
                roll: firstRoll,
                committedResult: firstCommittedResult,
                presentation: "visible_odds_debug_roll",
              },
              {
                kind: "wager_roll",
                optionNumber: 2,
                odds: odds(secondSuccessPercent),
                success: secondSuccessReward,
                failure: { kind: "no_reward" },
                roll: secondRoll,
                committedResult: secondCommittedResult,
                presentation: "visible_odds_debug_roll",
              },
            ],
          },
        };
      }
    case "now_vs_later":
      {
        const dreamsignReward = dreamsignDraft(3);
        const delayedOption = context.state.quest.dreamsignPoolIds.length > 0
          ? option({
              number: 2,
              text: "In 2 dreamscapes, choose 1 of 3 Dreamsigns.",
              triggers: [{ kind: "in_two_dreamscapes" }],
              effects: [dreamsignReward],
              targets: [target("dreamsign", DREAMSIGN_POOL_TARGET_DESCRIPTION, dreamsignReward.predicate)],
              effect: delayedDreamsignDraftValue(
                dreamsignReward,
                context,
                TIMING_AND_RANDOMNESS_VALUE_CONSTANTS.twoDreamscapesMultiplier,
              ),
              uncertainty: -16,
            })
          : option({
              number: 2,
              text: "In 2 dreamscapes, gain 180 essence.",
              triggers: [{ kind: "in_two_dreamscapes" }],
              effects: [gainEssence(180)],
              effect: 135,
              uncertainty: -16,
            });

        return {
          options: [
            option({ number: 1, text: "Gain 100 essence.", effects: [gainEssence(100)], effect: 100 }),
            delayedOption,
          ],
          precommitted: {
            delayed: context.state.quest.dreamsignPoolIds.length > 0
              ? [{ optionNumber: 2, trigger: "in 2 dreamscapes", reward: dreamsignReward }]
              : [{ optionNumber: 2, trigger: "in 2 dreamscapes", reward: gainEssence(180) }],
          },
        };
      }
    case "reward_after_trigger":
      {
        const dreamsignReward = dreamsignDraft(3);
        const cardDraftProfile = legalCardDraftProfile(context, [
          CARD_DRAFT_PROFILES.characters,
          CARD_DRAFT_PROFILES.events,
        ]);
        const cardDraftReward = draftCards(cardDraftProfile);

        return {
          options: [
            context.state.quest.dreamsignPoolIds.length > 0
              ? option({
                  number: 1,
                  text: `After next battle, ${dreamsignDraftText(3).replace(/^Choose/u, "choose")}`,
                  triggers: [{ kind: "after_next_battle" }],
                  effects: [dreamsignReward],
                  targets: [target("dreamsign", DREAMSIGN_POOL_TARGET_DESCRIPTION, dreamsignReward.predicate)],
                  effect: delayedDreamsignDraftValue(
                    dreamsignReward,
                    context,
                    TIMING_AND_RANDOMNESS_VALUE_CONSTANTS.nextBattleMultiplier,
                  ),
                  uncertainty: -8,
                })
              : option({
                  number: 1,
                  text: "After next battle, gain 150 essence.",
                  triggers: [{ kind: "after_next_battle" }],
                  effects: [gainEssence(150)],
                  effect: Math.round(
                    valueEssenceGain(150, context) * TIMING_AND_RANDOMNESS_VALUE_CONSTANTS.nextBattleMultiplier,
                  ),
                  uncertainty: -8,
                }),
            option({
              number: 2,
              text: `After next battle, ${cardDraftText(cardDraftProfile).replace(/^Draft/u, "draft")} Gain 1 omen.`,
              triggers: [{ kind: "after_next_battle" }],
              effects: [cardDraftReward, gainOmen(1)],
              targets: [target("card", cardDraftProfile.targetDescription, cardDraftReward.predicate)],
              effect: Math.round(
                (valueCardDraft(cardDraftReward) + valueOmenGain(1)) *
                  TIMING_AND_RANDOMNESS_VALUE_CONSTANTS.nextBattleMultiplier,
              ),
              uncertainty: -8,
            }),
          ],
          precommitted: {
            delayed: context.state.quest.dreamsignPoolIds.length > 0
              ? [
                  { optionNumber: 1, trigger: "after next battle", reward: dreamsignReward },
                  { optionNumber: 2, trigger: "after next battle", reward: [cardDraftReward, gainOmen(1)] },
                ]
              : [
                  { optionNumber: 1, trigger: "after next battle", reward: gainEssence(150) },
                  { optionNumber: 2, trigger: "after next battle", reward: [cardDraftReward, gainOmen(1)] },
                ],
          },
        };
      }
    case "paired_return":
      {
        const cardDraftProfile = legalCardDraftProfile(context, [
          CARD_DRAFT_PROFILES.characters,
          CARD_DRAFT_PROFILES.events,
        ]);
        const cardDraftReward = draftCards(cardDraftProfile);

        return {
          options: [
            option({
              number: 1,
              text: "Commit a return hook. After next victory, gain 70 essence.",
              triggers: [{ kind: "after_next_victory" }],
              effects: [gainEssence(70)],
              effect: 52,
              uncertainty: -8,
            }),
            option({
              number: 2,
              text: `Commit a return hook. After next victory, ${cardDraftText(cardDraftProfile).replace(/^Draft/u, "draft")}`,
              triggers: [{ kind: "after_next_victory" }],
              effects: [cardDraftReward],
              targets: [target("card", cardDraftProfile.targetDescription, cardDraftReward.predicate)],
              effect: Math.round(valueCardDraft(cardDraftReward) * 0.75),
              uncertainty: -8,
            }),
          ],
          precommitted: {
            delayed: [
              { optionNumber: 1, trigger: "after next victory", reward: gainEssence(70) },
              { optionNumber: 2, trigger: "after next victory", reward: cardDraftReward },
            ],
            pairedReturn: [
              { optionNumber: 1, anchor: "root choice 1", reward: gainEssence(70) },
              { optionNumber: 2, anchor: "root choice 2", reward: cardDraftReward },
            ],
          },
        };
      }
    case "timed_window_menu":
      return {
        options: [
          option({
            number: 1,
            text: "For the next 3 battles, all event cards in your deck have Fast.",
            effects: [
              {
                kind: "card_rewrite",
                keyword: "Fast",
                duration: BATTLE_WINDOW_DURATION,
                scope: "all_matching_cards_in_deck",
                predicate: { cardType: "Event" },
              },
            ],
            effect: 175,
            uncertainty: -10,
          }),
          option({
            number: 2,
            text: "For the next 3 battles, draw 1 extra card in your opening hand.",
            effects: [
              {
                kind: "battle_window_modifier",
                duration: BATTLE_WINDOW_DURATION,
                modifier: "opening_hand_cards",
                amount: 1,
              },
            ],
            effect: 165,
            uncertainty: -10,
          }),
          option({
            number: 3,
            text: "For the next 3 battles, gain 1 extra energy on turn 1.",
            effects: [
              {
                kind: "battle_window_modifier",
                duration: BATTLE_WINDOW_DURATION,
                modifier: "turn_1_energy",
                amount: 1,
              },
            ],
            effect: 170,
            uncertainty: -10,
          }),
        ],
        precommitted: {},
      };
    case "resolved_random_series":
      {
        const firstSeries = [gainEssence(25), gainOmen(1), draftCards(CARD_DRAFT_PROFILES.characters)];
        const secondSeries = [gainEssence(50), draftCards(CARD_DRAFT_PROFILES.events), gainOmen(1)];

        return {
          options: [
            option({
              number: 1,
              text: "Resolve the precommitted rewards: gain 25 essence, gain 1 omen, then draft 1 of 4 characters.",
              effects: [{ kind: "random_series", count: 3 }],
              effect: 105,
              uncertainty: -12,
            }),
            option({
              number: 2,
              text: "Resolve the precommitted rewards: gain 50 essence, draft 1 of 4 events, then gain 1 omen.",
              effects: [{ kind: "random_series", count: 3 }],
              effect: 130,
              uncertainty: -12,
            }),
          ],
          precommitted: { random: [firstSeries, secondSeries] },
        };
      }
    case "single_random_outcome":
      return {
        options: [
          option({
            number: 1,
            text: "Gain the precommitted reward: 70 essence.",
            effects: [{ kind: "random_reward", table: "precommitted" }],
            effect: 70,
            uncertainty: -12,
          }),
          option({
            number: 2,
            text: "Gain the precommitted reward: 1 omen.",
            effects: [{ kind: "random_reward", table: "precommitted" }],
            effect: valueOmenGain(1),
            uncertainty: -12,
          }),
        ],
        precommitted: { random: [gainEssence(70), gainOmen(1)] },
      };
    case "commit_now_future_payoff":
      {
        const dreamsignReward = dreamsignDraft(3);
        const firstCardDraftProfile = legalCardDraftProfile(context, [
          CARD_DRAFT_PROFILES.characters,
          CARD_DRAFT_PROFILES.events,
        ]);
        const secondCardDraftProfile = legalCardDraftProfile(context, [
          CARD_DRAFT_PROFILES.reclaimEvents,
          CARD_DRAFT_PROFILES.lowCostCharacters,
          CARD_DRAFT_PROFILES.events,
          CARD_DRAFT_PROFILES.characters,
        ]);
        const firstCardDraftReward = draftCards(firstCardDraftProfile);
        const secondCardDraftReward = draftCards(secondCardDraftProfile);
        const secondRewardOption = context.state.quest.dreamsignPoolIds.length > 0
          ? option({
              number: 2,
              text: "Gain 1 Nightmare now. At the next dreamscape, choose 1 of 3 Dreamsigns.",
              triggers: [{ kind: "next_dreamscape" }],
              effects: [dreamsignReward],
              burdens: [nightmare(1)],
              targets: [target("dreamsign", DREAMSIGN_POOL_TARGET_DESCRIPTION, dreamsignReward.predicate)],
              effect: delayedDreamsignDraftValue(
                dreamsignReward,
                context,
                TIMING_AND_RANDOMNESS_VALUE_CONSTANTS.burdenedFuturePayoffMultiplier,
              ),
              burden: valueBaneGain("Nightmare", 1),
              uncertainty: -8,
            })
          : option({
              number: 2,
              text: `Gain 1 Nightmare now. At the next dreamscape, ${cardDraftText(firstCardDraftProfile).replace(/^Draft/u, "draft")} Gain 3 omens.`,
              triggers: [{ kind: "next_dreamscape" }],
              effects: [firstCardDraftReward, gainOmen(3)],
              burdens: [nightmare(1)],
              targets: [target("card", firstCardDraftProfile.targetDescription, firstCardDraftReward.predicate)],
              effect: Math.round((valueCardDraft(firstCardDraftReward) + valueOmenGain(3)) * 0.85),
              burden: valueBaneGain("Nightmare", 1),
              uncertainty: -8,
            });

        return {
          options: [
            option({
              number: 1,
              text: "Pay 30 essence now. At the next dreamscape, gain 160 essence.",
              costs: [cost("essence", 30)],
              triggers: [{ kind: "next_dreamscape" }],
              effects: [gainEssence(160)],
              cost: 30,
              effect: 128,
              uncertainty: -8,
            }),
            secondRewardOption,
            option({
              number: 3,
              text: `Pay 55 essence now. At the next dreamscape, ${cardDraftText(secondCardDraftProfile).replace(/^Draft/u, "draft")} Gain 2 omens.`,
              costs: [cost("essence", 55)],
              triggers: [{ kind: "next_dreamscape" }],
              effects: [secondCardDraftReward, gainOmen(2)],
              targets: [target("card", secondCardDraftProfile.targetDescription, secondCardDraftReward.predicate)],
              cost: 55,
              effect: Math.round((valueCardDraft(secondCardDraftReward) + valueOmenGain(2)) * 0.75),
              uncertainty: -8,
            }),
          ],
          precommitted: {
            delayed: context.state.quest.dreamsignPoolIds.length > 0
              ? [
                  { optionNumber: 1, trigger: "next dreamscape", reward: gainEssence(160) },
                  { optionNumber: 2, trigger: "next dreamscape", reward: dreamsignReward },
                  { optionNumber: 3, trigger: "next dreamscape", reward: [secondCardDraftReward, gainOmen(2)] },
                ]
              : [
                  { optionNumber: 1, trigger: "next dreamscape", reward: gainEssence(160) },
                  { optionNumber: 2, trigger: "next dreamscape", reward: [firstCardDraftReward, gainOmen(3)] },
                  { optionNumber: 3, trigger: "next dreamscape", reward: [secondCardDraftReward, gainOmen(2)] },
                ],
          },
        };
      }
    case "alter_dreamscapes":
      return {
        options: [routeEdit(1, false), routeEdit(2, true)],
        precommitted: {
          routeEdits: [
            {
              kind: "current_route_replacement",
              fromSite: "Shop",
              toSite: "Purge",
              timing: "current dreamscape",
              source: "simulated_manifest_only",
            },
            {
              kind: "future_route_replacement",
              fromSite: "Shop",
              toSite: "Purge",
              timing: "next dreamscape",
              source: "simulated_manifest_only",
            },
          ],
        },
      };
  }
}

export function buildConservativeJourneyForShape(args: BuildArgs): JourneyManifest {
  const selectedCards = selectedCardTargets(args.context, args.drawContext).slice(0, 3);
  const selectedDreamsigns = selectedDreamsignTargets(args.context, args.drawContext).slice(0, 3);
  const shape = getShapeDefinition(args.shapeId);
  const filled = fillOptions(args.shapeId, args.context, args.drawContext);
  const options = filled.options.slice(0, shape.rootOptionCount.max);
  const optionValues: ValueBreakdown[] = options.map((journeyOption) =>
    evaluateOptionValue(journeyOption, args.context),
  );

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    journeyId: args.journeyId,
    seed: args.context.state.quest.seed,
    rootJourneyIndex: args.context.state.generator.rootJourneyIndex,
    shapeId: args.shapeId,
    stage: args.stage,
    dreamscape: args.context.state.quest.resources.dreamscape,
    selectedTags: args.selectedTags,
    options,
    ...(filled.tree ? { tree: filled.tree } : {}),
    ...(filled.rewardPool ? { rewardPool: filled.rewardPool } : {}),
    precommitted: filled.precommitted,
    debug: {
      shapeScores: args.shapeScores,
      selectedShapeId: args.shapeId,
      selectedTags: args.selectedTags,
      optionValues,
      repairs: [],
      ...(args.previousPick ? { previousPick: args.previousPick } : {}),
    },
    references: referencesFor(
      args.context.content,
      selectedCards.map((card) => card.id),
      selectedDreamsigns.map((dreamsign) => dreamsign.id),
    ),
  };
}

export const FALLBACK_SHAPE_IDS = Object.freeze([
  "curated_reward_trio",
  "single_reward",
  "service_menu",
] as const satisfies readonly JourneyShapeId[]);

export function fallbackShapeIds(): readonly JourneyShapeId[] {
  return FALLBACK_SHAPE_IDS;
}

export function allowedGeneratedVocabulary() {
  return {
    banes: [...BANE_NAMES],
    transfigurations: [...STANDARD_TRANSFIGURATIONS],
  };
}
