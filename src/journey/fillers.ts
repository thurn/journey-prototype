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

type RewardSlot = {
  key: string;
  text: string;
  effects: unknown[];
  targets?: unknown[];
  triggers?: unknown[];
  routeEffects?: unknown[];
  effect: number;
  uncertainty?: number;
};

type CostSlot = {
  key: string;
  prefix: string;
  costs?: unknown[];
  burdens?: unknown[];
  cost?: number;
  burden?: number;
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

function pickLegalCardDraftProfile(
  context: JourneyContext,
  drawContext: DrawContext,
  label: string,
  profiles: readonly CardDraftProfile[],
): CardDraftProfile {
  return legalCardDraftProfile(context, shuffleDeterministic(drawContext, label, profiles));
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

function renumberOptions(options: readonly JourneyOption[]): JourneyOption[] {
  return options.map((item, index) => ({
    ...item,
    number: index + 1,
  }));
}

function commonPositiveOptions(
  context: JourneyContext,
  drawContext: DrawContext,
  label: string,
): JourneyOption[] {
  const essenceAmount = pickSequentialVariant(
    drawContext,
    `${label}:essence-amount`,
    [330, 350, commonEssenceRewardAmount(context)],
  );
  const cardDraftProfile = pickLegalCardDraftProfile(context, drawContext, `${label}:card-profile`, [
    CARD_DRAFT_PROFILES.characters,
    CARD_DRAFT_PROFILES.events,
    CARD_DRAFT_PROFILES.lowCostCharacters,
    CARD_DRAFT_PROFILES.reclaimEvents,
    CARD_DRAFT_PROFILES.dissolveEvents,
  ]);
  const cardDraft = draftCards(cardDraftProfile);
  const dreamsignChoiceCount = pickSequentialVariant(drawContext, `${label}:dreamsign-choice-count`, [2, 3]);
  const dreamsignChoice = dreamsignDraft(dreamsignChoiceCount);
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
  const resourceOptions = [
    option({
      number: 1,
      text: `Gain ${essenceAmount} essence.`,
      effects: [gainEssence(essenceAmount)],
      effect: valueEssenceGain(essenceAmount, context),
    }),
    option({
      number: 1,
      text: "Gain 5 omens.",
      effects: [gainOmen(5)],
      effect: valueOmenGain(5),
    }),
  ];
  const resourceOption = pickSequentialVariant(
    drawContext,
    `${label}:resource-kind`,
    resourceOptions,
  );

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
          text: dreamsignDraftText(dreamsignChoiceCount),
          effects: [dreamsignChoice],
          targets: [target("dreamsign", DREAMSIGN_POOL_TARGET_DESCRIPTION, dreamsignChoice.predicate)],
          effect: valueDreamsignDraft(dreamsignChoice, context),
        })
      : fallbackReward,
  ];
}

