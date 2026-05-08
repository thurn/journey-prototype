import type { CardContent, ContentBundle, DreamsignContent } from "../content/model.js";
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
  JourneyOperation,
  JourneyOption,
  JourneyRewardPool,
  JourneyStage,
  JourneyTree,
  ManifestReferences,
  PickBehavior,
  PrecommittedOutcomes,
  RandomOutcomeVisibility,
  RandomPrecommittedOutcome,
  GeneratedObjectDefinition,
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
  BANE_VALUE_CONSTANTS,
  CARD_MODIFICATION_VALUE_CONSTANTS,
  CARD_VALUE_CONSTANTS,
  DREAMSIGN_VALUE_CONSTANTS,
  PURGE_VALUE_CONSTANTS,
  TRANSFIGURATION_VALUE_CONSTANTS,
  VALUE_MODEL_VERSION,
  type ValueBreakdown,
} from "./value.js";
import { drawInt, shuffleDeterministic, weightedChoice, type DrawContext } from "../util/rng.js";
import { sha256Hex } from "../util/hash.js";
import { stableStringify } from "../util/stableJson.js";
import { decisionTreeForShape, odds, type TreeBuilderTools } from "./filler/treeBuilders.js";
import type { DebugPayloadSelection } from "./debugPayloads.js";
import {
  adaptJourneyOptionOperations,
  adaptPrecommittedOperations,
  adaptRewardPoolOperations,
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

function baneTarget(
  description: string,
  names: string[],
  source: "vocabulary" | "state" = "vocabulary",
  selection: "exact" | "chosen_after_commitment" | "visible_random" = "exact",
) {
  return {
    kind: "bane",
    description,
    predicate: {
      source,
      names,
    },
    source,
    names,
    selection,
    required: source === "state",
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
        const firstSeries = rewards.slice(0, 3);
        const secondSeries = rewards.slice(2, 5);

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
          precommitted: {
            random: [
              {
                kind: "resolved_random_series",
                optionNumber: 1,
                series: firstSeries.flatMap((reward) => reward.effects),
                resolved: true,
                visibilityPolicy: {
                  outcomeVisibility: "resolved",
                  disclosure: "The random reward series is resolved and shown before choosing.",
                  playerVisible: true,
                },
                expectedConvertedEssence: Math.round(firstSeries.reduce((total, reward) => total + reward.effect, 0) / firstSeries.length),
                riskPremiumConvertedEssence: -4,
              },
              {
                kind: "resolved_random_series",
                optionNumber: 2,
                series: secondSeries.flatMap((reward) => reward.effects),
                resolved: true,
                visibilityPolicy: {
                  outcomeVisibility: "resolved",
                  disclosure: "The random reward series is resolved and shown before choosing.",
                  playerVisible: true,
                },
                expectedConvertedEssence: Math.round(secondSeries.reduce((total, reward) => total + reward.effect, 0) / secondSeries.length),
                riskPremiumConvertedEssence: -4,
              },
            ],
          },
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
          precommitted: {
            random: rewards.map((reward, index) => ({
              kind: "random_reward",
              optionNumber: index + 1,
              reward: reward.effects,
              committedReward: reward.effects,
              visibilityPolicy: {
                outcomeVisibility: "pre_rolled",
                disclosure: "The random reward is pre-rolled and revealed in root option copy.",
                playerVisible: true,
              },
              expectedConvertedEssence: reward.effect,
              riskPremiumConvertedEssence: -8,
            })),
          },
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

function isNamedCardOperationMenuPayload(debugPayload: DebugPayloadSelection | undefined): boolean {
  return debugPayload?.qaId === "card/named-card-operation-menu";
}

function isStarterCleanupReplacementPayload(debugPayload: DebugPayloadSelection | undefined): boolean {
  return debugPayload?.qaId === "card/starter-cleanup-replacement";
}

function isNamedDreamsignShopRowPayload(debugPayload: DebugPayloadSelection | undefined): boolean {
  return debugPayload?.qaId === "dreamsign/named-dreamsign-shop-row";
}

function isDreamsignTransformDuplicatePoolPayload(debugPayload: DebugPayloadSelection | undefined): boolean {
  return debugPayload?.qaId === "dreamsign/dreamsign-transform-duplicate-pool";
}

function isBaneGainPurgeTransformPayload(debugPayload: DebugPayloadSelection | undefined): boolean {
  return debugPayload?.qaId === "bane/bane-gain-purge-transform";
}

function isRouteEditsPayload(debugPayload: DebugPayloadSelection | undefined): boolean {
  return debugPayload?.qaId === "route/route-edits";
}

function isShopEconomyPayload(debugPayload: DebugPayloadSelection | undefined): boolean {
  return debugPayload?.qaId === "shop/shop-economy";
}

function isDreamwellWindowPayload(debugPayload: DebugPayloadSelection | undefined): boolean {
  return debugPayload?.qaId === "dreamwell/dreamwell-window";
}

function isStatusRewardReplacementPayload(debugPayload: DebugPayloadSelection | undefined): boolean {
  return debugPayload?.qaId === "status/status-reward-replacement";
}

function isDelayedTriggerMatrixPayload(debugPayload: DebugPayloadSelection | undefined): boolean {
  return debugPayload?.qaId === "hook/delayed-trigger-matrix";
}

function isPairedReturnSealBorrowTradePayload(debugPayload: DebugPayloadSelection | undefined): boolean {
  return debugPayload?.qaId === "return/paired-return-seal-borrow-trade";
}

function isRandomRevealRollWagerPayload(debugPayload: DebugPayloadSelection | undefined): boolean {
  return debugPayload?.qaId === "random/reveal-roll-wager";
}

function isCompleteDecisionTreePayload(debugPayload: DebugPayloadSelection | undefined): boolean {
  return debugPayload?.qaId === "decision_tree/complete-decision-tree";
}

function generatedObjectVariant(debugPayload: DebugPayloadSelection | undefined): GeneratedObjectDefinition["generatedObjectKind"] | undefined {
  switch (debugPayload?.qaId) {
    case "generated_object/generated-card":
      return "card";
    case "generated_object/generated-dreamsign":
      return "dreamsign";
    case "generated_object/generated-status":
      return "status";
    case "generated_object/generated-transfiguration":
      return "transfiguration";
    default:
      return undefined;
  }
}

const NATURAL_GENERATED_OBJECT_SHAPE_IDS = new Set<JourneyShapeId>([
  "random_allocation",
  "same_cost_different_rewards",
  "same_reward_different_costs",
  "service_menu",
  "shop_row",
  "curated_reward_trio",
  "one_target_many_operations",
  "mirrored_operations",
  "one_operation_many_targets",
]);

const HIGH_WEIRDNESS_GENERATED_OBJECT_SHAPE_IDS = new Set<JourneyShapeId>([
  "random_allocation",
  "one_target_many_operations",
  "mirrored_operations",
  "one_operation_many_targets",
]);

function naturalGeneratedObjectKind(args: {
  debugPayload?: DebugPayloadSelection;
  drawContext: DrawContext;
  shapeId: JourneyShapeId;
  stage: JourneyStage;
}): GeneratedObjectDefinition["generatedObjectKind"] | undefined {
  if (args.debugPayload || !NATURAL_GENERATED_OBJECT_SHAPE_IDS.has(args.shapeId)) {
    return undefined;
  }

  const stageChance = args.stage === "early" ? 1 : args.stage === "mid" ? 3 : 7;
  const weirdnessBonus = HIGH_WEIRDNESS_GENERATED_OBJECT_SHAPE_IDS.has(args.shapeId)
    ? args.stage === "early" ? 2 : args.stage === "mid" ? 4 : 6
    : 0;
  const chance = stageChance + weirdnessBonus;
  const roll = drawInt(
    args.drawContext,
    `generated-object:${args.stage}:${args.shapeId}:gate`,
    1,
    100,
  );

  if (roll > chance) {
    return undefined;
  }

  return weightedChoice(args.drawContext, `generated-object:${args.stage}:${args.shapeId}:kind`, [
    { item: "card" as const, weight: args.stage === "early" ? 4 : 3 },
    { item: "dreamsign" as const, weight: args.stage === "late" ? 4 : 2 },
    { item: "status" as const, weight: args.stage === "mid" ? 4 : 2 },
    { item: "transfiguration" as const, weight: args.stage === "late" ? 4 : 1 },
  ]);
}

function randomVisibility(
  outcomeVisibility: RandomOutcomeVisibility,
  disclosure: string,
  playerVisible: boolean,
  revealTiming?: string,
) {
  return {
    outcomeVisibility,
    disclosure,
    playerVisible,
    ...(revealTiming ? { revealTiming } : {}),
  };
}

function randomRevealRollWagerFill(
  context: JourneyContext,
  drawContext: DrawContext,
): { options: JourneyOption[]; precommitted: PrecommittedOutcomes } {
  const rewards = rewardSlots(context, drawContext, "random-reveal-roll-wager:rewards")
    .filter((entry) => entry.routeEffects === undefined)
    .slice(0, 5);
  const firstReward = rewards[0]!;
  const secondReward = rewards[1] ?? firstReward;
  const thirdReward = rewards[2] ?? firstReward;
  const fourthReward = rewards[3] ?? secondReward;
  const fifthReward = rewards[4] ?? thirdReward;
  const visibleRewards = [firstReward, secondReward, thirdReward, fourthReward];
  const expectedVisibleReward = Math.round(
    visibleRewards.reduce((total, reward) => total + reward.effect, 0) / visibleRewards.length,
  );
  const revealCount = 3;
  const randomIndex = drawInt(drawContext, "random-reveal-roll-wager:random-reward-index", 0, visibleRewards.length - 1);
  const repeatedDrawIndexes = [
    drawInt(drawContext, "random-reveal-roll-wager:draw-1", 0, visibleRewards.length - 1),
    drawInt(drawContext, "random-reveal-roll-wager:draw-2", 0, visibleRewards.length - 1),
  ];
  const firstRoll = drawInt(drawContext, "random-reveal-roll-wager:roll-twice:first", 1, 100);
  const secondRoll = drawInt(drawContext, "random-reveal-roll-wager:roll-twice:second", 1, 100);
  const keptRoll = Math.max(firstRoll, secondRoll);
  const wagerPercent = pickSequentialVariant(drawContext, "random-reveal-roll-wager:wager-odds", [45, 55, 65]);
  const wagerRoll = drawInt(drawContext, "random-reveal-roll-wager:wager-roll", 1, 100);
  const stake = Math.min(45, context.state.quest.resources.essence);
  const rangeMinimum = pickSequentialVariant(drawContext, "random-reveal-roll-wager:range-min", [35, 45, 55]);
  const rangeMaximum = rangeMinimum + pickSequentialVariant(drawContext, "random-reveal-roll-wager:range-width", [40, 55, 70]);
  const committedRangeAmount = drawInt(
    drawContext,
    "random-reveal-roll-wager:range-roll",
    rangeMinimum,
    rangeMaximum,
  );
  const banePercent = pickSequentialVariant(drawContext, "random-reveal-roll-wager:bane-odds", [25, 35, 45]);
  const baneRoll = drawInt(drawContext, "random-reveal-roll-wager:bane-roll", 1, 100);
  const costPercent = pickSequentialVariant(drawContext, "random-reveal-roll-wager:cost-odds", [30, 40, 50]);
  const costRoll = drawInt(drawContext, "random-reveal-roll-wager:cost-roll", 1, 100);
  const randomCostAmount = drawInt(drawContext, "random-reveal-roll-wager:cost-amount", 10, Math.max(10, stake));
  const series = [firstReward, thirdReward, fifthReward];

  const visiblePoolSummary = visibleRewards
    .map((reward) => lowerFirst(reward.text).replace(/\.$/u, ""))
    .join("; ");
  const wagerSuccessText = lowerFirst(secondReward.text).replace(/\.$/u, "");

  const random: RandomPrecommittedOutcome[] = [
    {
      kind: "visible_pool",
      optionNumber: 1,
      poolId: "reveal-roll-wager-visible-pool",
      summary: `Visible pool: ${visiblePoolSummary}.`,
      rewards: visibleRewards.map((reward) => reward.effects).flat(),
      replacement: "with_replacement",
      visibilityPolicy: randomVisibility("visible", "The full reward pool and replacement policy are visible before choosing.", true),
      expectedConvertedEssence: expectedVisibleReward,
      riskPremiumConvertedEssence: -8,
    },
    {
      kind: "random_reward",
      optionNumber: 1,
      reward: thirdReward.effects,
      committedReward: thirdReward.effects,
      visibilityPolicy: randomVisibility("pre_rolled", "A random reward is pre-rolled from the visible pool and committed in metadata.", true),
      expectedConvertedEssence: thirdReward.effect,
      riskPremiumConvertedEssence: -8,
    },
    {
      kind: "reveal_rewards",
      optionNumber: 1,
      revealCount,
      rewards: visibleRewards.slice(0, revealCount).map((reward) => reward.effects).flat(),
      visibilityPolicy: randomVisibility("pre_rolled", "The revealed rewards are pre-rolled and shown in the option text.", true),
      expectedConvertedEssence: expectedVisibleReward,
      riskPremiumConvertedEssence: -5,
    },
    {
      kind: "choose_one_revealed_reward",
      optionNumber: 1,
      revealCount,
      rewards: visibleRewards.slice(0, revealCount).map((reward) => reward.effects).flat(),
      visibilityPolicy: randomVisibility("visible", "The player chooses one of the revealed rewards.", true),
      expectedConvertedEssence: Math.max(...visibleRewards.slice(0, revealCount).map((reward) => reward.effect)),
      riskPremiumConvertedEssence: 0,
    },
    {
      kind: "choose_one_random_revealed_reward",
      optionNumber: 1,
      revealCount,
      rewards: visibleRewards.slice(0, revealCount).map((reward) => reward.effects).flat(),
      committedReward: visibleRewards[randomIndex]!.effects,
      visibilityPolicy: randomVisibility("pre_rolled", "A reward is selected at random from the revealed set and committed in metadata.", true),
      expectedConvertedEssence: expectedVisibleReward,
      riskPremiumConvertedEssence: -10,
    },
    {
      kind: "gain_one_random_reward",
      optionNumber: 1,
      poolId: "reveal-roll-wager-visible-pool",
      rewards: visibleRewards.map((reward) => reward.effects).flat(),
      committedReward: visibleRewards[randomIndex]!.effects,
      visibilityPolicy: randomVisibility("hidden_until_resolution", "The pool is visible, but the selected reward stays hidden until resolution.", false, "after entry"),
      expectedConvertedEssence: expectedVisibleReward,
      riskPremiumConvertedEssence: -14,
    },
    {
      kind: "roll_twice_keep_one",
      optionNumber: 2,
      rolls: [firstRoll, secondRoll],
      keptRoll,
      outcomes: [gainEssence(rangeMinimum), gainEssence(rangeMaximum)],
      visibilityPolicy: randomVisibility("pre_rolled", "Both rolls are committed in metadata; the better roll is kept.", true),
      expectedConvertedEssence: Math.round((rangeMinimum + rangeMaximum) / 2),
      riskPremiumConvertedEssence: -6,
    },
    {
      kind: "repeated_pool_draws",
      optionNumber: 1,
      poolId: "reveal-roll-wager-visible-pool",
      drawCount: repeatedDrawIndexes.length,
      rewards: visibleRewards.map((reward) => reward.effects).flat(),
      committedDraws: repeatedDrawIndexes.map((index) => visibleRewards[index]!.effects),
      replacement: "with_replacement",
      visibilityPolicy: randomVisibility("pre_rolled", "Repeated draws use the visible pool with replacement and are committed in metadata.", true),
      expectedConvertedEssence: expectedVisibleReward * repeatedDrawIndexes.length,
      riskPremiumConvertedEssence: -12,
    },
    {
      kind: "random_range",
      optionNumber: 2,
      resource: "essence",
      minimum: rangeMinimum,
      maximum: rangeMaximum,
      committedAmount: committedRangeAmount,
      visibilityPolicy: randomVisibility("visible", "The random resource range is visible before choosing.", true),
      expectedConvertedEssence: Math.round((rangeMinimum + rangeMaximum) / 2),
      riskPremiumConvertedEssence: -5,
    },
    {
      kind: "random_cost",
      optionNumber: 2,
      odds: odds(costPercent),
      cost: cost("essence", randomCostAmount),
      committedCost: costRoll <= costPercent ? cost("essence", randomCostAmount) : { kind: "no_cost" },
      visibilityPolicy: randomVisibility("delayed", "The chance to pay a random cost is visible; the committed result is delayed.", true, "after entry"),
      expectedConvertedEssence: -Math.round(randomCostAmount * (costPercent / 100)),
      riskPremiumConvertedEssence: -10,
    },
    {
      kind: "chance_to_pay_cost",
      optionNumber: 2,
      odds: odds(costPercent),
      cost: cost("essence", randomCostAmount),
      committedResult: costRoll <= costPercent ? "paid" : "free",
      visibilityPolicy: randomVisibility("pre_rolled", "The chance to pay the cost is visible and the roll is precommitted.", true),
      expectedConvertedEssence: -Math.round(randomCostAmount * (costPercent / 100)),
      riskPremiumConvertedEssence: -10,
    },
    {
      kind: "chance_to_gain_bane",
      optionNumber: 2,
      odds: odds(banePercent),
      baneName: "Nightmare",
      count: 1,
      committedResult: baneRoll <= banePercent ? "bane" : "safe",
      visibilityPolicy: randomVisibility("pre_rolled", "The Bane chance is visible and the roll is precommitted.", true),
      expectedConvertedEssence: Math.round(valueBaneGain("Nightmare", 1) * (banePercent / 100)),
      riskPremiumConvertedEssence: -15,
    },
    {
      kind: "wager",
      optionNumber: 2,
      odds: odds(wagerPercent),
      stake: cost("essence", stake),
      success: secondReward.effects,
      failure: { kind: "no_reward" },
      roll: wagerRoll,
      committedResult: wagerRoll <= wagerPercent ? "success" : "failure",
      visibilityPolicy: randomVisibility("pre_rolled", "The wager odds, stake, success, and failure are visible; the roll is precommitted.", true),
      expectedConvertedEssence: Math.round(secondReward.effect * (wagerPercent / 100)) - stake,
      riskPremiumConvertedEssence: -18,
    },
    {
      kind: "probability_ladder",
      optionNumber: 2,
      bounded: true,
      levels: [
        { level: 1, odds: odds(35), reward: firstReward.effects },
        { level: 2, odds: odds(55), reward: thirdReward.effects },
      ],
      visibilityPolicy: randomVisibility("visible", "Probability ladder levels expose bounded odds before commitment.", true),
      expectedConvertedEssence: Math.round((firstReward.effect * 0.35) + (thirdReward.effect * 0.55)),
      riskPremiumConvertedEssence: -12,
    },
    {
      kind: "push_choice",
      optionNumber: 2,
      bounded: true,
      odds: odds(65),
      hazard: nightmare(1),
      committedResult: drawInt(drawContext, "random-reveal-roll-wager:push-roll", 1, 100) <= 65 ? "success" : "failure",
      visibilityPolicy: randomVisibility("visible", "Push choice hazard and success chance are visible before choosing.", true),
      expectedConvertedEssence: Math.round(fourthReward.effect * 0.65),
      riskPremiumConvertedEssence: -20,
    },
    {
      kind: "resolved_random_series",
      optionNumber: 1,
      series: series.map((reward) => reward.effects).flat(),
      resolved: true,
      visibilityPolicy: randomVisibility("resolved", "The random series is fully resolved and committed in order.", true),
      expectedConvertedEssence: Math.round(series.reduce((total, reward) => total + reward.effect, 0) / series.length),
      riskPremiumConvertedEssence: -4,
    },
  ];

  return {
    options: [
      option({
        number: 1,
        text: `Reveal ${revealCount} rewards from a visible pool (${visiblePoolSummary}); choose one revealed reward, choose one random revealed reward, gain one hidden random reward, or resolve a two-draw series from that pool.`,
        effects: [
          {
            kind: "random_reward",
            table: "visible_reveal_pool",
            poolId: "reveal-roll-wager-visible-pool",
            revealCount,
            replacement: "with_replacement",
          },
        ],
        effect: 180,
        uncertainty: -20,
      }),
      option({
        number: 2,
        text: `Pay ${stake} essence. Roll twice and keep the better committed roll (${firstRoll}, ${secondRoll}); gain ${rangeMinimum}-${rangeMaximum} random essence; ${wagerPercent}% chance to ${wagerSuccessText}; ${banePercent}% chance to gain 1 Nightmare; ${costPercent}% chance to pay ${randomCostAmount} extra essence.`,
        costs: [cost("essence", stake)],
        effects: [
          { kind: "random_reward", table: "wager", odds: odds(wagerPercent) },
          {
            kind: "resource_random_range",
            resource: "essence",
            amount: committedRangeAmount,
            minimum: rangeMinimum,
            maximum: rangeMaximum,
            extra: { resourceAmountKind: "random_range" },
          },
        ],
        cost: stake,
        effect: stake + 200,
        uncertainty: -40,
      }),
    ],
    precommitted: { random },
  };
}

function cardQualityValue(card: CardContent): number {
  const rarityValue =
    card.rarity === "Rare"
      ? CARD_VALUE_CONSTANTS.namedVisibleByRarity.rare
      : card.rarity === "Uncommon"
        ? CARD_VALUE_CONSTANTS.namedVisibleByRarity.uncommon
        : card.rarity === "Starter"
          ? PURGE_VALUE_CONSTANTS.chosenStarter
          : CARD_VALUE_CONSTANTS.namedVisibleByRarity.common;
  const fastBonus = card.raw["is-fast"] === true || card.raw.isFast === true ? 10 : 0;
  const sparkBonus = typeof card.spark === "number" ? Math.min(20, card.spark * 3) : 0;

  return rarityValue + fastBonus + sparkBonus;
}

function sourcePoolSizeForCardSource(context: JourneyContext, source: "catalog" | "deck" | "draftPool"): number {
  switch (source) {
    case "deck":
      return context.state.quest.deck.summary.uniqueCards;
    case "draftPool":
      return context.state.quest.draftPoolSummary.uniqueCards;
    case "catalog":
      return context.content.cards.length;
  }
}

function starterDeckCards(context: JourneyContext): CardContent[] {
  return resolveCardTargets(context.content, context.state.quest, { source: "deck", starter: true });
}

function catalogRewardCards(context: JourneyContext, drawContext: DrawContext): CardContent[] {
  const selectedDraftCards = selectedCardTargets(context, drawContext);
  const fallback = shuffleDeterministic(
    drawContext,
    "named-card-operation-menu:catalog-fallback",
    context.content.cards.filter((card) => card.rarity !== "Starter"),
  );

  return [...selectedDraftCards, ...fallback].filter((card, index, cards) =>
    cards.findIndex((entry) => entry.id === card.id) === index
  );
}

function namedCardPayload(args: {
  kind: string;
  target?: CardContent;
  result?: CardContent;
  secondTarget?: CardContent;
  source?: "catalog" | "deck" | "draftPool";
  extra?: Record<string, unknown>;
}, context: JourneyContext): Record<string, unknown> {
  const source = args.source ?? (args.target ? "deck" : "catalog");

  return {
    kind: args.kind,
    cardOperationKind: args.kind.replace(/^card_/u, ""),
    source,
    sourcePoolSize: sourcePoolSizeForCardSource(context, source),
    timing: "immediate",
    ...(args.target
      ? {
          targetCardId: args.target.id,
          targetCardName: args.target.name,
        }
      : {}),
    ...(args.result
      ? {
          resultCardId: args.result.id,
          resultCardName: args.result.name,
          ...(!args.target
            ? {
                cardId: args.result.id,
                cardName: args.result.name,
              }
            : {}),
        }
      : {}),
    ...(args.secondTarget
      ? {
          secondTargetCardId: args.secondTarget.id,
          secondTargetCardName: args.secondTarget.name,
        }
      : {}),
    ...(args.extra ?? {}),
  };
}

function namedCardOperationOptions(
  context: JourneyContext,
  drawContext: DrawContext,
): JourneyOption[] {
  const deckTargets = starterDeckCards(context);
  const rewardCards = catalogRewardCards(context, drawContext);
  const targetA = deckTargets[0]!;
  const targetB = deckTargets[1] ?? targetA;
  const targetC = deckTargets[2] ?? targetA;
  const targetD = deckTargets[3] ?? targetA;
  const resultA = rewardCards[0] ?? targetA;
  const resultB = rewardCards[1] ?? resultA;
  const resultC = rewardCards[2] ?? resultA;
  const rewardSource: "catalog" | "draftPool" = context.state.quest.draftPool.some((entry) => entry.cardId === resultA.id)
    ? "draftPool"
    : "catalog";
  const operationSpecs = [
    {
      key: "gain",
      text: `Gain {${resultA.name}}.`,
      effect: namedCardPayload({ kind: "card_gain", result: resultA, source: rewardSource }, context),
      value: cardQualityValue(resultA),
    },
    {
      key: "purge",
      text: `Purge {${targetA.name}} from your deck.`,
      effect: namedCardPayload({ kind: "card_purge", target: targetA }, context),
      value: Math.round(PURGE_VALUE_CONSTANTS.chosenStarter * 1.2),
    },
    {
      key: "duplicate",
      text: `Add 2 copies of {${targetB.name}} to your deck.`,
      effect: namedCardPayload({ kind: "card_duplicate", target: targetB, extra: { copyCount: 2 } }, context),
      value: CARD_MODIFICATION_VALUE_CONSTANTS.duplicateChosen,
    },
    {
      key: "transform",
      text: `Transform {${targetC.name}} into {${resultB.name}}.`,
      effect: namedCardPayload({ kind: "card_transform", target: targetC, result: resultB }, context),
      value: 135,
    },
    {
      key: "replace",
      text: `Replace {${targetD.name}} with {${resultC.name}}.`,
      effect: namedCardPayload({ kind: "card_replace", target: targetD, result: resultC }, context),
      value: 140,
    },
    {
      key: "transfigure",
      text: `Apply {Viridian Transfiguration} to {${targetA.name}}.`,
      effect: namedCardPayload({
        kind: "card_transfigure",
        target: targetA,
        extra: { transfigurationName: "Viridian" },
      }, context),
      value: TRANSFIGURATION_VALUE_CONSTANTS.standardByType.Viridian,
    },
    {
      key: "text",
      text: `Add "Foresee 1" to {${targetB.name}}.`,
      effect: namedCardPayload({
        kind: "card_text_modification",
        target: targetB,
        extra: { textModification: "Add Foresee 1" },
      }, context),
      value: CARD_MODIFICATION_VALUE_CONSTANTS.lowerCostOrAddFastOrReclaim,
    },
    {
      key: "type",
      text: `Make {${targetC.name}} an Event card.`,
      effect: namedCardPayload({
        kind: "card_type_change",
        target: targetC,
        extra: { newCardType: "Event" },
      }, context),
      value: 105,
    },
    {
      key: "keyword-add",
      text: `Add Fast to {${targetD.name}}.`,
      effect: namedCardPayload({ kind: "card_keyword_add", target: targetD, extra: { keyword: "Fast" } }, context),
      value: CARD_MODIFICATION_VALUE_CONSTANTS.lowerCostOrAddFastOrReclaim,
    },
    {
      key: "keyword-remove",
      text: `Remove Dissolve from {${targetA.name}}.`,
      effect: namedCardPayload({ kind: "card_keyword_remove", target: targetA, extra: { keyword: "Dissolve" } }, context),
      value: 95,
    },
    {
      key: "opening-hand",
      text: `{${targetB.name}} appears in your opening hand for the next 3 battles.`,
      effect: namedCardPayload({
        kind: "card_opening_hand",
        target: targetB,
        extra: { duration: BATTLE_WINDOW_DURATION },
      }, context),
      value: 105,
      uncertainty: -10,
    },
    {
      key: "merge",
      text: `Merge {${targetA.name}} and {${targetB.name}} into one card.`,
      effect: namedCardPayload({
        kind: "card_merge",
        target: targetA,
        secondTarget: targetB,
      }, context),
      value: CARD_MODIFICATION_VALUE_CONSTANTS.mergeOrSplitExistingCards,
    },
    {
      key: "split",
      text: `Split {${targetC.name}} into two focused cards.`,
      effect: namedCardPayload({ kind: "card_split", target: targetC }, context),
      value: CARD_MODIFICATION_VALUE_CONSTANTS.mergeOrSplitExistingCards,
    },
    {
      key: "temporary-copy",
      text: `Create a temporary copy of {${targetD.name}} for the next 3 battles.`,
      effect: namedCardPayload({
        kind: "card_temporary_copy",
        target: targetD,
        extra: { duration: BATTLE_WINDOW_DURATION, copyCount: 1, temporary: true },
      }, context),
      value: 110,
      uncertainty: -10,
    },
    {
      key: "delayed-transformation",
      text: `After next victory, transform {${targetA.name}} into {${resultA.name}}.`,
      effect: namedCardPayload({
        kind: "card_delayed_transformation",
        target: targetA,
        result: resultA,
        extra: { timing: "after next victory", trigger: "after next victory" },
      }, context),
      value: 120,
      uncertainty: -8,
    },
  ];
  const start = drawInt(drawContext, "named-card-operation-menu:start", 0, operationSpecs.length - 1);
  const ordered = operationSpecs.map((_, index) => operationSpecs[(start + index) % operationSpecs.length]!);

  return ordered.slice(0, 4).map((entry, index) =>
    option({
      number: index + 1,
      text: entry.text,
      effects: [entry.effect],
      targets: entry.effect.targetCardName
        ? [target("card", `${entry.effect.targetCardName} in deck`, {
            source: "deck",
            ids: [entry.effect.targetCardId],
            names: [entry.effect.targetCardName],
          })]
        : [target("card", `${entry.effect.resultCardName} in ${entry.effect.source}`, {
            source: entry.effect.source,
            ids: [entry.effect.resultCardId],
            names: [entry.effect.resultCardName],
          })],
      effect: Math.max(135, Math.min(155, entry.value)),
      uncertainty: entry.uncertainty,
    })
  );
}

function starterCleanupReplacementOptions(
  context: JourneyContext,
  drawContext: DrawContext,
): JourneyOption[] {
  const starters = starterDeckCards(context);
  const replacements = catalogRewardCards(context, drawContext);
  const firstStarter = starters[0]!;
  const secondStarter = starters[1] ?? firstStarter;
  const thirdStarter = starters[2] ?? firstStarter;
  const firstReplacement = replacements[0] ?? firstStarter;
  const secondReplacement = replacements[1] ?? firstReplacement;
  const cleanup = namedCardPayload({
    kind: "starter_cleanup",
    target: firstStarter,
    extra: { count: 1, cleanupMode: "purge" },
  }, context);
  const draftReplacement = namedCardPayload({
    kind: "starter_replacement",
    target: secondStarter,
    extra: {
      replacementMode: "draft",
      takeCount: 1,
      choiceCount: CARD_DRAFT_CHOICE_COUNT,
      predicate: { source: "draftPool", maxEnergyCost: 2 },
    },
  }, context);
  const namedReplacement = namedCardPayload({
    kind: "starter_replacement",
    target: thirdStarter,
    result: secondReplacement,
    extra: {
      replacementMode: "named",
    },
  }, context);
  const options = [
    {
      text: `Purge {${firstStarter.name}}. Gain 2 omens.`,
      effect: cleanup,
      value: 150,
    },
    {
      text: `Purge {${secondStarter.name}}. Draft 1 of 4 low-cost replacement cards.`,
      effect: draftReplacement,
      value: 150,
    },
    {
      text: `Replace {${thirdStarter.name}} with {${secondReplacement.name}}.`,
      effect: namedReplacement,
      value: 145,
    },
  ];

  return shuffleDeterministic(drawContext, "starter-cleanup-replacement:order", options)
    .map((entry, index) =>
      option({
        number: index + 1,
        text: entry.text,
        effects: entry.effect.kind === "starter_cleanup"
          ? [entry.effect, gainOmen(2)]
          : [entry.effect],
        targets: [target("card", `${entry.effect.targetCardName} in starter deck`, {
          source: "deck",
          starter: true,
          ids: [entry.effect.targetCardId],
          names: [entry.effect.targetCardName],
        })],
        effect: entry.value,
      })
    );
}

function namedDreamsignShopRowOptions(
  context: JourneyContext,
  drawContext: DrawContext,
): JourneyOption[] {
  const poolIds = new Set(context.state.quest.dreamsignPoolIds);
  const primary = selectedDreamsignTargets(context, drawContext);
  const fallback = shuffleDeterministic(
    drawContext,
    "named-dreamsign-shop-row:fallback",
    context.content.dreamsigns,
  );
  const candidates = [...primary, ...fallback].filter((dreamsign, index, entries) =>
    entries.findIndex((entry) => entry.id === dreamsign.id) === index
  ).slice(0, 3);
  const priceSlots = [
    {
      text: "essence",
      costs: [cost("essence", Math.min(20, context.state.quest.resources.essence))],
      cost: Math.min(20, context.state.quest.resources.essence),
    },
    {
      text: "omens",
      costs: [cost("omens", Math.min(1, context.state.quest.resources.omens))],
      cost: Math.abs(valueOmenLoss(Math.min(1, context.state.quest.resources.omens))),
    },
    {
      text: "essence",
      costs: [cost("essence", Math.min(45, context.state.quest.resources.essence))],
      cost: Math.min(45, context.state.quest.resources.essence),
    },
  ];

  return candidates.map((dreamsign: DreamsignContent, index) => {
    const source = poolIds.has(dreamsign.id) ? "pool" : "catalog";
    const sourcePoolSize = source === "pool"
      ? context.state.quest.dreamsignPoolIds.length
      : context.content.dreamsigns.length;
    const effect = {
      kind: "dreamsign_purchase",
      dreamsignId: dreamsign.id,
      dreamsignName: dreamsign.name,
      source,
      sourcePoolSize,
      timing: "immediate",
    };
    const price = priceSlots[index]!;
    const priceText = price.text === "omens"
      ? `Pay ${(price.costs[0] as { amount: number }).amount} omen.`
      : `Pay ${(price.costs[0] as { amount: number }).amount} essence.`;

    return option({
      number: index + 1,
      text: `${priceText} Gain {${dreamsign.name}} immediately.`,
      costs: price.costs,
      effects: [effect],
      targets: [
        target("dreamsign", `${dreamsign.name} in Dreamsign ${source}`, {
          source,
          ids: [dreamsign.id],
          names: [dreamsign.name],
        }),
      ],
      cost: price.cost,
      effect: DREAMSIGN_VALUE_CONSTANTS.namedGain + (source === "pool" ? 20 : 0),
    });
  });
}

function sourcePoolSizeForDreamsignSource(
  context: JourneyContext,
  source: "catalog" | "active" | "pool",
): number {
  switch (source) {
    case "active":
      return context.state.quest.activeDreamsigns.length;
    case "pool":
      return context.state.quest.dreamsignPoolIds.length;
    case "catalog":
      return context.content.dreamsigns.length;
  }
}

function namedDreamsignPayload(args: {
  kind: string;
  dreamsign: DreamsignContent;
  source?: "catalog" | "active" | "pool";
  result?: DreamsignContent;
  resultSource?: "catalog" | "active" | "pool";
  extra?: Record<string, unknown>;
}, context: JourneyContext): Record<string, unknown> {
  const source = args.source ?? "pool";

  return {
    kind: args.kind,
    dreamsignOperationKind: args.kind.replace(/^dreamsign_/u, ""),
    dreamsignId: args.dreamsign.id,
    dreamsignName: args.dreamsign.name,
    source,
    sourcePoolSize: sourcePoolSizeForDreamsignSource(context, source),
    timing: "immediate",
    ...(args.result
      ? {
          newDreamsignId: args.result.id,
          newDreamsignName: args.result.name,
          resultDreamsignId: args.result.id,
          resultDreamsignName: args.result.name,
          resultSource: args.resultSource ?? "catalog",
        }
      : {}),
    ...(args.extra ?? {}),
  };
}

function dreamsignExactTarget(dreamsign: DreamsignContent, source: "catalog" | "active" | "pool") {
  return target("dreamsign", `${dreamsign.name} in Dreamsign ${source}`, {
    source,
    ids: [dreamsign.id],
    names: [dreamsign.name],
  });
}

function dreamsignTransformDuplicatePoolOptions(
  context: JourneyContext,
  drawContext: DrawContext,
): JourneyOption[] {
  const pool = selectedDreamsignTargets(context, drawContext);
  const catalog = shuffleDeterministic(drawContext, "dreamsign-transform:catalog", context.content.dreamsigns);
  const neutral = shuffleDeterministic(
    drawContext,
    "dreamsign-transform:neutral",
    resolveDreamsignTargets(context.content, context.state.quest, { source: "catalog", kind: "neutral" }),
  );
  const selectedTidal = shuffleDeterministic(
    drawContext,
    "dreamsign-transform:selected-tidal",
    resolveDreamsignTargets(context.content, context.state.quest, {
      source: "catalog",
      kind: "tidal",
      tideOverlap: "selected",
    }),
  );
  const sourceA = pool[0] ?? catalog[0]!;
  const sourceB = pool.find((dreamsign) => dreamsign.id !== sourceA.id) ?? catalog[1] ?? sourceA;
  const sourceC = pool.find((dreamsign) => dreamsign.id !== sourceA.id && dreamsign.id !== sourceB.id) ?? catalog[2] ?? sourceA;
  const resultA = selectedTidal.find((dreamsign) => dreamsign.id !== sourceA.id) ??
    catalog.find((dreamsign) => dreamsign.id !== sourceA.id) ??
    sourceB;
  const resultB = neutral.find((dreamsign) => dreamsign.id !== sourceB.id) ??
    catalog.find((dreamsign) => dreamsign.id !== sourceB.id) ??
    sourceA;
  const resultC = catalog.find((dreamsign) =>
    dreamsign.id !== sourceA.id && dreamsign.id !== sourceB.id && dreamsign.id !== sourceC.id
  ) ?? resultA;
  const poolIds = pool.slice(0, 4).map((dreamsign) => dreamsign.id);
  const transform = namedDreamsignPayload({
    kind: "dreamsign_transform",
    dreamsign: sourceA,
    source: "pool",
    result: resultA,
    resultSource: "catalog",
  }, context);
  const purge = namedDreamsignPayload({
    kind: "dreamsign_purge",
    dreamsign: sourceA,
    source: "pool",
  }, context);
  const duplicate = namedDreamsignPayload({
    kind: "dreamsign_duplicate",
    dreamsign: sourceB,
    source: "pool",
    extra: { copyCount: 2 },
  }, context);
  const gain = namedDreamsignPayload({
    kind: "dreamsign_gain",
    dreamsign: resultB,
    source: "catalog",
  }, context);
  const copyGain = namedDreamsignPayload({
    kind: "dreamsign_copy_gain",
    dreamsign: sourceB,
    source: "pool",
    extra: { copyCount: 1 },
  }, context);
  const temporary = namedDreamsignPayload({
    kind: "dreamsign_temporary_grant",
    dreamsign: resultB,
    source: "catalog",
    extra: { temporary: true, duration: BATTLE_WINDOW_DURATION },
  }, context);
  const poolEdit = namedDreamsignPayload({
    kind: "dreamsign_pool_edit",
    dreamsign: sourceC,
    source: "pool",
    result: resultC,
    resultSource: "catalog",
    extra: { poolOperation: "replace" },
  }, context);
  const triggerCounter = namedDreamsignPayload({
    kind: "dreamsign_trigger_counter",
    dreamsign: sourceA,
    source: "pool",
    extra: { trigger: "after next victory", count: 2 },
  }, context);
  const randomReward = namedDreamsignPayload({
    kind: "dreamsign_random_reward",
    dreamsign: resultA,
    source: "catalog",
    extra: {
      selection: "visible_random",
      rewardPoolDreamsignIds: poolIds.length > 0 ? poolIds : [sourceA.id, sourceB.id],
      odds: { numerator: 1, denominator: Math.max(1, poolIds.length), percent: Math.round(100 / Math.max(1, poolIds.length)) },
    },
  }, context);
  const tradeHook = namedDreamsignPayload({
    kind: "dreamsign_trade_hook",
    dreamsign: sourceB,
    source: "pool",
    result: resultB,
    resultSource: "catalog",
    extra: {
      timing: "after next battle",
      obligation: `Trade ${sourceB.name} for ${resultB.name}`,
      giveDreamsignId: sourceB.id,
      giveDreamsignName: sourceB.name,
      receiveDreamsignId: resultB.id,
      receiveDreamsignName: resultB.name,
    },
  }, context);
  const loss = namedDreamsignPayload({
    kind: "dreamsign_loss",
    dreamsign: sourceB,
    source: "pool",
    extra: { timing: "after next battle", reason: "trade obligation" },
  }, context);

  return [
    option({
      number: 1,
      text: `Transform {${sourceA.name}} into {${resultA.name}}, purging the old sign. Add another copy of {${sourceB.name}}.`,
      effects: [transform, purge, duplicate],
      targets: [
        dreamsignExactTarget(sourceA, "pool"),
        dreamsignExactTarget(sourceB, "pool"),
        dreamsignExactTarget(resultA, "catalog"),
      ],
      effect: DREAMSIGN_VALUE_CONSTANTS.namedGain + DREAMSIGN_VALUE_CONSTANTS.selectedTideMatchBonus,
    }),
    option({
      number: 2,
      text: `Gain {${resultB.name}} as a temporary Dreamsign for the next 3 battles. Copy {${sourceB.name}} once.`,
      effects: [gain, temporary, copyGain],
      targets: [
        dreamsignExactTarget(resultB, "catalog"),
        dreamsignExactTarget(sourceB, "pool"),
      ],
      effect: DREAMSIGN_VALUE_CONSTANTS.namedGain + 35,
      uncertainty: -10,
    }),
    option({
      number: 3,
      text: `Replace {${sourceC.name}} in your Dreamsign pool with {${resultC.name}}. After next battle, trade away {${sourceB.name}} for {${resultB.name}}. Count the next 2 {${sourceA.name}} triggers; one random pool Dreamsign may also appear.`,
      effects: [poolEdit, tradeHook, loss, triggerCounter, randomReward],
      targets: [
        dreamsignExactTarget(sourceC, "pool"),
        dreamsignExactTarget(resultC, "catalog"),
        dreamsignExactTarget(sourceB, "pool"),
        dreamsignExactTarget(sourceA, "pool"),
      ],
      effect: DREAMSIGN_VALUE_CONSTANTS.namedGain + 55,
      uncertainty: -12,
    }),
  ];
}

function banePayload(args: {
  kind: string;
  baneName: string;
  count?: number;
  targetContext?: "current_state" | "future_burden" | "manifest_obligation";
  selection?: "exact" | "chosen_after_commitment" | "visible_random";
  timing?: string;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    kind: args.kind,
    baneOperationKind: args.kind.replace(/^bane_/u, ""),
    baneName: args.baneName,
    count: args.count ?? 1,
    baneTargetContext: args.targetContext ?? "future_burden",
    selection: args.selection ?? "exact",
    timing: args.timing ?? "immediate",
    ...(args.extra ?? {}),
  };
}

function baneGainPurgeTransformOptions(
  context: JourneyContext,
  drawContext: DrawContext,
): JourneyOption[] {
  const rewardCards = catalogRewardCards(context, drawContext);
  const transformCard = rewardCards[0] ?? context.content.cards.find((card) => card.rarity !== "Starter") ?? context.content.cards[0]!;
  const replacement = pickSequentialVariant(drawContext, "bane-gain-purge-transform:replacement", [
    "Doubt",
    "Silence",
    "Paranoia",
  ]);
  const gained = banePayload({
    kind: "bane_gain",
    baneName: "Nightmare",
    count: 2,
    targetContext: "future_burden",
  });
  const delayed = banePayload({
    kind: "bane_gain",
    baneName: "Doubt",
    targetContext: "future_burden",
    timing: "after next battle",
    extra: { delayed: true },
  });
  const temporary = banePayload({
    kind: "bane_gain",
    baneName: "Paranoia",
    targetContext: "future_burden",
    timing: BATTLE_WINDOW_DURATION,
    extra: { temporary: true, duration: BATTLE_WINDOW_DURATION },
  });
  const chosenPurge = banePayload({
    kind: "bane_chosen_purge",
    baneName: "Nightmare",
    targetContext: "manifest_obligation",
    selection: "chosen_after_commitment",
  });
  const randomPurge = banePayload({
    kind: "bane_random_purge",
    baneName: "Despair",
    targetContext: "manifest_obligation",
    selection: "visible_random",
  });
  const replace = banePayload({
    kind: "bane_replace",
    baneName: "Oblivion",
    targetContext: "manifest_obligation",
    extra: { newBaneName: replacement },
  });
  const transform = banePayload({
    kind: "bane_transform_to_card",
    baneName: "Despair",
    targetContext: "manifest_obligation",
    extra: {
      cardId: transformCard.id,
      cardName: transformCard.name,
      source: "catalog",
    },
  });

  return [
    option({
      number: 1,
      text: "Gain 180 essence. Gain 2 Nightmares now and gain 1 Doubt after next battle.",
      effects: [gainEssence(180)],
      burdens: [gained, delayed],
      targets: [baneTarget("future Bane burden", ["Nightmare", "Doubt"])],
      effect: 330,
      burden: valueBaneGain("Nightmare", 2) + Math.round(valueBaneGain("Doubt", 1) * BANE_VALUE_CONSTANTS.delayedMultiplier),
    }),
    option({
      number: 2,
      text: `Choose a manifest Nightmare obligation to purge, purge one random visible Despair obligation, then replace Oblivion with ${replacement}.`,
      effects: [chosenPurge, randomPurge, replace],
      targets: [
        baneTarget("manifest-local Bane obligations", ["Nightmare", "Despair", "Oblivion"], "vocabulary", "chosen_after_commitment"),
      ],
      effect: 150,
    }),
    option({
      number: 3,
      text: `Transform a manifest Despair obligation into {${transformCard.name}}.`,
      effects: [transform],
      targets: [
        baneTarget("manifest-local Bane obligation", ["Despair"]),
        target("card", `${transformCard.name} in catalog`, {
          source: "catalog",
          ids: [transformCard.id],
          names: [transformCard.name],
        }),
      ],
      effect: BANE_VALUE_CONSTANTS.transformToCardBase + Math.min(35, cardQualityValue(transformCard) - 75),
    }),
    option({
      number: 4,
      text: "Gain 220 essence. Carry 1 temporary Paranoia for the next 3 battles.",
      effects: [gainEssence(220)],
      burdens: [temporary],
      targets: [baneTarget("temporary future Bane burden", ["Paranoia"])],
      effect: 195,
      burden: Math.round(valueBaneGain("Paranoia", 1) * BANE_VALUE_CONSTANTS.temporaryMultiplier),
    }),
  ];
}

function resourcePayload(args: {
  kind: string;
  resource: "essence" | "omens" | "maxEssence";
  amount?: number;
  percentage?: number;
  minimum?: number;
  maximum?: number;
  capDelta?: number;
  basis?: "current" | "maximum" | "remaining" | "reward";
  timing?: string;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    kind: args.kind,
    resource: args.resource,
    timing: args.timing ?? "immediate",
    ...(args.amount !== undefined ? { amount: args.amount } : {}),
    ...(args.percentage !== undefined ? { percentage: args.percentage } : {}),
    ...(args.minimum !== undefined ? { minimum: args.minimum } : {}),
    ...(args.maximum !== undefined ? { maximum: args.maximum } : {}),
    ...(args.capDelta !== undefined ? { capDelta: args.capDelta } : {}),
    ...(args.basis ? { basis: args.basis } : {}),
    ...(args.extra ?? {}),
  };
}

function resourceEdgeCaseOptions(context: JourneyContext): JourneyOption[] {
  const resources = context.state.quest.resources;
  const restoreAmount = Math.max(0, resources.maxEssence - resources.essence);
  const percentageGain = Math.round(resources.maxEssence * 0.25);
  const percentageCost = Math.min(resources.essence, Math.ceil(resources.essence * 0.1));
  const allRemaining = resources.essence;

  return [
    option({
      number: 1,
      text: "Restore essence to maximum. Gain 25 maximum essence.",
      effects: [
        resourcePayload({
          kind: "resource_restore_to_maximum",
          resource: "essence",
          amount: restoreAmount,
          basis: "maximum",
          extra: { resourceAmountKind: "restore_to_maximum" },
        }),
        resourcePayload({
          kind: "resource_cap_change",
          resource: "maxEssence",
          amount: 25,
          capDelta: 25,
          extra: { resourceAmountKind: "cap_change" },
        }),
      ],
      effect: 150,
    }),
    option({
      number: 2,
      text: `Pay ${percentageCost} essence (10% of current essence). Gain ${percentageGain} essence (25% of maximum).`,
      costs: [
        {
          kind: "essence",
          amount: percentageCost,
          resource: "essence",
          resourceAmountKind: "percentage_of_current",
          percentage: 10,
          basis: "current",
          timing: "immediate",
        },
      ],
      effects: [
        resourcePayload({
          kind: "resource_percentage",
          resource: "essence",
          amount: percentageGain,
          percentage: 25,
          basis: "maximum",
          extra: { resourceAmountKind: "percentage_of_maximum" },
        }),
      ],
      cost: 40,
      effect: 190,
    }),
    option({
      number: 3,
      text: `Pay all remaining essence (${allRemaining}). Gain a random 80-120 essence and 2 omens.`,
      costs: [
        {
          kind: "essence",
          amount: allRemaining,
          resource: "essence",
          resourceAmountKind: "all_remaining",
          basis: "remaining",
          allRemaining: true,
          timing: "immediate",
        },
      ],
      effects: [
        resourcePayload({
          kind: "resource_random_range",
          resource: "essence",
          amount: 100,
          minimum: 80,
          maximum: 120,
          extra: { resourceAmountKind: "random_range" },
        }),
        gainOmen(2),
      ],
      cost: 120,
      effect: 270,
      uncertainty: -10,
    }),
    option({
      number: 4,
      text: "Gain 260 essence. After next victory, pay 2 omens and reduce the next Journey reward by 25%.",
      effects: [gainEssence(260)],
      burdens: [
        resourcePayload({
          kind: "omen_loss",
          resource: "omens",
          amount: 2,
          timing: "after next victory",
          extra: { resourceAmountKind: "fixed", multiOmenCost: true },
        }),
        resourcePayload({
          kind: "resource_reward_reduction",
          resource: "essence",
          amount: 25,
          percentage: 25,
          basis: "reward",
          timing: "after next victory",
          extra: { resourceAmountKind: "reward_reduction" },
        }),
      ],
      effect: 290,
      burden: -140,
    }),
  ];
}

function routePayload(args: {
  operation: "add_site" | "remove_site" | "replace_site" | "purge_site" | "probability_adjustment";
  routeScope: "current_dreamscape" | "next_dreamscape" | "future_dreamscapes" | "full_atlas";
  polarity: "positive" | "negative" | "neutral";
  siteDeltaValue: number;
  siteType?: string;
  fromSite?: string;
  toSite?: string;
  probabilityDeltaPercent?: number;
  timing: string;
  description: string;
}): Record<string, unknown> {
  return {
    kind: `route_${args.operation}`,
    routeOperationKind: args.operation,
    routeScope: args.routeScope,
    routePolarity: args.polarity,
    siteDeltaValue: args.siteDeltaValue,
    timing: args.timing,
    source: "simulated_manifest_only",
    description: args.description,
    ...(args.siteType ? { siteType: args.siteType } : {}),
    ...(args.fromSite ? { fromSite: args.fromSite } : {}),
    ...(args.toSite ? { toSite: args.toSite } : {}),
    ...(args.probabilityDeltaPercent !== undefined ? { probabilityDeltaPercent: args.probabilityDeltaPercent } : {}),
  };
}

function routeEditOptions(): JourneyOption[] {
  const replace = routePayload({
    operation: "replace_site",
    routeScope: "current_dreamscape",
    polarity: "positive",
    siteDeltaValue: 95,
    fromSite: "Shop",
    toSite: "Purge",
    timing: "current dreamscape",
    description: "replace a current Shop with a Purge site",
  });
  const add = routePayload({
    operation: "add_site",
    routeScope: "next_dreamscape",
    polarity: "positive",
    siteDeltaValue: 55,
    siteType: "Dreamsign Offering",
    timing: "next dreamscape",
    description: "add a Dreamsign Offering to the next dreamscape",
  });
  const remove = routePayload({
    operation: "remove_site",
    routeScope: "future_dreamscapes",
    polarity: "positive",
    siteDeltaValue: 120,
    siteType: "Draft",
    timing: "future dreamscapes",
    description: "remove one low-value Draft site from a future dreamscape",
  });
  const purge = routePayload({
    operation: "purge_site",
    routeScope: "full_atlas",
    polarity: "positive",
    siteDeltaValue: 145,
    siteType: "Dream Journey",
    timing: "full atlas",
    description: "purge extra Dream Journey sites from the full atlas",
  });
  const probability = routePayload({
    operation: "probability_adjustment",
    routeScope: "future_dreamscapes",
    polarity: "positive",
    siteDeltaValue: 135,
    siteType: "Transfiguration",
    probabilityDeltaPercent: 25,
    timing: "future dreamscapes",
    description: "increase future Transfiguration site odds",
  });

  return [
    option({
      number: 1,
      text: "Replace a Shop in the current dreamscape with a Purge site. Add a Dreamsign Offering to the next dreamscape.",
      routeEffects: [replace, add],
      effect: 150,
    }),
    option({
      number: 2,
      text: "Remove one low-value Draft site from a future dreamscape.",
      routeEffects: [remove],
      effect: 120,
    }),
    option({
      number: 3,
      text: "Purge extra Dream Journey sites from the full atlas.",
      routeEffects: [purge],
      effect: 145,
    }),
    option({
      number: 4,
      text: "Increase future Transfiguration site odds by 25%.",
      routeEffects: [probability],
      effect: 135,
    }),
  ];
}

function shopPayload(args: {
  kind: string;
  scope: "current_shop" | "next_shop" | "future_shops" | "next_purchases" | "site_specific";
  duration: string;
  amount?: number;
  count?: number;
  siteType?: string;
  hook?: string;
}): Record<string, unknown> {
  return {
    kind: "shop_economy_modifier",
    economyOperationKind: args.kind,
    shopScope: args.scope,
    duration: args.duration,
    timing: args.scope === "current_shop" ? "immediate" : args.duration,
    ...(args.amount !== undefined ? { amount: args.amount } : {}),
    ...(args.count !== undefined ? { count: args.count } : {}),
    ...(args.siteType ? { siteType: args.siteType } : {}),
    ...(args.hook ? { hook: args.hook } : {}),
    ...(args.hook ? { hookBudgetCost: 1 } : {}),
  };
}

function shopEconomyOptions(): JourneyOption[] {
  return [
    option({
      number: 1,
      text: "Pay 10 essence. Rerolls in this shop cost 1 fewer omen.",
      costs: [cost("essence", 10)],
      effects: [shopPayload({ kind: "reroll_discount", scope: "current_shop", duration: "current shop", amount: 1 })],
      cost: 10,
      effect: 145,
    }),
    option({
      number: 2,
      text: "Pay 15 essence. Your next future shop purchase is free.",
      costs: [cost("essence", 15)],
      effects: [shopPayload({ kind: "free_future_purchase", scope: "next_purchases", duration: "next 1 purchase", count: 1 })],
      cost: 15,
      effect: 150,
    }),
    option({
      number: 3,
      text: "Pay 20 essence. At the next shop, restore 120 essence before buying.",
      costs: [cost("essence", 20)],
      effects: [shopPayload({ kind: "next_shop_essence_restore", scope: "next_shop", duration: "next shop", amount: 120 })],
      cost: 20,
      effect: 150,
    }),
    option({
      number: 4,
      text: "Pay 15 essence. For the next 2 future shops, trade one omen for a 40 essence discount at Shop sites.",
      costs: [cost("essence", 15)],
      effects: [shopPayload({
        kind: "future_shop_trade_hook",
        scope: "future_shops",
        duration: "next 2 future shops",
        amount: 40,
        count: 2,
        siteType: "Shop",
        hook: "trade 1 omen for a 40 essence discount",
      })],
      cost: 15,
      effect: 155,
    }),
  ];
}

function dreamwellPayload(args: {
  kind: string;
  scope: "next_battle" | "battle_window" | "future_dreamwell";
  duration: string;
  amount?: number;
  cardRole?: "positive" | "penalty" | "upgrade";
  timing?: string;
}): Record<string, unknown> {
  return {
    kind: "dreamwell_modifier",
    dreamwellOperationKind: args.kind,
    dreamwellScope: args.scope,
    duration: args.duration,
    timing: args.timing ?? args.duration,
    ...(args.amount !== undefined ? { amount: args.amount } : {}),
    ...(args.cardRole ? { cardRole: args.cardRole } : {}),
  };
}

function dreamwellWindowOptions(): JourneyOption[] {
  return [
    option({
      number: 1,
      text: "In the next battle, your first Dreamwell draw produces 1 additional energy.",
      effects: [dreamwellPayload({ kind: "first_draw_energy", scope: "next_battle", duration: "next battle", amount: 1 })],
      effect: 135,
    }),
    option({
      number: 2,
      text: "For the next 3 battles, add one positive Dreamwell card and upgrade the next Dreamwell card you draw.",
      effects: [dreamwellPayload({
        kind: "positive_card_and_upgrade",
        scope: "battle_window",
        duration: BATTLE_WINDOW_DURATION,
        amount: 1,
        cardRole: "positive",
      })],
      effect: 145,
    }),
    option({
      number: 3,
      text: "After next battle, add one delayed positive Dreamwell card to the following battle.",
      effects: [dreamwellPayload({
        kind: "delayed_positive_card",
        scope: "future_dreamwell",
        duration: "following battle",
        cardRole: "positive",
        timing: "after next battle",
      })],
      effect: 125,
      uncertainty: -8,
    }),
    option({
      number: 4,
      text: "Gain 220 essence. For the next 3 battles, the Dreamwell includes one penalty card.",
      effects: [gainEssence(220)],
      burdens: [dreamwellPayload({
        kind: "penalty_card",
        scope: "battle_window",
        duration: BATTLE_WINDOW_DURATION,
        cardRole: "penalty",
      })],
      effect: 220,
      burden: -75,
    }),
  ];
}

function statusPayload(args: {
  kind: string;
  statusName: string;
  statusScope: "quest" | "battle" | "shop" | "dreamwell" | "reward";
  duration: "one_time" | "next_battle" | "next_3_battles" | "persistent";
  ruleMutationKind: string;
  polarity?: "positive" | "negative" | "neutral";
  amount?: number;
  replacement?: string;
  exactDeckSize?: number;
  rerollOmenCap?: number;
  cappedAction?: "reroll";
  dreamwellRuleKind?: "first_draw_energy";
  prohibitionKind?: "deck_cut_floor";
  prohibitedAction?: "voluntary_deck_cut";
  deckCutFloor?: number;
  affectedPlayer?: "you" | "opponent" | "both_players";
}): Record<string, unknown> {
  return {
    kind: args.kind,
    statusName: args.statusName,
    statusScope: args.statusScope,
    duration: args.duration,
    ruleMutationKind: args.ruleMutationKind,
    polarity: args.polarity ?? "positive",
    timing: args.duration === "one_time" || args.duration === "persistent" ? "immediate" : args.duration,
    ...(args.amount !== undefined ? { amount: args.amount } : {}),
    ...(args.replacement ? { replacement: args.replacement } : {}),
    ...(args.exactDeckSize !== undefined ? { exactDeckSize: args.exactDeckSize } : {}),
    ...(args.rerollOmenCap !== undefined ? { rerollOmenCap: args.rerollOmenCap } : {}),
    ...(args.cappedAction ? { cappedAction: args.cappedAction } : {}),
    ...(args.dreamwellRuleKind ? { dreamwellRuleKind: args.dreamwellRuleKind } : {}),
    ...(args.prohibitionKind ? { prohibitionKind: args.prohibitionKind } : {}),
    ...(args.prohibitedAction ? { prohibitedAction: args.prohibitedAction } : {}),
    ...(args.deckCutFloor !== undefined ? { deckCutFloor: args.deckCutFloor } : {}),
    ...(args.affectedPlayer ? { affectedPlayer: args.affectedPlayer } : {}),
  };
}

function statusRewardReplacementOptions(): JourneyOption[] {
  return [
    option({
      number: 1,
      text: "Gain Second Chance once: replace the next no-reward result with 120 essence.",
      effects: [statusPayload({
        kind: "status_reward_replacement",
        statusName: "Second Chance",
        statusScope: "reward",
        duration: "one_time",
        ruleMutationKind: "reward_replacement",
        replacement: "120 essence",
      })],
      effect: 135,
    }),
    option({
      number: 2,
      text: "For the next 3 battles, both players draw 1 additional card in their opening hand and your first Dreamwell draw produces 1 additional energy.",
      effects: [
        statusPayload({
          kind: "status_battle_rule",
          statusName: "Shared Opening",
          statusScope: "battle",
          duration: "next_3_battles",
          ruleMutationKind: "both_player_battle_rule",
          affectedPlayer: "both_players",
        }),
        statusPayload({
          kind: "status_dreamwell_rule",
          statusName: "Brighter First Draw",
          statusScope: "dreamwell",
          duration: "next_3_battles",
          ruleMutationKind: "dreamwell_rule",
          dreamwellRuleKind: "first_draw_energy",
          amount: 1,
          affectedPlayer: "you",
        }),
      ],
      effect: 125,
    }),
    option({
      number: 3,
      text: "Gain a persistent shop treaty: future shops cannot charge more than 1 omen for rerolls.",
      effects: [statusPayload({
        kind: "status_shop_rule",
        statusName: "Shop Treaty",
        statusScope: "shop",
        duration: "persistent",
        ruleMutationKind: "shop_rule",
        cappedAction: "reroll",
        rerollOmenCap: 1,
      })],
      effect: 145,
    }),
    option({
      number: 4,
      text: "Set your quest deck size requirement to exactly 30 cards and prohibit voluntary deck cuts below it.",
      effects: [statusPayload({
        kind: "status_structural_constraint",
        statusName: "Exact Deck",
        statusScope: "quest",
        duration: "persistent",
        ruleMutationKind: "deck_size_constraint",
        exactDeckSize: 30,
        prohibitionKind: "deck_cut_floor",
        prohibitedAction: "voluntary_deck_cut",
        deckCutFloor: 30,
      })],
      effect: 130,
    }),
  ];
}

function hookTrigger(args: {
  triggerKind:
    | "battle"
    | "victory"
    | "each_battle"
    | "site_visit"
    | "named_card_play"
    | "dreamsign_trigger"
    | "card_added"
    | "essence_payment"
    | "future_shop"
    | "future_dream_journey";
  label: string;
  count?: number;
  siteType?: string;
  card?: CardContent;
  dreamsign?: DreamsignContent;
  amount?: number;
}): Record<string, unknown> {
  return {
    triggerKind: args.triggerKind,
    label: args.label,
    ...(args.count !== undefined ? { count: args.count } : {}),
    ...(args.siteType ? { siteType: args.siteType } : {}),
    ...(args.card ? { cardId: args.card.id, cardName: args.card.name } : {}),
    ...(args.dreamsign ? { dreamsignId: args.dreamsign.id, dreamsignName: args.dreamsign.name } : {}),
    ...(args.amount !== undefined ? { amount: args.amount } : {}),
  };
}

function boundedDuration(
  durationKind: "battle_count" | "dreamscape_count" | "shop_count" | "journey_count" | "until_trigger",
  label: string,
  count?: number,
): Record<string, unknown> {
  return {
    durationKind,
    label,
    ...(count !== undefined ? { count } : {}),
  };
}

function expiration(
  policyKind: "forfeit_reward" | "resolve_partial" | "pay_cost" | "return_unchanged" | "discard_obligation",
  label: string,
): Record<string, unknown> {
  return { policyKind, label };
}

function hookVisibility(
  outcomeVisibility: "visible" | "hidden_until_resolution" | "debug_only",
  disclosure: string,
): Record<string, unknown> {
  return { outcomeVisibility, disclosure };
}

function controlledScene(
  sceneKind: "reward" | "cost" | "transformation" | "trade" | "return",
  label: string,
): Record<string, unknown> {
  return { sceneKind, label };
}

function delayedHookContract(args: {
  hookId: string;
  optionNumber: number;
  triggerSelector: Record<string, unknown>;
  trackedCondition: string;
  resolution: string;
  expiration: Record<string, unknown>;
  duration: Record<string, unknown>;
  controlledScene: Record<string, unknown>;
  visibilityPolicy?: Record<string, unknown>;
  reward: unknown | unknown[];
  hookBudgetCost?: number;
}): Record<string, unknown> {
  return {
    kind: "delayed_hook_contract",
    hookId: args.hookId,
    optionNumber: args.optionNumber,
    trigger: String(args.triggerSelector.label ?? "committed trigger").toLowerCase(),
    triggerSelector: args.triggerSelector,
    trackedCondition: args.trackedCondition,
    resolution: args.resolution,
    expiration: args.expiration,
    duration: args.duration,
    controlledScene: args.controlledScene,
    visibilityPolicy: args.visibilityPolicy ?? hookVisibility("visible", "The committed outcome is shown before choosing."),
    reward: args.reward,
    hookBudgetCost: args.hookBudgetCost ?? 0,
  };
}

function delayedTriggerMatrixOptions(
  context: JourneyContext,
  drawContext: DrawContext,
): JourneyOption[] {
  const cards = catalogRewardCards(context, drawContext);
  const cardA = cards[0] ?? context.content.cards[0]!;
  const cardB = cards[1] ?? cardA;
  const dreamsigns = selectedDreamsignTargets(context, drawContext);
  const dreamsign = dreamsigns[0] ?? context.content.dreamsigns[0]!;
  const battleHooks = [
    delayedHookContract({
      hookId: "hook-battle",
      optionNumber: 1,
      triggerSelector: hookTrigger({ triggerKind: "battle", label: "after next battle", count: 1 }),
      trackedCondition: "Track completion of the next battle.",
      resolution: "When the battle ends, gain 90 essence.",
      expiration: expiration("forfeit_reward", "If no battle occurs within 2 dreamscapes, discard this hook with no reward."),
      duration: boundedDuration("dreamscape_count", "within 2 dreamscapes", 2),
      controlledScene: controlledScene("reward", "gain 90 essence"),
      reward: gainEssence(90),
      hookBudgetCost: 1,
    }),
    delayedHookContract({
      hookId: "hook-victory",
      optionNumber: 1,
      triggerSelector: hookTrigger({ triggerKind: "victory", label: "after next victory", count: 1 }),
      trackedCondition: "Track the next won battle.",
      resolution: "On victory, gain 1 omen.",
      expiration: expiration("forfeit_reward", "If the next 2 battles are not victories, discard this hook."),
      duration: boundedDuration("battle_count", "next 2 battles", 2),
      controlledScene: controlledScene("reward", "gain 1 omen"),
      reward: gainOmen(1),
    }),
    delayedHookContract({
      hookId: "hook-each-battle",
      optionNumber: 1,
      triggerSelector: hookTrigger({ triggerKind: "each_battle", label: "each of the next 2 battles", count: 2 }),
      trackedCondition: "Track each completed battle in a 2-battle window.",
      resolution: "After the second tracked battle, draft 1 of 4 cards.",
      expiration: expiration("resolve_partial", "If only one battle occurs within 2 dreamscapes, gain 40 essence instead."),
      duration: boundedDuration("battle_count", "next 2 battles", 2),
      controlledScene: controlledScene("reward", "draft 1 of 4 cards"),
      reward: draftCards(GENERIC_CARD_DRAFT_PROFILE),
    }),
    delayedHookContract({
      hookId: "hook-site-visit",
      optionNumber: 1,
      triggerSelector: hookTrigger({ triggerKind: "site_visit", label: "when you visit a Shop site", siteType: "Shop" }),
      trackedCondition: "Track the next Shop site visit.",
      resolution: "At that site, trade this hook for a 45 essence discount.",
      expiration: expiration("discard_obligation", "If no Shop appears within 2 dreamscapes, discard the trade hook."),
      duration: boundedDuration("dreamscape_count", "within 2 dreamscapes", 2),
      controlledScene: controlledScene("trade", "45 essence Shop discount"),
      reward: shopPayload({ kind: "future_shop_trade_hook", scope: "future_shops", duration: "next Shop site", amount: 45, count: 1, siteType: "Shop", hook: "spend this hook for a 45 essence discount" }),
    }),
  ];
  const objectHooks = [
    delayedHookContract({
      hookId: "hook-named-card-play",
      optionNumber: 2,
      triggerSelector: hookTrigger({ triggerKind: "named_card_play", label: `when you play ${cardA.name}`, card: cardA }),
      trackedCondition: `Track the next time {${cardA.name}} is played.`,
      resolution: `When played, transform it into {${cardB.name}} after the battle.`,
      expiration: expiration("return_unchanged", "If it is not played in the next 3 battles, keep the card unchanged."),
      duration: boundedDuration("battle_count", "next 3 battles", 3),
      controlledScene: controlledScene("transformation", `${cardA.name} becomes ${cardB.name}`),
      reward: namedCardPayload({ kind: "card_transform", target: cardA, result: cardB, source: "catalog", extra: { timing: "after named card play" } }, context),
      hookBudgetCost: 1,
    }),
    delayedHookContract({
      hookId: "hook-dreamsign-trigger",
      optionNumber: 2,
      triggerSelector: hookTrigger({ triggerKind: "dreamsign_trigger", label: `when ${dreamsign.name} triggers`, dreamsign }),
      trackedCondition: `Track the next {${dreamsign.name}} trigger.`,
      resolution: "When it triggers, gain 120 essence.",
      expiration: expiration("forfeit_reward", "If the Dreamsign does not trigger within 3 battles, gain nothing."),
      duration: boundedDuration("battle_count", "next 3 battles", 3),
      controlledScene: controlledScene("reward", "gain 120 essence"),
      reward: gainEssence(120),
    }),
    delayedHookContract({
      hookId: "hook-card-added",
      optionNumber: 2,
      triggerSelector: hookTrigger({ triggerKind: "card_added", label: `when ${cardB.name} is added`, card: cardB }),
      trackedCondition: `Track adding {${cardB.name}} to your deck.`,
      resolution: "When added, gain a temporary copy for the next battle.",
      expiration: expiration("forfeit_reward", "If the card is not added before the next Dream Journey, discard the copy."),
      duration: boundedDuration("journey_count", "before the next Dream Journey", 1),
      controlledScene: controlledScene("reward", `temporary copy of ${cardB.name}`),
      reward: namedCardPayload({ kind: "card_temporary_copy", target: cardB, source: "catalog", extra: { duration: "next battle", temporary: true } }, context),
    }),
  ];
  const economyHooks = [
    delayedHookContract({
      hookId: "hook-essence-payment",
      optionNumber: 3,
      triggerSelector: hookTrigger({ triggerKind: "essence_payment", label: "when you next pay at least 40 essence", amount: 40 }),
      trackedCondition: "Track the next payment of 40 or more essence.",
      resolution: "After paying, refund 20 essence and gain 1 omen.",
      expiration: expiration("forfeit_reward", "If no qualifying payment happens within 2 dreamscapes, discard the refund."),
      duration: boundedDuration("dreamscape_count", "within 2 dreamscapes", 2),
      controlledScene: controlledScene("reward", "refund 20 essence and gain 1 omen"),
      visibilityPolicy: hookVisibility("hidden_until_resolution", "The refund amount is precommitted in JSON/debug and summarized before choosing."),
      reward: [gainEssence(20), gainOmen(1)],
      hookBudgetCost: 1,
    }),
    delayedHookContract({
      hookId: "hook-future-shop",
      optionNumber: 3,
      triggerSelector: hookTrigger({ triggerKind: "future_shop", label: "at the next future shop", count: 1 }),
      trackedCondition: "Track the next future Shop site.",
      resolution: "At that shop, trade 1 omen for an 80 essence discount.",
      expiration: expiration("discard_obligation", "If no future shop appears within 2 dreamscapes, discard the trade."),
      duration: boundedDuration("shop_count", "next future shop", 1),
      controlledScene: controlledScene("trade", "trade 1 omen for an 80 essence discount"),
      reward: shopPayload({ kind: "future_shop_trade_hook", scope: "future_shops", duration: "next future shop", amount: 80, count: 1, siteType: "Shop", hook: "trade 1 omen for an 80 essence discount" }),
    }),
    delayedHookContract({
      hookId: "hook-future-dream-journey",
      optionNumber: 3,
      triggerSelector: hookTrigger({ triggerKind: "future_dream_journey", label: "at the next Dream Journey site", count: 1 }),
      trackedCondition: "Track the next Dream Journey site you enter.",
      resolution: "The next Dream Journey starts with 1 extra option.",
      expiration: expiration("discard_obligation", "If no Dream Journey site appears within 2 dreamscapes, discard this hook."),
      duration: boundedDuration("journey_count", "next Dream Journey site", 1),
      controlledScene: controlledScene("reward", "next Dream Journey has 1 extra option"),
      reward: statusPayload({
        kind: "status_reward_replacement",
        statusName: "Widened Journey",
        statusScope: "quest",
        duration: "one_time",
        ruleMutationKind: "reward_replacement",
        replacement: "one extra Dream Journey option",
      }),
    }),
  ];

  return [
    option({
      number: 1,
      text: "Track the next battle, next victory, each of the next 2 battles, and the next Shop visit. Resolve into essence, omens, a card draft, or a Shop trade; any expired hook forfeits, resolves partial, or is discarded as stated.",
      triggers: battleHooks,
      effect: 150,
      uncertainty: -10,
    }),
    option({
      number: 2,
      text: `Track a {${cardA.name}} play, a {${dreamsign.name}} trigger, and adding {${cardB.name}}. Resolve into a transformation, essence, or a temporary card; expiration leaves the object unchanged or forfeits the reward.`,
      targets: [
        target("card", `${cardA.name} in catalog`, { source: "catalog", ids: [cardA.id], names: [cardA.name] }),
        target("card", `${cardB.name} in catalog`, { source: "catalog", ids: [cardB.id], names: [cardB.name] }),
        dreamsignExactTarget(dreamsign, "pool"),
      ],
      triggers: objectHooks,
      effect: 145,
      uncertainty: -12,
    }),
    option({
      number: 3,
      text: "Track an essence payment, the next future shop, and the next Dream Journey site. Resolve into a refund, an omen-for-discount trade, or one extra future option; hidden refund details are disclosed in JSON/debug and expire after the bounded window.",
      triggers: economyHooks,
      effect: 155,
      uncertainty: -15,
    }),
  ];
}

function pairedReturnContract(args: {
  pairedReturnId: string;
  optionNumber: number;
  anchor: string;
  created: Record<string, unknown>;
  returnScene: Record<string, unknown>;
  visibilityPolicy?: Record<string, unknown>;
  reward: unknown | unknown[];
}): Record<string, unknown> {
  const returnScene = args.returnScene;

  return {
    kind: "paired_return_contract",
    pairedReturnId: args.pairedReturnId,
    hookId: args.pairedReturnId,
    optionNumber: args.optionNumber,
    anchor: args.anchor,
    created: args.created,
    returnScene,
    trigger: String((returnScene.triggerSelector as Record<string, unknown> | undefined)?.label ?? "committed return").toLowerCase(),
    triggerSelector: returnScene.triggerSelector,
    trackedCondition: `Track return scene for ${args.anchor}.`,
    resolution: typeof returnScene.resolution === "string" ? returnScene.resolution : `Resolve ${args.anchor}.`,
    expiration: returnScene.expiration,
    duration: returnScene.duration,
    controlledScene: controlledScene("return", args.anchor),
    visibilityPolicy: args.visibilityPolicy ?? hookVisibility("visible", "The return scene is shown before choosing."),
    reward: args.reward,
    hookBudgetCost: 1,
  };
}

function pairedReturnSealBorrowTradeOptions(
  context: JourneyContext,
  drawContext: DrawContext,
): JourneyOption[] {
  const cards = catalogRewardCards(context, drawContext);
  const sealedCard = cards[0] ?? context.content.cards[0]!;
  const returnedCard = cards[1] ?? sealedCard;
  const dreamsigns = selectedDreamsignTargets(context, drawContext);
  const borrowedDreamsign = dreamsigns[0] ?? context.content.dreamsigns[0]!;
  const tradeDreamsign = dreamsigns[1] ?? context.content.dreamsigns.find((entry) => entry.id !== borrowedDreamsign.id) ?? borrowedDreamsign;
  const sealedReturn = pairedReturnContract({
    pairedReturnId: "return-sealed-card",
    optionNumber: 1,
    anchor: `${sealedCard.name} sealed bundle`,
    created: {
      referenceKind: "sealed_object",
      referenceId: "sealed-card",
      label: `Seal {${sealedCard.name}} until the next Dream Journey site.`,
      objectKind: "card",
      cardId: sealedCard.id,
      cardName: sealedCard.name,
      statusScope: "quest",
    },
    returnScene: {
      returnSceneKind: "sealed_object_return",
      triggerSelector: hookTrigger({ triggerKind: "future_dream_journey", label: "at the next Dream Journey site", count: 1 }),
      referencesCreatedId: "sealed-card",
      resolution: `Return {${sealedCard.name}} as {${returnedCard.name}} and gain 1 omen.`,
      expiration: expiration("return_unchanged", "If no Dream Journey site appears within 2 dreamscapes, return the sealed card unchanged."),
      duration: boundedDuration("dreamscape_count", "within 2 dreamscapes", 2),
    },
    reward: [
      namedCardPayload({ kind: "card_transform", target: sealedCard, result: returnedCard, source: "catalog", extra: { timing: "at the next Dream Journey site" } }, context),
      gainOmen(1),
    ],
  });
  const borrowedReturn = pairedReturnContract({
    pairedReturnId: "return-borrowed-dreamsign",
    optionNumber: 2,
    anchor: `${borrowedDreamsign.name} borrowed sign`,
    created: {
      referenceKind: "borrowed_object",
      referenceId: "borrowed-dreamsign",
      label: `Borrow {${borrowedDreamsign.name}} for the next 2 battles.`,
      objectKind: "dreamsign",
      dreamsignId: borrowedDreamsign.id,
      dreamsignName: borrowedDreamsign.name,
    },
    returnScene: {
      returnSceneKind: "borrowed_object_return",
      triggerSelector: hookTrigger({ triggerKind: "each_battle", label: "after 2 battles", count: 2 }),
      referencesCreatedId: "borrowed-dreamsign",
      resolution: `Return {${borrowedDreamsign.name}} and pay 1 omen; if paid, gain 90 essence.`,
      expiration: expiration("pay_cost", "If the borrowed sign is not returned after 2 battles, pay 1 omen."),
      duration: boundedDuration("battle_count", "next 2 battles", 2),
    },
    reward: [
      namedDreamsignPayload({
        kind: "dreamsign_temporary_grant",
        dreamsign: borrowedDreamsign,
        source: "pool",
        extra: { temporary: true, duration: "next 2 battles" },
      }, context),
      gainEssence(90),
    ],
  });
  const tradeReturn = pairedReturnContract({
    pairedReturnId: "return-future-trade",
    optionNumber: 2,
    anchor: `${borrowedDreamsign.name} for ${tradeDreamsign.name} trade promise`,
    created: {
      referenceKind: "trade_promise",
      referenceId: "future-dreamsign-trade",
      label: `Promise to trade {${borrowedDreamsign.name}} for {${tradeDreamsign.name}} at the next Shop.`,
      objectKind: "promise",
      dreamsignId: borrowedDreamsign.id,
      dreamsignName: borrowedDreamsign.name,
      cost: { resource: "omens", amount: 1 },
    },
    returnScene: {
      returnSceneKind: "future_trade",
      triggerSelector: hookTrigger({ triggerKind: "future_shop", label: "at the next future shop", count: 1 }),
      referencesCreatedId: "future-dreamsign-trade",
      resolution: `Trade {${borrowedDreamsign.name}} and 1 omen for {${tradeDreamsign.name}}.`,
      expiration: expiration("discard_obligation", "If no future shop appears within 2 dreamscapes, discard the trade promise."),
      duration: boundedDuration("dreamscape_count", "within 2 dreamscapes", 2),
    },
    reward: namedDreamsignPayload({
      kind: "dreamsign_trade_hook",
      dreamsign: borrowedDreamsign,
      source: "pool",
      result: tradeDreamsign,
      resultSource: "pool",
      extra: {
        timing: "at the next future shop",
        obligation: `Trade ${borrowedDreamsign.name} and 1 omen for ${tradeDreamsign.name}`,
        giveDreamsignId: borrowedDreamsign.id,
        giveDreamsignName: borrowedDreamsign.name,
        receiveDreamsignId: tradeDreamsign.id,
        receiveDreamsignName: tradeDreamsign.name,
      },
    }, context),
  });

  return [
    option({
      number: 1,
      text: `Seal {${sealedCard.name}} until the next Dream Journey site. Track that site; return it as {${returnedCard.name}} and gain 1 omen, or return it unchanged if the 2-dreamscape window expires.`,
      targets: [
        target("card", `${sealedCard.name} in catalog`, { source: "catalog", ids: [sealedCard.id], names: [sealedCard.name] }),
        target("card", `${returnedCard.name} in catalog`, { source: "catalog", ids: [returnedCard.id], names: [returnedCard.name] }),
      ],
      triggers: [sealedReturn],
      effect: 145,
      uncertainty: -10,
    }),
    option({
      number: 2,
      text: `Borrow {${borrowedDreamsign.name}} for 2 battles and remember a future trade. Return the borrowed sign after 2 battles for 1 omen and 90 essence; at the next future shop, trade it and 1 omen for {${tradeDreamsign.name}}, or discard the promise if it expires.`,
      costs: [cost("omens", Math.min(1, context.state.quest.resources.omens))],
      targets: [
        dreamsignExactTarget(borrowedDreamsign, "pool"),
        dreamsignExactTarget(tradeDreamsign, "pool"),
      ],
      triggers: [borrowedReturn, tradeReturn],
      cost: Math.abs(valueOmenLoss(Math.min(1, context.state.quest.resources.omens))),
      effect: 155,
      uncertainty: -15,
    }),
  ];
}

function semanticFingerprintFor(args: {
  shapeId: JourneyShapeId;
  stage: JourneyStage;
  options: readonly JourneyOption[];
  tree?: JourneyTree;
  rewardPool?: JourneyRewardPool;
  generatedObjects?: readonly GeneratedObjectDefinition[];
  precommitted: PrecommittedOutcomes;
}): JourneyManifest["debug"]["semanticFingerprint"] {
  const operationContract = (operation: JourneyOperation): Record<string, unknown> => {
    const contract: Record<string, unknown> = { ...operation };
    delete contract.operationId;

    if (Array.isArray(contract.rewardOperations)) {
      contract.rewardOperations = contract.rewardOperations.map(operationContract);
    }

    return contract;
  };
  const optionContract = (journeyOption: JourneyOption): Record<string, unknown> => ({
    number: journeyOption.number,
    pickBehavior: journeyOption.pickBehavior,
    value: {
      cost: journeyOption.costConvertedEssence,
      effect: journeyOption.effectConvertedEssence,
      burden: journeyOption.burdenConvertedEssence,
      uncertainty: journeyOption.uncertaintyConvertedEssence,
      net: journeyOption.netConvertedEssence,
    },
    operations: journeyOption.operations.map(operationContract),
  });
  const contract = {
    algorithm: "semantic-fingerprint:v1",
    shapeId: args.shapeId,
    stage: args.stage,
    options: args.options.map(optionContract),
    tree: args.tree
      ? {
          rootNodeId: args.tree.rootNodeId,
          nodes: args.tree.nodes.map((node) => ({
            id: node.id,
            levelLabel: node.levelLabel,
            branches: node.branches.map((branch) => ({
              id: branch.id,
              label: branch.label,
              kind: branch.kind,
              odds: branch.odds,
              nextNodeId: branch.nextNodeId,
              value: {
                cost: branch.costConvertedEssence,
                effect: branch.effectConvertedEssence,
                burden: branch.burdenConvertedEssence,
                uncertainty: branch.uncertaintyConvertedEssence,
                net: branch.netConvertedEssence,
              },
              operations: branch.operations.map(operationContract),
              terminal: branch.terminal
                ? {
                    outcome: branch.terminal.outcome,
                    operations: branch.terminal.operations.map(operationContract),
                  }
                : undefined,
            })),
          })),
        }
      : undefined,
    rewardPool: args.rewardPool
      ? {
          replacement: args.rewardPool.replacement,
          operations: args.rewardPool.operations.map(operationContract),
        }
      : undefined,
    generatedObjects: (args.generatedObjects ?? []).map((generatedObject) => ({
      generatedObjectKind: generatedObject.generatedObjectKind,
      generatedObjectId: generatedObject.generatedObjectId,
      name: generatedObject.name,
      rulesText: generatedObject.rulesText,
      valueEstimate: generatedObject.valueEstimate,
    })),
    precommitted: {
      operations: (args.precommitted.operations ?? []).map(operationContract),
    },
  };
  const components = [
    `shape:${args.shapeId}`,
    `stage:${args.stage}`,
    ...contract.options.map((journeyOption) =>
      `option:${journeyOption.number}:${sha256Hex(stableStringify(journeyOption)).slice(0, 16)}`
    ),
    ...(contract.tree?.nodes.flatMap((node) =>
      node.branches.map((branch) =>
        `tree:${node.id}:${branch.id}:${sha256Hex(stableStringify(branch)).slice(0, 16)}`
      )
    ) ?? []),
    ...(contract.rewardPool
      ? [`reward-pool:${sha256Hex(stableStringify(contract.rewardPool)).slice(0, 16)}`]
      : []),
    ...(contract.generatedObjects.length > 0
      ? [`generated-objects:${sha256Hex(stableStringify(contract.generatedObjects)).slice(0, 16)}`]
      : []),
    ...(contract.precommitted.operations.length > 0
      ? [`precommitted:${sha256Hex(stableStringify(contract.precommitted)).slice(0, 16)}`]
      : []),
  ];
  const value = sha256Hex(stableStringify(contract)).slice(0, 16);

  return {
    algorithm: "semantic-fingerprint:v1",
    value,
    components,
  };
}

function completeDecisionTreeRewardPool(
  tree: JourneyTree,
  existingPool: JourneyRewardPool | undefined,
): JourneyRewardPool | undefined {
  if (existingPool) {
    return existingPool;
  }

  const rewards = tree.nodes.flatMap((node) =>
    node.branches.flatMap((branch) => [
      ...branch.effects,
      ...(branch.terminal?.effects ?? []),
    ])
  );

  if (rewards.length === 0) {
    return undefined;
  }

  const pool = {
    summary: "Complete decision-tree reward pool: all branch rewards are visible before choosing.",
    replacement: "without_replacement" as const,
    operations: [],
    rewards,
  };

  return {
    ...pool,
    operations: adaptRewardPoolOperations(pool),
  };
}

function completeDecisionTreePrecommit(
  shapeId: JourneyShapeId,
  tree: JourneyTree,
): RandomPrecommittedOutcome {
  const branches = tree.nodes.flatMap((node) => node.branches);
  const stopBranchIds = branches
    .filter((branch) =>
      branch.label === "Stop" ||
      branch.terminal?.outcome === "leave" ||
      branch.terminal?.outcome === "end"
    )
    .map((branch) => branch.id);
  const failureBranchIds = branches
    .filter((branch) => branch.terminal?.outcome === "failure")
    .map((branch) => branch.id);
  const rewardBranchIds = branches
    .filter((branch) =>
      branch.effectConvertedEssence > 0 ||
      branch.effects.length > 0 ||
      (branch.terminal?.effects.length ?? 0) > 0
    )
    .map((branch) => branch.id);
  const randomBranches = branches.filter((branch) => branch.odds);
  const averageExpectedValue = randomBranches.length > 0
    ? Math.round(randomBranches.reduce((total, branch) => {
        const percent = branch.odds?.percent ?? 100;

        return total + branch.netConvertedEssence * (percent / 100);
      }, 0) / randomBranches.length)
    : undefined;

  return {
    kind: "complete_decision_tree",
    motif: shapeId,
    nodes: tree.nodes.map((node) => ({
      nodeId: node.id,
      levelLabel: node.levelLabel,
      branches: node.branches.map((branch) => ({
        branchId: branch.id,
        label: branch.label,
        kind: branch.kind,
        ...(branch.odds ? { odds: branch.odds } : {}),
        ...(branch.nextNodeId ? { nextNodeId: branch.nextNodeId } : {}),
        ...(branch.terminal ? { terminalOutcome: branch.terminal.outcome } : {}),
        operationCount: branch.operations.length + (branch.terminal?.operations.length ?? 0),
      })),
    })),
    stopBranchIds,
    failureBranchIds,
    rewardBranchIds,
    visibilityPolicy: randomVisibility(
      "visible",
      "The complete decision tree, stop options, failure terminals, odds, and reward branches are visible before choosing.",
      true,
    ),
    ...(averageExpectedValue !== undefined ? { expectedConvertedEssence: averageExpectedValue } : {}),
    riskPremiumConvertedEssence: failureBranchIds.length > 0 ? -20 : 0,
  };
}

function withCompleteDecisionTreePayload(
  shapeId: JourneyShapeId,
  filled: {
    options: JourneyOption[];
    tree?: JourneyTree;
    rewardPool?: JourneyRewardPool;
    precommitted: PrecommittedOutcomes;
  },
): {
  options: JourneyOption[];
  tree?: JourneyTree;
  rewardPool?: JourneyRewardPool;
  precommitted: PrecommittedOutcomes;
} {
  if (!filled.tree) {
    return filled;
  }

  const treePrecommit = completeDecisionTreePrecommit(shapeId, filled.tree);

  return {
    ...filled,
    rewardPool: completeDecisionTreeRewardPool(filled.tree, filled.rewardPool),
    precommitted: {
      ...filled.precommitted,
      random: [
        ...(filled.precommitted.random ?? []),
        treePrecommit,
      ],
    },
  };
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

function forcedTimedPayloadPrecommits(
  debugPayload: DebugPayloadSelection | undefined,
  options: readonly JourneyOption[],
): unknown[] {
  if (
    !isShopEconomyPayload(debugPayload) &&
    !isDreamwellWindowPayload(debugPayload) &&
    !isStatusRewardReplacementPayload(debugPayload)
  ) {
    return [];
  }

  const isTimedPayload = (payload: unknown): payload is Record<string, unknown> => {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      return false;
    }

    const timing = (payload as Record<string, unknown>).timing;

    return typeof timing === "string" &&
      (timing.includes("next") ||
        timing.includes("after") ||
        timing.includes("following") ||
        timing.includes("future"));
  };

  return options.flatMap((journeyOption) =>
    [...journeyOption.effects, ...journeyOption.burdens]
      .filter(isTimedPayload)
      .map((payload) => ({
        optionNumber: journeyOption.number,
        trigger: typeof payload.timing === "string" ? payload.timing : "committed trigger",
        reward: payload,
      }))
  );
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

function generatedObjectDuration(label: string, count: number = 3): GeneratedObjectDefinition["duration"] {
  return {
    durationKind: "battle_count",
    count,
    label,
  };
}

function generatedObjectDefinition(kind: GeneratedObjectDefinition["generatedObjectKind"]): GeneratedObjectDefinition {
  const definitions: Record<GeneratedObjectDefinition["generatedObjectKind"], GeneratedObjectDefinition> = {
    card: {
      generatedObjectKind: "card",
      generatedObjectId: "generated-card-rain-lantern",
      name: "Rain Lantern",
      objectType: "Event Card",
      rulesText: "0 energy Event. Fast. Gain 1 omen, then the next card you draft costs 25 less essence.",
      tags: ["journey-only", "card", "event", "fast", "late"],
      references: {
        rules: ["Fast", "omens", "essence", "card"],
      },
      lifetime: "journey_only",
      valueEstimate: {
        convertedEssence: 150,
        confidence: "medium",
        basis: "Fast zero-cost card plus one omen and a bounded draft discount.",
      },
      validation: {
        source: "generated_manifest_local",
        status: "validated",
        ruleIds: ["stable_id", "card_rules_text", "value_estimate", "manifest_local"],
      },
      payload: {
        energyCost: 0,
        cardType: "Event",
        keywords: ["Fast"],
        source: "manifest_generated",
      },
    },
    dreamsign: {
      generatedObjectKind: "dreamsign",
      generatedObjectId: "generated-dreamsign-mirror-moon",
      name: "Mirror Moon",
      objectType: "Dreamsign",
      rulesText: "The next time you gain a Dreamsign, choose one: duplicate it, or gain 90 essence.",
      tags: ["journey-only", "dreamsign", "choice", "late"],
      references: {
        rules: ["dreamsign", "essence"],
      },
      duration: generatedObjectDuration("until the next Dreamsign gain", 3),
      lifetime: "until_returned",
      valueEstimate: {
        convertedEssence: 155,
        confidence: "medium",
        basis: "Comparable to a named Dreamsign with a narrow one-time trigger.",
      },
      validation: {
        source: "generated_manifest_local",
        status: "validated",
        ruleIds: ["stable_id", "dreamsign_rules_text", "duration", "value_estimate", "manifest_local"],
      },
      payload: {
        trigger: "next Dreamsign gain",
        choices: ["duplicate gained Dreamsign", "gain 90 essence"],
        source: "manifest_generated",
      },
    },
    status: {
      generatedObjectKind: "status",
      generatedObjectId: "generated-status-afterimage-oath",
      name: "Afterimage Oath",
      objectType: "Quest Status",
      rulesText: "For the next 3 battles, the first card you purge each battle returns as a temporary copy for that battle.",
      tags: ["journey-only", "status", "battle", "temporary"],
      references: {
        rules: ["battle", "card"],
      },
      duration: generatedObjectDuration("next 3 battles", 3),
      lifetime: "temporary",
      valueEstimate: {
        convertedEssence: 135,
        confidence: "medium",
        basis: "Temporary battle rule with bounded card-copy upside.",
      },
      validation: {
        source: "generated_manifest_local",
        status: "validated",
        ruleIds: ["stable_id", "status_scope", "duration", "value_estimate", "manifest_local"],
      },
      payload: {
        statusScope: "battle",
        affectedObject: "card",
        source: "manifest_generated",
      },
    },
    transfiguration: {
      generatedObjectKind: "transfiguration",
      generatedObjectId: "generated-transfiguration-glass",
      name: "Glass Transfiguration",
      objectType: "Transfiguration",
      rulesText: "A Glass card gains Fast and Reclaim 1. When it dissolves, gain 60 essence.",
      tags: ["journey-only", "transfiguration", "card", "fast", "reclaim"],
      references: {
        rules: ["Fast", "Reclaim", "essence", "card", "transfiguration"],
      },
      lifetime: "journey_only",
      valueEstimate: {
        convertedEssence: 145,
        confidence: "medium",
        basis: "Slightly above Viridian due to Fast, Reclaim, and a conditional essence payout.",
      },
      validation: {
        source: "generated_manifest_local",
        status: "validated",
        ruleIds: ["stable_id", "transfiguration_rules_text", "value_estimate", "manifest_local"],
      },
      payload: {
        generatedTransfigurationName: "Glass",
        keywords: ["Fast", "Reclaim"],
        source: "manifest_generated",
      },
    },
  };

  return definitions[kind];
}

function generatedObjectPayload(args: {
  kind: "generated_object_create" | "generated_object_grant" | "generated_object_transform" | "generated_object_temporary_grant" | "generated_object_return" | "generated_object_trade";
  generatedObject: GeneratedObjectDefinition;
  operation: string;
  duration?: string;
  extra?: Record<string, unknown>;
}) {
  return {
    kind: args.kind,
    generatedObjectOperationKind: args.operation,
    generatedObjectId: args.generatedObject.generatedObjectId,
    generatedObjectKind: args.generatedObject.generatedObjectKind,
    generatedObjectName: args.generatedObject.name,
    generatedObjectReferenceKind: "definition",
    rulesText: args.generatedObject.rulesText,
    timing: "immediate",
    source: "manifest_generated",
    ...(args.duration ? { duration: args.duration } : {}),
    ...(args.extra ?? {}),
  };
}

function generatedObjectOptions(generatedObject: GeneratedObjectDefinition): JourneyOption[] {
  const compactRules = `${generatedObject.name}: ${generatedObject.rulesText}`;
  const grant = generatedObjectPayload({
    kind: "generated_object_grant",
    generatedObject,
    operation: "grant",
  });
  const create = generatedObjectPayload({
    kind: "generated_object_create",
    generatedObject,
    operation: "create",
  });
  const transform = generatedObjectPayload({
    kind: "generated_object_transform",
    generatedObject,
    operation: "transform",
    extra: { transformIntoGeneratedObjectId: generatedObject.generatedObjectId },
  });
  const temporary = generatedObjectPayload({
    kind: "generated_object_temporary_grant",
    generatedObject,
    operation: "temporary_grant",
    duration: generatedObject.duration?.label ?? "next 3 battles",
    extra: { temporary: true },
  });
  const returned = generatedObjectPayload({
    kind: "generated_object_return",
    generatedObject,
    operation: "return",
    duration: "at the next Dream Journey site",
  });
  const trade = generatedObjectPayload({
    kind: "generated_object_trade",
    generatedObject,
    operation: "trade",
    extra: { tradeFor: "120 essence" },
  });
  const value = generatedObject.valueEstimate.convertedEssence;

  return [
    option({
      number: 1,
      text: `Create and gain {${generatedObject.name}}. ${compactRules}`,
      effects: [create, grant],
      effect: value,
    }),
    option({
      number: 2,
      text: `Transform a chosen eligible object into {${generatedObject.name}}. ${compactRules}`,
      effects: [transform],
      effect: Math.max(120, value - 10),
      uncertainty: -10,
    }),
    option({
      number: 3,
      text: `Gain {${generatedObject.name}} temporarily, then return it at the next Dream Journey site or trade it for 120 essence after using it once. ${compactRules}`,
      effects: [temporary, trade],
      triggers: [returned],
      effect: Math.max(105, value - 25),
      uncertainty: -12,
    }),
  ];
}

export function buildConservativeJourneyForShape(args: BuildArgs): JourneyManifest {
  const selectedCards = selectedCardTargets(args.context, args.drawContext).slice(0, 3);
  const selectedDreamsigns = selectedDreamsignTargets(args.context, args.drawContext).slice(0, 3);
  const shape = getShapeDefinition(args.shapeId);
  const baseFilled = fillOptions(args.shapeId, args.context, args.drawContext);
  const filled = isCompleteDecisionTreePayload(args.debugPayload)
    ? withCompleteDecisionTreePayload(args.shapeId, baseFilled)
    : baseFilled;
  const generatedKind = generatedObjectVariant(args.debugPayload) ?? naturalGeneratedObjectKind(args);
  const generatedObjects = generatedKind ? [generatedObjectDefinition(generatedKind)] : [];
  const randomRevealRollWager = isRandomRevealRollWagerPayload(args.debugPayload)
    ? randomRevealRollWagerFill(args.context, args.drawContext)
    : undefined;
  const filledOptions = isNamedCardOperationMenuPayload(args.debugPayload)
    ? namedCardOperationOptions(args.context, args.drawContext)
    : isStarterCleanupReplacementPayload(args.debugPayload)
      ? starterCleanupReplacementOptions(args.context, args.drawContext)
      : isNamedDreamsignShopRowPayload(args.debugPayload)
        ? namedDreamsignShopRowOptions(args.context, args.drawContext)
        : isDreamsignTransformDuplicatePoolPayload(args.debugPayload)
          ? dreamsignTransformDuplicatePoolOptions(args.context, args.drawContext)
          : isBaneGainPurgeTransformPayload(args.debugPayload)
            ? baneGainPurgeTransformOptions(args.context, args.drawContext)
            : isResourceEdgeCasePayload(args.debugPayload)
              ? resourceEdgeCaseOptions(args.context)
              : isRouteEditsPayload(args.debugPayload)
                ? routeEditOptions()
                : isShopEconomyPayload(args.debugPayload)
                  ? shopEconomyOptions()
                  : isDreamwellWindowPayload(args.debugPayload)
                    ? dreamwellWindowOptions()
                    : isStatusRewardReplacementPayload(args.debugPayload)
                      ? statusRewardReplacementOptions()
                      : isDelayedTriggerMatrixPayload(args.debugPayload)
                        ? delayedTriggerMatrixOptions(args.context, args.drawContext)
                        : isPairedReturnSealBorrowTradePayload(args.debugPayload)
                          ? pairedReturnSealBorrowTradeOptions(args.context, args.drawContext)
                          : generatedObjects[0]
                            ? generatedObjectOptions(generatedObjects[0])
                            : randomRevealRollWager
                              ? randomRevealRollWager.options
                              : filled.options.slice(0, shape.rootOptionCount.max);
  const options = isResourceEdgeCasePayload(args.debugPayload)
    ? withResourceEdgeCaseValueBands(filledOptions)
    : filledOptions;
  const basePrecommitted = isPairedReturnSealBorrowTradePayload(args.debugPayload)
    ? {}
    : randomRevealRollWager
      ? randomRevealRollWager.precommitted
    : filled.precommitted;
  const optionRouteEffects = options.flatMap((journeyOption) => journeyOption.routeEffects);
  const cardDelayedPrecommits = isNamedCardOperationMenuPayload(args.debugPayload)
    ? options.flatMap((journeyOption) =>
        journeyOption.effects
          .filter((effect): effect is Record<string, unknown> =>
            typeof effect === "object" &&
            effect !== null &&
            !Array.isArray(effect) &&
            "kind" in effect &&
            effect.kind === "card_delayed_transformation"
          )
          .map((effect) => ({
            optionNumber: journeyOption.number,
            trigger: typeof effect.trigger === "string" ? effect.trigger : "after next victory",
            reward: effect,
          }))
      )
    : [];
  const dreamsignDelayedPrecommits = isDreamsignTransformDuplicatePoolPayload(args.debugPayload)
    ? options.flatMap((journeyOption) =>
        journeyOption.effects
          .filter((effect): effect is Record<string, unknown> =>
            typeof effect === "object" &&
            effect !== null &&
            !Array.isArray(effect) &&
            "kind" in effect &&
            effect.kind === "dreamsign_trade_hook"
          )
          .map((effect) => ({
            optionNumber: journeyOption.number,
            trigger: typeof effect.timing === "string" ? effect.timing : "after next battle",
            reward: effect,
          }))
      )
    : [];
  const dreamsignRandomPrecommits = isDreamsignTransformDuplicatePoolPayload(args.debugPayload)
    ? options.flatMap((journeyOption) =>
        journeyOption.effects
          .filter((effect): effect is Record<string, unknown> =>
            typeof effect === "object" &&
            effect !== null &&
            !Array.isArray(effect) &&
            "kind" in effect &&
            effect.kind === "dreamsign_random_reward"
          )
          .map((effect) => ({
            optionNumber: journeyOption.number,
            kind: "dreamsign_random_reward",
            rewardPoolDreamsignIds: effect.rewardPoolDreamsignIds,
            selectedDreamsignId: effect.dreamsignId,
            selectedDreamsignName: effect.dreamsignName,
            odds: effect.odds,
          }))
      )
    : [];
  const baneRandomPrecommits = isBaneGainPurgeTransformPayload(args.debugPayload)
    ? options.flatMap((journeyOption) =>
        journeyOption.effects
          .filter((effect): effect is Record<string, unknown> =>
            typeof effect === "object" &&
            effect !== null &&
            !Array.isArray(effect) &&
            "kind" in effect &&
            effect.kind === "bane_random_purge"
          )
          .map((effect) => ({
            optionNumber: journeyOption.number,
            kind: "bane_random_purge",
            baneName: effect.baneName,
            baneTargetContext: effect.baneTargetContext,
            committedResult: "purged",
          }))
      )
    : [];
  const resourceRandomPrecommits = isResourceEdgeCasePayload(args.debugPayload)
    ? options.flatMap((journeyOption) =>
        journeyOption.effects
          .filter((effect): effect is Record<string, unknown> =>
            typeof effect === "object" &&
            effect !== null &&
            !Array.isArray(effect) &&
            "kind" in effect &&
            effect.kind === "resource_random_range"
          )
          .map((effect) => ({
            optionNumber: journeyOption.number,
            kind: "resource_random_range",
            resource: effect.resource,
            minimum: effect.minimum,
            maximum: effect.maximum,
            committedAmount: effect.amount,
          }))
      )
    : [];
  const delayedPrecommits = [
    ...cardDelayedPrecommits,
    ...dreamsignDelayedPrecommits,
    ...forcedTimedPayloadPrecommits(args.debugPayload, options),
    ...(generatedKind ? options.flatMap((journeyOption) => journeyOption.triggers) : []),
    ...(isDelayedTriggerMatrixPayload(args.debugPayload)
      ? options.flatMap((journeyOption) => journeyOption.triggers)
      : []),
    ...(isPairedReturnSealBorrowTradePayload(args.debugPayload)
      ? options.flatMap((journeyOption) => journeyOption.triggers)
      : []),
  ];
  const precommittedWithCardDelays = delayedPrecommits.length > 0
    ? {
        ...basePrecommitted,
        delayed: [
          ...(basePrecommitted.delayed ?? []),
          ...delayedPrecommits,
        ],
      }
    : basePrecommitted;
  const randomPrecommits = [
    ...dreamsignRandomPrecommits,
    ...baneRandomPrecommits,
    ...resourceRandomPrecommits,
  ];
  const precommittedWithRandom = randomPrecommits.length > 0
    ? {
        ...precommittedWithCardDelays,
        random: [
          ...(precommittedWithCardDelays.random ?? []),
          ...randomPrecommits,
        ],
      }
    : precommittedWithCardDelays;
  const legacyPrecommitted = optionRouteEffects.length > 0 && precommittedWithRandom.routeEdits === undefined
    ? {
        ...precommittedWithRandom,
        routeEdits: optionRouteEffects,
      }
    : precommittedWithRandom;
  const legacyPrecommittedWithPairedReturn = isPairedReturnSealBorrowTradePayload(args.debugPayload)
    ? {
        ...legacyPrecommitted,
        pairedReturn: [
          ...(legacyPrecommitted.pairedReturn ?? []),
          ...options.flatMap((journeyOption) => journeyOption.triggers),
        ],
      }
    : legacyPrecommitted;
  const precommitted = {
    ...legacyPrecommittedWithPairedReturn,
    operations: adaptPrecommittedOperations(legacyPrecommittedWithPairedReturn),
  };
  const optionValues: ValueBreakdown[] = options.map((journeyOption) =>
    evaluateOptionValue(journeyOption, args.context),
  );
  const semanticFingerprint = semanticFingerprintFor({
    shapeId: args.shapeId,
    stage: args.stage,
    options,
    tree: filled.tree,
    rewardPool: filled.rewardPool,
    generatedObjects,
    precommitted,
  });

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
    generatedObjects,
    ...(filled.tree ? { tree: filled.tree } : {}),
    ...(filled.rewardPool ? { rewardPool: filled.rewardPool } : {}),
    precommitted,
    debug: {
      shapeScores: args.shapeScores,
      selectedShapeId: args.shapeId,
      selectedTags: args.selectedTags,
      optionValues,
      repairs: [],
      semanticFingerprint,
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

  const manifestWithTargetResolution = attachTargetResolutionMetadata(
    manifest,
    args.context.content,
    args.context.state.quest,
  );

  return {
    ...manifestWithTargetResolution,
    debug: {
      ...manifestWithTargetResolution.debug,
      semanticFingerprint: semanticFingerprintFor({
        shapeId: manifestWithTargetResolution.shapeId,
        stage: manifestWithTargetResolution.stage,
        options: manifestWithTargetResolution.options,
        tree: manifestWithTargetResolution.tree,
        rewardPool: manifestWithTargetResolution.rewardPool,
        generatedObjects: manifestWithTargetResolution.generatedObjects,
        precommitted: manifestWithTargetResolution.precommitted,
      }),
    },
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
