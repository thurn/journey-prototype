import type { ContentBundle } from "../content/model.js";
import type { JourneyContext } from "../quest/context.js";
import {
  BANE_NAMES,
  EFFECT_CATALOG_VERSION,
  attachTargetResolutionMetadata,
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
  ManifestReferences,
  PickBehavior,
  PrecommittedOutcomes,
} from "./manifest.js";
import {
  MANIFEST_CONTRACT_VERSION,
  MANIFEST_SCHEMA_VERSION,
} from "./manifest.js";
import {
  getShapeDefinition,
  JOURNEY_SHAPE_CATALOG_VERSION,
  type JourneyShapeId,
} from "./shapes.js";
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
  VALUE_MODEL_VERSION,
  type ValueBreakdown,
} from "./value.js";
import { drawInt, shuffleDeterministic, type DrawContext } from "../util/rng.js";
import { decisionTreeForShape, odds, type TreeBuilderTools } from "./filler/treeBuilders.js";
import type { DebugPayloadSelection } from "./debugPayloads.js";
import {
  adaptJourneyOptionOperations,
  adaptPrecommittedOperations,
} from "./operationAdapters.js";
import { RENDERER_VERSION } from "../render/theme.js";
import { VALIDATION_CONTRACT_VERSION } from "./validate.js";

type BuildArgs = {
  context: JourneyContext;
  drawContext: DrawContext;
  journeyId: string;
  shapeId: JourneyShapeId;
  stage: JourneyStage;
  selectedTags: string[];
  shapeScores: { shapeId: JourneyShapeId; score: number }[];
  previousPick?: JourneyManifest["debug"]["previousPick"];
  debugPayload?: DebugPayloadSelection;
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

const RESOURCE_EDGE_CASE_VALUE_BANDS = Object.freeze([
  {
    id: "maximum",
    label: "maximum",
    description: "resource reward is evaluated against the current maximum.",
  },
  {
    id: "percentage",
    label: "percentage",
    description: "resource reward is expressed as a percentage of a resource pool.",
    amount: 50,
  },
  {
    id: "all_remaining",
    label: "all-remaining",
    description: "resource cost or reward consumes all remaining resource.",
  },
  {
    id: "random_range",
    label: "random-range",
    description: "resource amount is selected from an explicit random range.",
    minimum: 1,
    maximum: 3,
  },
  {
    id: "cap_change",
    label: "cap-change",
    description: "resource effect changes a maximum resource cap.",
  },
  {
    id: "multi_omen",
    label: "multi-omen",
    description: "omen effect is evaluated as a multi-omen bundle.",
    amount: 2,
  },
] as const);

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
    operations: [],
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

  const withOperations = {
    ...built,
    operations: adaptJourneyOptionOperations(built),
  };

  return {
    ...withOperations,
    symbols: symbolsForOption(withOperations),
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

const treeBuilderTools: TreeBuilderTools = {
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
};

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
      const filled = decisionTreeForShape(shapeId, context, drawContext, treeBuilderTools);

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

function isResourceEdgeCasePayload(debugPayload: DebugPayloadSelection | undefined): boolean {
  return debugPayload?.qaId === "resource/resource-edge-cases";
}

function recordKind(value: unknown): string | undefined {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "kind" in value &&
    typeof value.kind === "string"
    ? value.kind
    : undefined;
}

function isResourceBandLegacyKind(kind: string | undefined): boolean {
  return kind === "gain_essence" ||
    kind === "gain_omens" ||
    kind === "essence" ||
    kind === "omens" ||
    kind === "essence_loss" ||
    kind === "omen_loss" ||
    kind === "random_series";
}

function operationReceivesResourceBands(operation: JourneyOption["operations"][number]): boolean {
  return isResourceBandLegacyKind(operation.legacyKind) ||
    (operation.operationKind === "reward" && operation.rewardKind === "resource") ||
    (operation.operationKind === "cost" && (operation.resource === "essence" || operation.resource === "omens")) ||
    (operation.operationKind === "burden" && operation.burdenKind === "resource_loss");
}

function withValueBands(value: unknown): unknown {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? {
        ...value,
        valueBands: RESOURCE_EDGE_CASE_VALUE_BANDS,
      }
    : value;
}

function withResourceEdgeCaseValueBands(options: readonly JourneyOption[]): JourneyOption[] {
  return options.map((journeyOption) => ({
    ...journeyOption,
    effects: journeyOption.effects.map((effect) =>
      isResourceBandLegacyKind(recordKind(effect))
        ? withValueBands(effect)
        : effect
    ),
    operations: journeyOption.operations.map((operation) =>
      operationReceivesResourceBands(operation)
        ? {
            ...operation,
            value: {
              ...(operation.value ?? {}),
              bands: RESOURCE_EDGE_CASE_VALUE_BANDS.map((band) => ({ ...band })),
            },
            payload: {
              ...operation.payload,
              valueBands: RESOURCE_EDGE_CASE_VALUE_BANDS.map((band) => ({ ...band })),
            },
          }
        : operation
    ),
  }));
}

export function buildConservativeJourneyForShape(args: BuildArgs): JourneyManifest {
  const selectedCards = selectedCardTargets(args.context, args.drawContext).slice(0, 3);
  const selectedDreamsigns = selectedDreamsignTargets(args.context, args.drawContext).slice(0, 3);
  const shape = getShapeDefinition(args.shapeId);
  const filled = fillOptions(args.shapeId, args.context, args.drawContext);
  const filledOptions = filled.options.slice(0, shape.rootOptionCount.max);
  const options = isResourceEdgeCasePayload(args.debugPayload)
    ? withResourceEdgeCaseValueBands(filledOptions)
    : filledOptions;
  const optionRouteEffects = options.flatMap((journeyOption) => journeyOption.routeEffects);
  const legacyPrecommitted = optionRouteEffects.length > 0 && filled.precommitted.routeEdits === undefined
    ? {
        ...filled.precommitted,
        routeEdits: optionRouteEffects,
      }
    : filled.precommitted;
  const precommitted = {
    ...legacyPrecommitted,
    operations: adaptPrecommittedOperations(legacyPrecommitted),
  };
  const optionValues: ValueBreakdown[] = options.map((journeyOption) =>
    evaluateOptionValue(journeyOption, args.context),
  );

  const manifest: JourneyManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    versions: {
      contentVersion: args.context.contentVersion,
      shapeCatalogVersion: JOURNEY_SHAPE_CATALOG_VERSION,
      effectCatalogVersion: EFFECT_CATALOG_VERSION,
      valueModelVersion: VALUE_MODEL_VERSION,
      rendererVersion: RENDERER_VERSION,
      manifestContractVersion: MANIFEST_CONTRACT_VERSION,
      validationContractVersion: VALIDATION_CONTRACT_VERSION,
    },
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
      validation: {
        ok: true,
        passed: 0,
        failed: 0,
        rules: [],
      },
      repair: {
        status: "accepted_immediately",
        forcedShape: false,
        finalShapeId: args.shapeId,
        ...(args.debugPayload ? { payloadFamily: args.debugPayload.familyId } : { payloadFamily: "adapter" }),
      },
      ...(args.previousPick ? { previousPick: args.previousPick } : {}),
      ...(args.debugPayload ? { debugPayload: { ...args.debugPayload, source: "forced" } } : {}),
    },
    references: referencesFor(
      args.context.content,
      selectedCards.map((card) => card.id),
      selectedDreamsigns.map((dreamsign) => dreamsign.id),
    ),
  };

  return attachTargetResolutionMetadata(manifest, args.context.content, args.context.state.quest);
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