function paidDraft(
  context: JourneyContext,
  drawContext: DrawContext,
  label: string,
  number: number,
  price: number,
  profiles: readonly CardDraftProfile[],
): JourneyOption {
  const cardDraftProfile = pickLegalCardDraftProfile(context, drawContext, label, profiles);
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

function routeReplacementReward(future = false): RewardSlot {
  const timing = future ? "in the next dreamscape" : "in the current dreamscape";
  const routeEffect = {
    kind: future ? "future_route_replacement" : "current_route_replacement",
    fromSite: future ? "Draft" : "Shop",
    toSite: future ? "Dreamsign Offering" : "Purge",
    timing: future ? "next dreamscape" : "current dreamscape",
    source: "simulated_manifest_only",
  };

  return {
    key: future ? "future-route-replacement" : "current-route-replacement",
    text: `Replace a ${routeEffect.fromSite} site ${timing} with a ${routeEffect.toSite} site.`,
    effects: [],
    routeEffects: [routeEffect],
    effect: future ? 305 : 295,
  };
}

function rewardSlotOption(
  number: number,
  reward: RewardSlot,
  extra: Omit<OptionArgs, "number" | "text" | "effects" | "targets" | "triggers" | "routeEffects" | "effect"> = {},
): JourneyOption {
  return option({
    number,
    text: reward.text,
    effects: reward.effects,
    targets: reward.targets ?? [],
    triggers: reward.triggers ?? [],
    routeEffects: reward.routeEffects ?? [],
    effect: reward.effect,
    uncertainty: reward.uncertainty,
    ...extra,
  });
}

function rewardSlots(
  context: JourneyContext,
  drawContext: DrawContext,
  label: string,
): RewardSlot[] {
  const essenceAmount = pickSequentialVariant(drawContext, `${label}:essence`, [300, 320, 340]);
  const omenAmount = 5;
  const cardProfile = pickLegalCardDraftProfile(context, drawContext, `${label}:card-profile`, [
    CARD_DRAFT_PROFILES.characters,
    CARD_DRAFT_PROFILES.events,
    CARD_DRAFT_PROFILES.lowCostCharacters,
    CARD_DRAFT_PROFILES.reclaimEvents,
    CARD_DRAFT_PROFILES.dissolveEvents,
    CARD_DRAFT_PROFILES.fastCharacters,
    CARD_DRAFT_PROFILES.materializedCharacters,
  ]);
  const cardDraft = draftCards(cardProfile);
  const secondCardProfile = pickLegalCardDraftProfile(context, drawContext, `${label}:second-card-profile`, [
    CARD_DRAFT_PROFILES.survivors,
    CARD_DRAFT_PROFILES.warriors,
    CARD_DRAFT_PROFILES.spiritAnimals,
    CARD_DRAFT_PROFILES.events,
  ]);
  const secondCardDraft = draftCards(secondCardProfile);
  const dreamsignChoiceCount = pickSequentialVariant(drawContext, `${label}:dreamsign-choice`, [2, 3]);
  const dreamsignChoice = dreamsignDraft(dreamsignChoiceCount);
  const transfiguration = pickSequentialVariant(drawContext, `${label}:transfiguration`, [
    "Bronze",
    "Scarlet",
    "Viridian",
    "Prismatic",
    "Golden",
  ]);
  const slots: RewardSlot[] = [
    {
      key: "essence",
      text: `Gain ${essenceAmount} essence.`,
      effects: [gainEssence(essenceAmount)],
      effect: valueEssenceGain(essenceAmount, context),
    },
    {
      key: "omens",
      text: `Gain ${omenAmount} omens.`,
      effects: [gainOmen(omenAmount)],
      effect: valueOmenGain(omenAmount),
    },
    {
      key: `draft:${cardProfile.label}`,
      text: `${cardDraftText(cardProfile)} Gain 4 omens.`,
      effects: [cardDraft, gainOmen(4)],
      targets: [target("card", cardProfile.targetDescription, cardDraft.predicate)],
      effect: Math.max(320, valueCardDraft(cardDraft) + valueOmenGain(4)),
    },
    {
      key: `draft-transfigure:${secondCardProfile.label}`,
      text: `${cardDraftText(secondCardProfile)} Apply {${transfiguration} Transfiguration} to it.`,
      effects: [
        secondCardDraft,
        { kind: "transfiguration", transfigurationName: transfiguration, scope: "drafted_card" },
      ],
      targets: [target("card", secondCardProfile.targetDescription, secondCardDraft.predicate)],
      effect: Math.max(320, valueCardDraft(secondCardDraft) + 185),
    },
    {
      key: "random-transfiguration",
      text: `Apply {${transfiguration} Transfiguration} to a random card in your deck. Gain 3 omens.`,
      effects: [
        { kind: "transfiguration", transfigurationName: transfiguration, scope: "random_card" },
        gainOmen(3),
      ],
      targets: [target("card", "a random card in deck", { source: "deck" })],
      effect: 320,
    },
    routeReplacementReward(false),
  ];

  if (context.state.quest.dreamsignPoolIds.length > 0) {
    slots.push({
      key: "dreamsign-draft",
      text: dreamsignDraftText(dreamsignChoiceCount),
      effects: [dreamsignChoice],
      targets: [target("dreamsign", DREAMSIGN_POOL_TARGET_DESCRIPTION, dreamsignChoice.predicate)],
      effect: valueDreamsignDraft(dreamsignChoice, context),
    });
  }

  if (context.state.quest.deck.summary.starterCards > 0) {
    slots.push({
      key: "starter-cleanup",
      text: "Purge up to 1 chosen Starter card. Gain 4 omens.",
      effects: [starterCleanup(1), gainOmen(4)],
      targets: [target("card", "Starter cards in deck", { source: "deck", starter: true })],
      effect: 345,
    });
  }

  return shuffleDeterministic(drawContext, `${label}:reward-slots`, slots);
}

function costSlots(context: JourneyContext, drawContext: DrawContext, label: string): CostSlot[] {
  const lowEssence = Math.min(
    pickSequentialVariant(drawContext, `${label}:low-essence`, [15, 20, 25]),
    context.state.quest.resources.essence,
  );
  const highEssence = Math.min(
    pickSequentialVariant(drawContext, `${label}:high-essence`, [35, 45, 55]),
    context.state.quest.resources.essence,
  );
  const slots: CostSlot[] = [
    {
      key: "low-essence",
      prefix: `Pay ${lowEssence} essence.`,
      costs: [cost("essence", lowEssence)],
      cost: lowEssence,
    },
    {
      key: "high-essence",
      prefix: `Pay ${highEssence} essence.`,
      costs: [cost("essence", highEssence)],
      cost: highEssence,
    },
    {
      key: "nightmare",
      prefix: "Gain 1 Nightmare.",
      burdens: [nightmare(1)],
      burden: valueBaneGain("Nightmare", 1),
    },
  ];

  if (context.state.quest.resources.omens >= 1) {
    slots.push({
      key: "omen",
      prefix: "Lose 1 omen.",
      costs: [cost("omens", 1)],
      cost: Math.abs(valueOmenLoss(1)),
    });
  }

  return shuffleDeterministic(drawContext, `${label}:cost-slots`, slots);
}

function costedRewardOption(
  number: number,
  costSlot: CostSlot,
  reward: RewardSlot,
): JourneyOption {
  return option({
    number,
    text: `${costSlot.prefix} ${reward.text}`,
    costs: costSlot.costs ?? [],
    burdens: costSlot.burdens ?? [],
    effects: reward.effects,
    targets: reward.targets ?? [],
    triggers: reward.triggers ?? [],
    routeEffects: reward.routeEffects ?? [],
    cost: costSlot.cost,
    burden: costSlot.burden,
    effect: reward.effect,
    uncertainty: reward.uncertainty,
  });
}

function delayedRewardOption(
  number: number,
  trigger: { key: string; text: string; kind: string; multiplier: number; uncertainty: number },
  reward: RewardSlot,
): JourneyOption {
  return option({
    number,
    text: `${trigger.text}, ${lowerFirst(reward.text)}`,
    triggers: [{ kind: trigger.kind }],
    effects: reward.effects,
    targets: reward.targets ?? [],
    routeEffects: reward.routeEffects ?? [],
    effect: Math.round(reward.effect * trigger.multiplier),
    uncertainty: trigger.uncertainty,
  });
}

function timingSlots(drawContext: DrawContext, label: string) {
  return shuffleDeterministic(drawContext, `${label}:timings`, [
    {
      key: "next-battle",
      text: "After next battle",
      kind: "after_next_battle",
      multiplier: TIMING_AND_RANDOMNESS_VALUE_CONSTANTS.nextBattleMultiplier,
      uncertainty: -8,
    },
    {
      key: "next-victory",
      text: "After next victory",
      kind: "after_next_victory",
      multiplier: 0.75,
      uncertainty: -8,
    },
    {
      key: "next-dreamscape",
      text: "At the next dreamscape",
      kind: "next_dreamscape",
      multiplier: 0.8,
      uncertainty: -8,
    },
    {
      key: "two-dreamscapes",
      text: "In 2 dreamscapes",
      kind: "in_two_dreamscapes",
      multiplier: TIMING_AND_RANDOMNESS_VALUE_CONSTANTS.twoDreamscapesMultiplier,
      uncertainty: -16,
    },
  ] as const);
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
      return {
        options: rewardSlots(context, drawContext, `${shapeId}:rewards`)
          .slice(0, 3)
          .map((reward, index) => rewardSlotOption(index + 1, reward)),
        precommitted: {},
      };
    case "same_cost_different_rewards":
      {
        const sharedCost = costSlots(context, drawContext, `${shapeId}:shared-cost`)[0]!;
        const rewards = rewardSlots(context, drawContext, `${shapeId}:rewards`).filter((reward) =>
          reward.routeEffects === undefined
        );

        return {
          options: rewards.slice(0, 3).map((reward, index) =>
            costedRewardOption(index + 1, sharedCost, reward)
          ),
          precommitted: {},
        };
      }
    case "same_reward_different_costs": {
      const family = pickSequentialVariant(drawContext, `${shapeId}:family`, [
        "card-draft",
        "dreamsign-draft",
        "omen-cache",
        "transfiguration",
      ] as const);

      if (family === "transfiguration") {
        const transfiguration = pickSequentialVariant(drawContext, `${shapeId}:same-reward-transfiguration`, [
          "Bronze",
          "Scarlet",
          "Viridian",
          "Golden",
          "Prismatic",
        ]);
        const targetProfile = pickLegalCardDraftProfile(context, drawContext, `${shapeId}:same-reward-transfiguration-target`, [
          CARD_DRAFT_PROFILES.characters,
          CARD_DRAFT_PROFILES.events,
          CARD_DRAFT_PROFILES.fastCharacters,
          CARD_DRAFT_PROFILES.lowCostCharacters,
        ]);
        const targetRecord = target("card", targetProfile.targetDescription, cardDraftPredicate(targetProfile));
        const costs = [
          {
            prefix: `Pay ${Math.min(15, context.state.quest.resources.essence)} essence.`,
            costs: [cost("essence", Math.min(15, context.state.quest.resources.essence))],
            cost: Math.min(15, context.state.quest.resources.essence),
            bonus: gainOmen(3),
            bonusText: " Gain 3 omens.",
            bonusValue: valueOmenGain(3),
          },
          context.state.quest.resources.omens >= 1
            ? {
                prefix: "Lose 1 omen.",
                costs: [cost("omens", 1)],
                cost: Math.abs(valueOmenLoss(1)),
                bonus: gainOmen(4),
                bonusText: " Gain 4 omens.",
                bonusValue: valueOmenGain(4),
              }
            : {
                prefix: `Pay ${payablePrice} essence.`,
                costs: [cost("essence", payablePrice)],
                cost: payablePrice,
                bonus: gainOmen(4),
                bonusText: " Gain 4 omens.",
                bonusValue: valueOmenGain(4),
              },
          {
            prefix: "Gain 1 Nightmare.",
            burdens: [nightmare(1)],
            burden: valueBaneGain("Nightmare", 1),
            bonus: gainOmen(5),
            bonusText: " Gain 5 omens.",
            bonusValue: valueOmenGain(5),
          },
        ];

        return {
          options: costs.map((entry, index) =>
            option({
              number: index + 1,
              text: `${entry.prefix} Apply {${transfiguration} Transfiguration} to ${chosenCardText()}.${entry.bonusText}`,
              costs: entry.costs ?? [],
              burdens: entry.burdens ?? [],
              effects: [{ kind: "transfiguration", transfigurationName: transfiguration }, entry.bonus],
              targets: [targetRecord],
              cost: entry.cost,
              burden: entry.burden,
              effect: 100 + entry.bonusValue,
            })
          ),
          precommitted: {},
        };
      }

      if (family === "dreamsign-draft" && context.state.quest.dreamsignPoolIds.length > 0) {
        const choiceCounts = shuffleDeterministic(drawContext, `${shapeId}:dreamsign-choice-order`, [2, 3, 4]);
        const dreamsignCosts = [
          {
            prefix: `Pay ${Math.min(pickSequentialVariant(drawContext, `${shapeId}:dreamsign-price`, [10, 15, 20]), context.state.quest.resources.essence)} essence.`,
            costs: [cost("essence", Math.min(pickSequentialVariant(drawContext, `${shapeId}:dreamsign-price`, [10, 15, 20]), context.state.quest.resources.essence))],
            cost: Math.min(pickSequentialVariant(drawContext, `${shapeId}:dreamsign-price`, [10, 15, 20]), context.state.quest.resources.essence),
          },
          context.state.quest.resources.omens >= 1
            ? {
                prefix: "Lose 1 omen.",
                costs: [cost("omens", 1)],
                cost: Math.abs(valueOmenLoss(1)),
              }
            : {
                prefix: `Pay ${payablePrice} essence.`,
                costs: [cost("essence", payablePrice)],
                cost: payablePrice,
              },
          {
            prefix: "Gain 1 Nightmare.",
            burdens: [nightmare(1)],
            burden: valueBaneGain("Nightmare", 1),
          },
        ];

        return {
          options: choiceCounts.map((choiceCount, index) => {
            const reward = dreamsignDraft(choiceCount);
            const dreamsignCost = dreamsignCosts[index]!;

            return option({
              number: index + 1,
              text: `${dreamsignCost.prefix} ${dreamsignDraftText(choiceCount)}`,
              costs: dreamsignCost.costs ?? [],
              burdens: dreamsignCost.burdens ?? [],
              effects: [reward],
              targets: [target("dreamsign", DREAMSIGN_POOL_TARGET_DESCRIPTION, reward.predicate)],
              cost: dreamsignCost.cost,
              burden: dreamsignCost.burden,
              effect: valueDreamsignDraft(reward, context) + index * 30,
            });
          }),
          precommitted: {},
        };
      }

      if (family === "omen-cache") {
        const amounts = shuffleDeterministic(drawContext, `${shapeId}:omen-amount-order`, [3, 4, 5]);
        const omenCost = context.state.quest.resources.omens >= 1
          ? cost("omens", 1)
          : cost("essence", payablePrice);
        const options = [
          {
            prefix: `Pay ${Math.min(10, context.state.quest.resources.essence)} essence.`,
            costs: [cost("essence", Math.min(10, context.state.quest.resources.essence))],
            cost: Math.min(10, context.state.quest.resources.essence),
            amount: amounts[0]!,
          },
          {
            prefix: context.state.quest.resources.omens >= 1 ? "Lose 1 omen." : `Pay ${payablePrice} essence.`,
            costs: [omenCost],
            cost: context.state.quest.resources.omens >= 1 ? Math.abs(valueOmenLoss(1)) : payablePrice,
            amount: amounts[1]!,
          },
          {
            prefix: "Gain 1 Nightmare.",
            burdens: [nightmare(1)],
            burden: valueBaneGain("Nightmare", 1),
            amount: amounts[2]!,
          },
        ];

        return {
          options: options.map((entry, index) =>
            option({
              number: index + 1,
              text: `${entry.prefix} Gain ${entry.amount} omens.`,
              costs: entry.costs ?? [],
              burdens: entry.burdens ?? [],
              effects: [gainOmen(entry.amount)],
              cost: entry.cost,
              burden: entry.burden,
              effect: valueOmenGain(entry.amount),
            })
          ),
          precommitted: {},
        };
      }

      const profiles = shuffleDeterministic(drawContext, `${shapeId}:card-profiles`, [
        CARD_DRAFT_PROFILES.lowCostCharacters,
        CARD_DRAFT_PROFILES.characters,
        CARD_DRAFT_PROFILES.events,
        CARD_DRAFT_PROFILES.reclaimEvents,
        CARD_DRAFT_PROFILES.dissolveEvents,
        CARD_DRAFT_PROFILES.fastCharacters,
      ]).map((profile, index, shuffled) =>
        legalCardDraftProfile(context, shuffled.slice(index, index + 1))
      );
      const prices = [Math.min(20, context.state.quest.resources.essence), payablePrice, premiumPrice];

      return {
        options: [0, 1, 2].map((index) => {
          const profile = profiles[index] ?? GENERIC_CARD_DRAFT_PROFILE;
          const cardDraft = draftCards(profile);

          return option({
            number: index + 1,
            text: `Pay ${prices[index]!} essence. ${cardDraftText(profile)}${index === 0 ? "" : ` Gain ${index} ${index === 1 ? "omen" : "omens"}.`}`,
            costs: [cost("essence", prices[index]!)],
            effects: index === 0 ? [cardDraft] : [cardDraft, gainOmen(index)],
            targets: [target("card", profile.targetDescription, cardDraft.predicate)],
            cost: prices[index]!,
            effect: valueCardDraft(cardDraft) + (index === 0 ? 0 : valueOmenGain(index)),
          });
        }),
        precommitted: {},
      };
    }
    case "service_menu":
      return {
        options: rewardSlots(context, drawContext, `${shapeId}:services`)
          .filter((reward) => reward.effect >= 140)
          .slice(0, 3)
          .map((reward, index) => rewardSlotOption(index + 1, reward)),
        precommitted: {},
      };
    case "shop_row":
      return {
        options: rewardSlots(context, drawContext, `${shapeId}:goods`)
          .filter((reward) => reward.routeEffects === undefined)
          .slice(0, 3)
          .map((reward, index) =>
            costedRewardOption(index + 1, {
              key: "shop-price",
              prefix: `Pay ${[15, 20, 25][index]!} essence.`,
              costs: [cost("essence", [15, 20, 25][index]!)],
              cost: [15, 20, 25][index]!,
            }, reward)
          ),
        precommitted: {},
      };
    case "curated_reward_trio":
      {
        const rewards = rewardSlots(context, drawContext, `${shapeId}:positive-menu`)
          .filter((reward) => reward.effect >= 170);
        const draftReward = rewards.find((reward) => reward.key.startsWith("draft"));
        const orderedRewards = [
          ...(draftReward ? [draftReward] : []),
          ...rewards.filter((reward) => reward.key !== draftReward?.key),
        ];

        return {
          options: orderedRewards
            .slice(0, 3)
            .map((reward, index) => rewardSlotOption(index + 1, reward)),
        precommitted: {},
        };
      }
    case "heterogeneous_pair": {
      const positiveOptions = shuffleDeterministic(
        drawContext,
        `${shapeId}:positive-pair`,
        rewardSlots(context, drawContext, `${shapeId}:positive-menu`)
          .filter((reward) => reward.effect >= 150)
          .map((reward, index) => rewardSlotOption(index + 1, reward)),
      );
      const options = positiveOptions.slice(0, 2);

      return {
        options: renumberOptions(options),
        precommitted: {},
      };
    }
    case "one_target_many_operations":
      {
        const targetProfile = pickLegalCardDraftProfile(context, drawContext, `${shapeId}:target-profile`, [
          CARD_DRAFT_PROFILES.characters,
          CARD_DRAFT_PROFILES.events,
          CARD_DRAFT_PROFILES.lowCostCharacters,
          CARD_DRAFT_PROFILES.reclaimEvents,
          CARD_DRAFT_PROFILES.fastCharacters,
        ]);
        const sharedTarget = target("card", targetProfile.targetDescription, cardDraftPredicate(targetProfile));
        const transfiguration = pickSequentialVariant(drawContext, `${shapeId}:transfiguration`, [
          "Bronze",
          "Viridian",
          "Prismatic",
          "Golden",
        ]);
        const operations = shuffleDeterministic(drawContext, `${shapeId}:operations`, [
          {
            text: `Apply {${transfiguration} Transfiguration} to ${chosenCardText()}.`,
            effects: [{ kind: "transfiguration", transfigurationName: transfiguration }],
            effect: 100,
          },
          {
            text: `Add Fast to ${chosenCardText()}.`,
            effects: [{ kind: "card_rewrite", keyword: "Fast" }],
            effect: 95,
          },
          {
            text: `Add Reclaim 1 to ${chosenCardText()}.`,
            effects: [{ kind: "card_rewrite", keyword: "Reclaim", amount: 1 }],
            effect: 95,
          },
          {
            text: `Reduce the cost of ${chosenCardText()} by 1 for the next 3 battles.`,
            effects: [{ kind: "card_rewrite", field: "energy_cost", amount: -1, duration: BATTLE_WINDOW_DURATION }],
            effect: 105,
            uncertainty: -10,
          },
        ]).slice(0, 3);

        return {
          options: operations.map((operation, index) =>
            option({
              number: index + 1,
              text: operation.text,
              effects: operation.effects,
              targets: [sharedTarget],
              effect: operation.effect,
              uncertainty: operation.uncertainty,
            })
          ),
          precommitted: {},
        };
      }
    case "take_any_number": {
      const rewards = rewardSlots(context, drawContext, `${shapeId}:cache-rewards`)
        .filter((reward) => reward.routeEffects === undefined);
      const costSlot = costSlots(context, drawContext, `${shapeId}:cache-costs`).find((entry) =>
        entry.costs && entry.costs.length > 0
      )!;
      const burdenSlot = costSlots(context, drawContext, `${shapeId}:cache-burdens`).find((entry) =>
        entry.burdens && entry.burdens.length > 0
      )!;

      return {
        options: [
          option({
            number: 1,
            text: `Take up to 2 rewards from this cache. ${costSlot.prefix} ${rewards[0]!.text}`,
            costs: costSlot.costs ?? [],
            effects: rewards[0]!.effects,
            targets: rewards[0]!.targets ?? [],
            cost: costSlot.cost,
            effect: rewards[0]!.effect,
          }),
          option({
            number: 2,
            text: `Take up to 2 rewards from this cache. ${burdenSlot.prefix} ${(rewards[1] ?? rewards[0])!.text}`,
            burdens: burdenSlot.burdens ?? [],
            effects: (rewards[1] ?? rewards[0])!.effects,
            targets: (rewards[1] ?? rewards[0])!.targets ?? [],
            burden: burdenSlot.burden,
            effect: (rewards[1] ?? rewards[0])!.effect,
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
      {
        const targetProfile = pickLegalCardDraftProfile(context, drawContext, `${shapeId}:target-profile`, [
          CARD_DRAFT_PROFILES.characters,
          CARD_DRAFT_PROFILES.events,
          CARD_DRAFT_PROFILES.lowCostCharacters,
          CARD_DRAFT_PROFILES.dissolveEvents,
        ]);
        const mirror = pickSequentialVariant(drawContext, `${shapeId}:mirror`, [
          "transfiguration",
          "rewrite",
          "draft",
        ] as const);

        if (mirror === "rewrite") {
          const sharedTarget = target("card", targetProfile.targetDescription, cardDraftPredicate(targetProfile));

          return {
            options: [
              option({ number: 1, text: `Add Fast to ${chosenCardText()}.`, effects: [{ kind: "card_rewrite", keyword: "Fast" }], targets: [sharedTarget], effect: 95 }),
              option({ number: 2, text: `Add Reclaim 1 to ${chosenCardText()}.`, effects: [{ kind: "card_rewrite", keyword: "Reclaim", amount: 1 }], targets: [sharedTarget], effect: 95 }),
              option({ number: 3, text: `Reduce the cost of ${chosenCardText()} by 1.`, effects: [{ kind: "card_rewrite", field: "energy_cost", amount: -1 }], targets: [sharedTarget], effect: 95 }),
            ],
            precommitted: {},
          };
        }

        if (mirror === "draft") {
          const draftRewards = rewardSlots(context, drawContext, `${shapeId}:draft-mirror`)
            .filter((reward) => reward.key.startsWith("draft"));
          const fallbackRewards = rewardSlots(context, drawContext, `${shapeId}:draft-mirror:fallback`)
            .filter((reward) => reward.routeEffects === undefined);

          return {
            options: [...draftRewards, ...fallbackRewards]
              .filter((reward, index, rewards) =>
                rewards.findIndex((candidate) => candidate.key === reward.key) === index
              )
              .slice(0, 3)
              .map((reward, index) => rewardSlotOption(index + 1, reward)),
            precommitted: {},
          };
        }

        return {
          options: ["Bronze", "Viridian", "Golden"].map((transfiguration, index) =>
            option({
              number: index + 1,
              text: `Apply {${transfiguration} Transfiguration} to ${chosenCardText()}.`,
              effects: [{ kind: "transfiguration", transfigurationName: transfiguration }],
              targets: [target("card", targetProfile.targetDescription, cardDraftPredicate(targetProfile))],
              effect: 100,
            })
          ),
          precommitted: {},
        };
      }
    case "one_operation_many_targets":
      {
        const transfiguration = pickSequentialVariant(drawContext, `${shapeId}:transfiguration`, [
          "Bronze",
          "Viridian",
          "Prismatic",
          "Golden",
        ]);
        const operation = pickSequentialVariant(drawContext, `${shapeId}:operation`, [
          {
            text: (targetText: string) => `Apply {${transfiguration} Transfiguration} to ${targetText}.`,
            effect: { kind: "transfiguration", transfigurationName: transfiguration },
            value: 100,
          },
          {
            text: (targetText: string) => `Add Fast to ${targetText}.`,
            effect: { kind: "card_rewrite", keyword: "Fast" },
            value: 95,
          },
          {
            text: (targetText: string) => `Add Reclaim 1 to ${targetText}.`,
            effect: { kind: "card_rewrite", keyword: "Reclaim", amount: 1 },
            value: 95,
          },
          {
            text: (targetText: string) => `Duplicate ${targetText}.`,
            effect: { kind: "card_duplicate" },
            value: 105,
          },
          {
            text: (targetText: string) => `Reduce the cost of ${targetText} by 1.`,
            effect: { kind: "card_rewrite", field: "energy_cost", amount: -1 },
            value: 95,
          },
        ]);
        const targetEntries = shuffleDeterministic(drawContext, `${shapeId}:target-order`, [
          {
            text: chosenCardText(),
            target: target("card", CARD_POOL_TARGET_DESCRIPTION, { source: "draftPool", tideOverlap: "selected" }),
          },
          {
            text: "a chosen Starter card",
            target: target("card", "Starter cards in deck", { source: "deck", starter: true }),
          },
          {
            text: "a chosen card in your deck",
            target: target("card", "cards in deck", { source: "deck" }),
          },
        ]);

        return {
          options: targetEntries.map((entry, index) =>
            option({
              number: index + 1,
              text: operation.text(entry.text),
              effects: [operation.effect],
              targets: [entry.target],
              effect: operation.value,
            })
          ),
          precommitted: {},
        };
      }
    case "choose_your_loss":
      {
        const baneName = pickSequentialVariant(drawContext, `${shapeId}:bane-name`, [
          "Nightmare",
          "Despair",
          "Envy",
          "Silence",
          "Paranoia",
        ] as const);
        const omenLoss = valueOmenLoss(1);
        const baneLoss = valueBaneGain(baneName, 1);
        const essenceLoss = comparableEssenceLossAmount(
          [
            ...(context.state.quest.resources.omens >= 1 ? [omenLoss] : []),
            baneLoss,
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
          text: `Gain 1 ${baneName}.`,
          burdens: [{ kind: "bane_gain", baneName, count: 1 }],
          burden: baneLoss,
        }));

        return {
          options: renumberOptions(shuffleDeterministic(drawContext, `${shapeId}:loss-order`, options)),
          precommitted: {},
        };
      }
    case "single_reward":
      return {
        options: renumberOptions(shuffleDeterministic(
          drawContext,
          `${shapeId}:single-reward-options`,
          commonPositiveOptions(context, drawContext, `${shapeId}:positive-menu`),
        ).slice(0, 2)),
        precommitted: {},
      };
    case "single_offer":
      {
        const reward = rewardSlots(context, drawContext, `${shapeId}:offer-reward`)
          .filter((entry) => entry.routeEffects === undefined)[0]!;
        const costSlot = costSlots(context, drawContext, `${shapeId}:offer-cost`)[0]!;

        return {
          options: [
            costedRewardOption(1, costSlot, reward),
            option({ number: 2, text: "Leave with no effect.", pickBehavior: "leave" }),
          ],
          precommitted: {},
        };
      }
    case "risk_or_skip":
      {
        const reward = rewardSlots(context, drawContext, `${shapeId}:risk-reward`)
          .filter((entry) => entry.routeEffects === undefined)[0]!;
        const downsideChancePercent = pickSequentialVariant(drawContext, `${shapeId}:downside-chance`, [35, 50, 65]);
        const downsideKind = pickSequentialVariant(drawContext, `${shapeId}:downside-kind`, [
          "nightmare",
          "omen",
          "essence",
        ] as const);
        const roll = drawInt(drawContext, "risk-or-skip-downside-roll:1", 1, 100);
        const downside = downsideKind === "omen" && context.state.quest.resources.omens >= 1
          ? { kind: "omen_loss", amount: 1 }
          : downsideKind === "essence"
            ? { kind: "essence_loss", amount: Math.min(60, context.state.quest.resources.essence) }
            : nightmare(1);
        const downsideValue = downsideKind === "omen" && context.state.quest.resources.omens >= 1
          ? valueOmenLoss(1)
          : downsideKind === "essence"
            ? -Math.min(60, context.state.quest.resources.essence)
            : valueBaneGain("Nightmare", 1);

        return {
          options: [
            option({
              number: 1,
              text: `${reward.text} ${downsideChancePercent}% chance to ${
                downsideKind === "omen" && context.state.quest.resources.omens >= 1
                  ? "lose 1 omen"
                  : downsideKind === "essence"
                    ? `lose ${Math.min(60, context.state.quest.resources.essence)} essence`
                    : "gain 1 Nightmare"
              }; otherwise no downside.`,
              effects: reward.effects,
              targets: reward.targets ?? [],
              effect: reward.effect,
              uncertainty: Math.round(downsideValue * (downsideChancePercent / 100)),
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
        const wagerRewards = rewardSlots(context, drawContext, `${shapeId}:wager-rewards`)
          .filter((entry) => entry.routeEffects === undefined);
        const firstReward = wagerRewards[0]!;
        const secondReward = wagerRewards[1] ?? wagerRewards[0]!;
        const firstSuccessPercent = pickSequentialVariant(drawContext, `${shapeId}:first-odds`, [45, 50, 55]);
        const firstSuccessReward = firstReward.effects;
        const firstRoll = drawInt(drawContext, "single-wager-roll:1", 1, 100);
        const firstCommittedResult = firstRoll <= firstSuccessPercent ? "success" : "failure";
        const secondPrice = Math.min(50, context.state.quest.resources.essence);
        const secondSuccessPercent = pickSequentialVariant(drawContext, `${shapeId}:second-odds`, [60, 65, 70]);
        const secondSuccessReward = secondReward.effects;
        const secondRoll = drawInt(drawContext, "single-wager-roll:2", 1, 100);
        const secondCommittedResult = secondRoll <= secondSuccessPercent ? "success" : "failure";

        return {
          options: [
            option({
              number: 1,
              text: `Pay ${payablePrice} essence. ${firstSuccessPercent}% chance to ${lowerFirst(firstReward.text).replace(/\.$/u, "")}; otherwise gain nothing.`,
              costs: [cost("essence", payablePrice)],
              effects: [{ kind: "random_reward", table: "wager", odds: odds(firstSuccessPercent) }],
              cost: payablePrice,
              effect: Math.round(firstReward.effect * (firstSuccessPercent / 100)),
              uncertainty: -12,
            }),
            option({
              number: 2,
              text: `Pay ${secondPrice} essence. ${secondSuccessPercent}% chance to ${lowerFirst(secondReward.text).replace(/\.$/u, "")}; otherwise gain nothing.`,
              costs: [cost("essence", secondPrice)],
              effects: [{ kind: "random_reward", table: "wager", odds: odds(secondSuccessPercent) }],
              cost: secondPrice,
              effect: Math.round(secondReward.effect * (secondSuccessPercent / 100)),
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
        const reward = rewardSlots(context, drawContext, `${shapeId}:reward`)
          .filter((entry) => entry.routeEffects === undefined)[0]!;
        const immediateReward = {
          ...reward,
          text: reward.key === "essence" ? "Gain 100 essence." : reward.text,
          effects: reward.key === "essence" ? [gainEssence(100)] : reward.effects,
          effect: reward.key === "essence" ? 100 : Math.max(120, Math.round(reward.effect * 0.65)),
        };
        const timing = timingSlots(drawContext, `${shapeId}:timing`).find((entry) =>
          entry.key === "two-dreamscapes" || entry.key === "next-dreamscape"
        )!;
        const delayedReward = {
          ...reward,
          effect: Math.round(reward.effect * (timing.key === "two-dreamscapes" ? 2.6 : 1.45)),
        };
        const delayedOption = delayedRewardOption(2, timing, delayedReward);

        return {
          options: [
            rewardSlotOption(1, immediateReward),
            delayedOption,
          ],
          precommitted: {
            delayed: [{ optionNumber: 2, trigger: timing.text.toLowerCase(), reward: delayedReward.effects }],
          },
        };
      }
    case "reward_after_trigger":
      {
        const rewards = rewardSlots(context, drawContext, `${shapeId}:trigger-rewards`)
          .filter((entry) => entry.routeEffects === undefined);
        const timings = timingSlots(drawContext, `${shapeId}:timing`)
          .filter((entry) => entry.key === "next-battle" || entry.key === "next-victory");
        const firstTiming = timings[0]!;
        const secondTiming = timings[1] ?? timings[0]!;

        return {
          options: [
            delayedRewardOption(1, firstTiming, rewards[0]!),
            delayedRewardOption(2, secondTiming, rewards[1] ?? rewards[0]!),
          ],
          precommitted: {
            delayed: [
              { optionNumber: 1, trigger: firstTiming.text.toLowerCase(), reward: rewards[0]!.effects },
              { optionNumber: 2, trigger: secondTiming.text.toLowerCase(), reward: (rewards[1] ?? rewards[0]!).effects },
            ],
          },
        };
      }
    case "paired_return":
      {
        const rewards = rewardSlots(context, drawContext, `${shapeId}:return-rewards`)
          .filter((entry) => entry.routeEffects === undefined);
        const timing = timingSlots(drawContext, `${shapeId}:timing`).find((entry) =>
          entry.key === "next-victory" || entry.key === "next-dreamscape"
        )!;

        return {
          options: [
            {
              ...delayedRewardOption(1, timing, rewards[0]!),
              text: `Commit a return hook. ${timing.text}, ${lowerFirst(rewards[0]!.text)}`,
            },
            {
              ...delayedRewardOption(2, timing, rewards[1] ?? rewards[0]!),
              text: `Commit a return hook. ${timing.text}, ${lowerFirst((rewards[1] ?? rewards[0]!).text)}`,
            },
          ],
          precommitted: {
            delayed: [
              { optionNumber: 1, trigger: timing.text.toLowerCase(), reward: rewards[0]!.effects },
              { optionNumber: 2, trigger: timing.text.toLowerCase(), reward: (rewards[1] ?? rewards[0]!).effects },
            ],
            pairedReturn: [
              { optionNumber: 1, anchor: `${rewards[0]!.key} return`, reward: rewards[0]!.effects },
              { optionNumber: 2, anchor: `${(rewards[1] ?? rewards[0]!).key} return`, reward: (rewards[1] ?? rewards[0]!).effects },
            ],
          },
        };
      }
    case "timed_window_menu":
      {
        const profile: { text: string; effects: unknown[]; effect: number }[] = pickSequentialVariant(drawContext, `${shapeId}:window-profile`, [
          [
            {
              text: "For the next 3 battles, all event cards in your deck have Fast.",
              effects: [{ kind: "card_rewrite", keyword: "Fast", duration: BATTLE_WINDOW_DURATION, scope: "all_matching_cards_in_deck", predicate: { cardType: "Event" } }],
              effect: 175,
            },
            {
              text: "For the next 3 battles, draw 1 extra card in your opening hand.",
              effects: [{ kind: "battle_window_modifier", duration: BATTLE_WINDOW_DURATION, modifier: "opening_hand_cards", amount: 1 }],
              effect: 165,
            },
            {
              text: "For the next 3 battles, gain 1 extra energy on turn 1.",
              effects: [{ kind: "battle_window_modifier", duration: BATTLE_WINDOW_DURATION, modifier: "turn_1_energy", amount: 1 }],
              effect: 170,
            },
          ],
          [
            {
              text: "For the next 3 battles, all character cards in your deck cost 1 less on turn 1.",
              effects: [{ kind: "battle_window_modifier", duration: BATTLE_WINDOW_DURATION, modifier: "turn_1_character_discount", amount: 1 }],
              effect: 170,
            },
            {
              text: "For the next 3 battles, start each battle with 1 omen.",
              effects: [{ kind: "battle_window_modifier", duration: BATTLE_WINDOW_DURATION, modifier: "starting_omens", amount: 1 }],
              effect: 165,
            },
            {
              text: "For the next 3 battles, the first event you play each battle has Reclaim 1.",
              effects: [{ kind: "battle_window_modifier", duration: BATTLE_WINDOW_DURATION, modifier: "first_event_reclaim", amount: 1 }],
              effect: 175,
            },
          ],
          [
            {
              text: "For the next 3 battles, draw 1 extra card on turn 2.",
              effects: [{ kind: "battle_window_modifier", duration: BATTLE_WINDOW_DURATION, modifier: "turn_2_cards", amount: 1 }],
              effect: 160,
            },
            {
              text: "For the next 3 battles, all fast cards in your deck have Reclaim 1.",
              effects: [{ kind: "card_rewrite", keyword: "Reclaim", amount: 1, duration: BATTLE_WINDOW_DURATION, scope: "all_matching_cards_in_deck", predicate: { isFast: true } }],
              effect: 170,
            },
            {
              text: "For the next 3 battles, gain 1 extra energy the first time you Dissolve each battle.",
              effects: [{ kind: "battle_window_modifier", duration: BATTLE_WINDOW_DURATION, modifier: "first_dissolve_energy", amount: 1 }],
              effect: 175,
            },
          ],
        ]);

        return {
          options: shuffleDeterministic(drawContext, `${shapeId}:window-order`, profile).map((entry, index) =>
            option({
              number: index + 1,
              text: entry.text,
              effects: entry.effects,
              effect: entry.effect,
              uncertainty: -10,
            })
          ),
          precommitted: {},
        };
      }
    case "resolved_random_series":
      {
        const rewards = rewardSlots(context, drawContext, `${shapeId}:series-rewards`)
          .filter((entry) => entry.routeEffects === undefined);
        const firstSeries = rewards.slice(0, 3).flatMap((reward) => reward.effects);
        const secondSeries = rewards.slice(2, 5).flatMap((reward) => reward.effects);

        return {
          options: [
            option({
              number: 1,
              text: `Resolve the precommitted rewards: ${rewards.slice(0, 3).map((reward) => lowerFirst(reward.text).replace(/\.$/u, "")).join(", then ")}.`,
              effects: [{ kind: "random_series", count: 3 }],
              effect: Math.round(rewards.slice(0, 3).reduce((total, reward) => total + reward.effect, 0) / 3),
              uncertainty: -12,
            }),
            option({
              number: 2,
              text: `Resolve the precommitted rewards: ${rewards.slice(2, 5).map((reward) => lowerFirst(reward.text).replace(/\.$/u, "")).join(", then ")}.`,
              effects: [{ kind: "random_series", count: 3 }],
              effect: Math.round(rewards.slice(2, 5).reduce((total, reward) => total + reward.effect, 0) / 3),
              uncertainty: -12,
            }),
          ],
          precommitted: { random: [firstSeries, secondSeries] },
        };
      }
    case "single_random_outcome":
      {
        const rewards = rewardSlots(context, drawContext, `${shapeId}:random-rewards`)
          .filter((entry) => entry.routeEffects === undefined)
          .slice(0, 2);

        return {
          options: rewards.map((reward, index) =>
            option({
              number: index + 1,
              text: `Gain the precommitted reward: ${lowerFirst(reward.text)}`,
              effects: [{ kind: "random_reward", table: "precommitted" }],
              effect: reward.effect,
              uncertainty: -12,
            })
          ),
          precommitted: { random: rewards.map((reward) => reward.effects) },
        };
      }
    case "commit_now_future_payoff":
      {
        const rewards = rewardSlots(context, drawContext, `${shapeId}:future-rewards`)
          .filter((entry) => entry.routeEffects === undefined);
        const timing = timingSlots(drawContext, `${shapeId}:timing`).find((entry) =>
          entry.key === "next-dreamscape"
        )!;
        const commitments = [
          costSlots(context, drawContext, `${shapeId}:commitment:1`).find((entry) => entry.key === "low-essence")!,
          costSlots(context, drawContext, `${shapeId}:commitment:2`).find((entry) => entry.key === "nightmare")!,
          costSlots(context, drawContext, `${shapeId}:commitment:3`).find((entry) => entry.key === "high-essence")!,
        ];
        const futureRewards = rewards.slice(0, 3).map((reward, index) => {
          const commitment = commitments[index]!;

          return {
            ...reward,
            effect: Math.round(
              175 +
                (commitment.cost ?? 0) -
                (commitment.burden ?? 0) -
                timing.uncertainty +
                index * 10,
            ),
          };
        });

        return {
          options: futureRewards.map((reward, index) =>
            option({
              number: index + 1,
              text: `${commitments[index]!.prefix.replace(/\.$/u, "")} now. ${timing.text}, ${lowerFirst(reward.text)}`,
              costs: commitments[index]!.costs ?? [],
              burdens: commitments[index]!.burdens ?? [],
              triggers: [{ kind: timing.kind }],
              effects: reward.effects,
              targets: reward.targets ?? [],
              cost: commitments[index]!.cost,
              burden: commitments[index]!.burden,
              effect: reward.effect,
              uncertainty: timing.uncertainty,
            })
          ),
          precommitted: {
            delayed: futureRewards.map((reward, index) => ({
              optionNumber: index + 1,
              trigger: timing.text.toLowerCase(),
              reward: reward.effects,
            })),
          },
        };
      }
    case "alter_dreamscapes":
      {
        const routeRewards = shuffleDeterministic(drawContext, `${shapeId}:routes`, [
          routeReplacementReward(false),
          routeReplacementReward(true),
          {
            ...routeReplacementReward(false),
            key: "current-transfiguration-route",
            text: "Replace a Draft site in the current dreamscape with a Transfiguration site.",
            routeEffects: [{
              kind: "current_route_replacement",
              fromSite: "Draft",
              toSite: "Transfiguration",
              timing: "current dreamscape",
              source: "simulated_manifest_only",
            }],
            effect: 300,
          },
          {
            ...routeReplacementReward(true),
            key: "future-transfiguration-route",
            text: "Replace a Draft site in the next dreamscape with a Transfiguration site.",
            routeEffects: [{
              kind: "future_route_replacement",
              fromSite: "Draft",
              toSite: "Transfiguration",
              timing: "next dreamscape",
              source: "simulated_manifest_only",
            }],
            effect: 305,
          },
        ]);

        return {
          options: routeRewards.slice(0, 2).map((reward, index) =>
            rewardSlotOption(index + 1, reward)
          ),
          precommitted: {
            routeEdits: routeRewards.slice(0, 2).flatMap((reward) => reward.routeEffects ?? []),
          },
        };
      }
  }
}

export function buildConservativeJourneyForShape(args: BuildArgs): JourneyManifest {
  const selectedCards = selectedCardTargets(args.context, args.drawContext).slice(0, 3);
  const selectedDreamsigns = selectedDreamsignTargets(args.context, args.drawContext).slice(0, 3);
  const shape = getShapeDefinition(args.shapeId);
  const filled = fillOptions(args.shapeId, args.context, args.drawContext);
  const options = filled.options.slice(0, shape.rootOptionCount.max);
  const optionRouteEffects = options.flatMap((journeyOption) => journeyOption.routeEffects);
  const precommitted = optionRouteEffects.length > 0 && filled.precommitted.routeEdits === undefined
    ? {
        ...filled.precommitted,
        routeEdits: optionRouteEffects,
      }
    : filled.precommitted;
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
    precommitted,
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
