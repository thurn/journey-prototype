import type { ContentBundle } from "../../content/model.js";
import type { JourneyContext } from "../../quest/context.js";
import {
  drawInt,
  shuffleDeterministic,
  type DrawContext,
} from "../../util/rng.js";
import type { DebugPayloadSelection } from "../debugPayloads.js";
import {
  BANE_NAMES,
  DEFAULT_BANE_NAME,
  resolveCardTargets,
  resolveDreamsignTargets,
  isBaneName,
  type BaneName,
  type CardTargetPredicate,
} from "../effects.js";
import { type TreeBuilderTools } from "./treeBuilders.js";
import type {
  JourneyManifest,
  JourneyOption,
  JourneyStage,
  ManifestReferences,
  PickBehavior,
} from "../manifest.js";
import { adaptJourneyOptionOperations } from "../operationAdapters.js";
import type { JourneyShapeId } from "../shapes.js";
import { symbolsForOption } from "../symbols.js";
import {
  commonEssenceRewardAmount,
  DREAMSIGN_VALUE_CONSTANTS,
  LOSS_CHOICE_VALUE_CONSTANTS,
  TIMING_AND_RANDOMNESS_VALUE_CONSTANTS,
  valueBaneGain,
  valueCardDraft,
  valueDreamsignDraft,
  valueEssenceGain,
  valueOmenGain,
  valueOmenLoss,
  valueRandomCardGain,
} from "../value.js";
import {
  cardExactTarget,
  cardQualityValue,
  namedCardPayload,
  selectContentBackedCard,
} from "./namedCardPayloads.js";
import {
  dreamsignExactTarget,
  namedDreamsignPayload,
  selectContentBackedDreamsign,
} from "./dreamsignPayloads.js";
import { firstRouteEditReward } from "./routeEditCatalog.js";

export type BuildArgs = {
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

export type OptionArgs = {
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

export type FillPlanPayloadRole =
  | "cost"
  | "reward"
  | "burden"
  | "target"
  | "trigger"
  | "route"
  | "random";

export type FillPlanPayloadSpec = {
  role: FillPlanPayloadRole;
  key?: string;
  family?: string;
  payloads: readonly unknown[];
};

export type FillPlanTextPart = {
  source:
    | "cost"
    | "reward"
    | "burden"
    | "operation_payload"
    | "target_metadata"
    | "timing"
    | "random_envelope";
  text: string;
};

export type FillPlanVisibleObject = {
  objectKind:
    | "card"
    | "dreamsign"
    | "bane"
    | "route_site"
    | "generated_object";
  id?: string;
  name?: string;
  source?: string;
};

export type FillPlanTiming = {
  key: string;
  label: string;
  payload?: unknown;
};

export type FillPlanValueEstimate = {
  cost?: number;
  effect?: number;
  burden?: number;
  uncertainty?: number;
};

export type ResolvedShapeFillOption = {
  number: number;
  textParts: readonly FillPlanTextPart[];
  payloadSpecs: readonly FillPlanPayloadSpec[];
  targetSelectors?: readonly unknown[];
  visibleObjects?: readonly FillPlanVisibleObject[];
  costs?: readonly unknown[];
  effects?: readonly unknown[];
  burdens?: readonly unknown[];
  triggers?: readonly unknown[];
  routeEffects?: readonly unknown[];
  timings?: readonly FillPlanTiming[];
  randomEnvelopes?: readonly unknown[];
  valueEstimate: FillPlanValueEstimate;
  pickBehavior?: PickBehavior;
};

export type ResolvedShapeFill = {
  fillKind: string;
  sharedPayloadSpecs?: readonly FillPlanPayloadSpec[];
  options: readonly ResolvedShapeFillOption[];
};

export type SequentialReward = {
  text: string;
  effects: unknown[];
  targets?: unknown[];
  effect: number;
};

export const RESOURCE_EDGE_CASE_VALUE_BANDS = Object.freeze([
  {
    id: "maximum",
    label: "maximum",
    description: "resource reward is evaluated against the current maximum.",
  },
  {
    id: "percentage",
    label: "percentage",
    description:
      "resource reward is expressed as a percentage of a resource pool.",
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

export type RewardSlot = {
  key: string;
  text: string;
  effects: unknown[];
  targets?: unknown[];
  triggers?: unknown[];
  routeEffects?: unknown[];
  effect: number;
  uncertainty?: number;
};

export type CostSlot = {
  key: string;
  prefix: string;
  costs?: unknown[];
  burdens?: unknown[];
  cost?: number;
  burden?: number;
};

export type BaneBurdenSlot = {
  key: string;
  baneName: BaneName;
  prefix: string;
  burdens: [ReturnType<typeof baneBurden>];
  burden: number;
};

export function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
}

export function option(args: OptionArgs): JourneyOption {
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
      (args.effect ?? 0) -
      (args.cost ?? 0) +
      (args.burden ?? 0) +
      (args.uncertainty ?? 0),
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

function renderFillPlanText(parts: readonly FillPlanTextPart[]): string {
  return parts
    .map((part) => part.text.trim())
    .filter((part) => part.length > 0)
    .join(" ");
}

export function optionFromResolvedShapeFill(
  fill: ResolvedShapeFillOption,
): JourneyOption {
  return option({
    number: fill.number,
    text: renderFillPlanText(fill.textParts),
    costs: [...(fill.costs ?? [])],
    effects: [...(fill.effects ?? [])],
    burdens: [...(fill.burdens ?? [])],
    targets: [...(fill.targetSelectors ?? [])],
    triggers: [...(fill.triggers ?? [])],
    routeEffects: [...(fill.routeEffects ?? [])],
    cost: fill.valueEstimate.cost,
    effect: fill.valueEstimate.effect,
    burden: fill.valueEstimate.burden,
    uncertainty: fill.valueEstimate.uncertainty,
    pickBehavior: fill.pickBehavior,
  });
}

export function selectedCardTargets(
  context: JourneyContext,
  drawContext: DrawContext,
) {
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

export function selectedDreamsignTargets(
  context: JourneyContext,
  drawContext: DrawContext,
) {
  const selected = resolveDreamsignTargets(
    context.content,
    context.state.quest,
    {
      source: "pool",
      tideOverlap: "selected",
    },
  );
  const fallback = resolveDreamsignTargets(
    context.content,
    context.state.quest,
    {
      source: "pool",
    },
  );

  return shuffleDeterministic(
    drawContext,
    "targets:dreamsigns",
    selected.length > 0 ? selected : fallback,
  );
}

export const CARD_POOL_TARGET_DESCRIPTION = "eligible draft cards";
export const DREAMSIGN_POOL_TARGET_DESCRIPTION = "eligible Dreamsigns";
export const CARD_DRAFT_CHOICE_COUNT = 4;
export const BATTLE_WINDOW_DURATION = "next 3 battles";

export type CardDraftProfile = {
  label: string;
  targetDescription: string;
  predicate: Omit<CardTargetPredicate, "source">;
};

export const CARD_DRAFT_PROFILES = {
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
  discardTextCards: {
    label: "cards with discard text",
    targetDescription: "draft cards with discard text",
    predicate: { renderedTextIncludes: "discard" },
  },
  abandonCards: {
    label: "Abandon cards",
    targetDescription: "draft cards with Abandon text",
    predicate: { renderedTextIncludes: "Abandon" },
  },
  eventCopyingCards: {
    label: "event-copying cards",
    targetDescription: "draft cards that copy events",
    predicate: { renderedTextIncludes: ["copy", "event"] },
  },
  energyGenerationCards: {
    label: "energy-generation cards",
    targetDescription: "draft cards that generate energy",
    predicate: { renderedTextIncludes: ["Gain", "●"], minAbilityCount: 1 },
  },
  legendaryCards: {
    label: "Legendary cards",
    targetDescription: "Legendary draft cards",
    predicate: { rarity: "Legendary" },
  },
  costOneCards: {
    label: "cost-1 cards",
    targetDescription: "draft cards with cost exactly 1",
    predicate: { energyCost: 1 },
  },
  cheapCards: {
    label: "cards costing 2 or less",
    targetDescription: "draft cards with cost 2 or less",
    predicate: { maxEnergyCost: 2 },
  },
  duplicateCards: {
    label: "duplicate draft-pool cards",
    targetDescription: "draft cards with multiple pool copies",
    predicate: { minCopies: 2 },
  },
  multiAbilityCards: {
    label: "cards with multiple abilities",
    targetDescription: "draft cards with multiple abilities",
    predicate: { hasMultipleAbilities: true },
  },
  starters: {
    label: "Starter cards",
    targetDescription: "Starter cards",
    predicate: { starter: true },
  },
  allEligibleCards: {
    label: "eligible cards",
    targetDescription: CARD_POOL_TARGET_DESCRIPTION,
    predicate: {},
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

export const GENERIC_CARD_DRAFT_PROFILE = {
  label: "cards",
  targetDescription: CARD_POOL_TARGET_DESCRIPTION,
  predicate: {},
} as const satisfies CardDraftProfile;

export const CARD_PREDICATE_CATALOG = CARD_DRAFT_PROFILES;

export function cardDraftPredicate(
  profile: CardDraftProfile,
): CardTargetPredicate {
  return {
    source: "draftPool",
    ...profile.predicate,
  };
}

export function legalCardDraftProfile(
  context: JourneyContext,
  profiles: readonly CardDraftProfile[],
): CardDraftProfile {
  return (
    profiles.find(
      (profile) =>
        resolveCardTargets(
          context.content,
          context.state.quest,
          cardDraftPredicate(profile),
        ).length >= CARD_DRAFT_CHOICE_COUNT,
    ) ?? GENERIC_CARD_DRAFT_PROFILE
  );
}

export function pickLegalCardDraftProfile(
  context: JourneyContext,
  drawContext: DrawContext,
  label: string,
  profiles: readonly CardDraftProfile[],
): CardDraftProfile {
  return legalCardDraftProfile(
    context,
    shuffleDeterministic(drawContext, label, profiles),
  );
}

export function target(
  kind: "card" | "dreamsign",
  description: string,
  predicate: unknown,
) {
  return {
    kind,
    description,
    predicate,
    required: true,
  };
}

export function baneTarget(
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

export function cost(kind: "essence" | "omens", amount: number) {
  return {
    kind,
    amount,
    timing: "immediate",
  };
}

export function gainEssence(amount: number) {
  return {
    kind: "gain_essence",
    amount,
  };
}

export function gainOmen(amount: number) {
  return {
    kind: "gain_omens",
    amount,
  };
}

export function cardDraftText(
  profile: CardDraftProfile,
  takeCount = 1,
  copyCount = 1,
): string {
  const copyText = copyCount > 1
    ? ` and add ${copyCount} copies`
    : "";

  return `Draft ${takeCount} of ${CARD_DRAFT_CHOICE_COUNT} ${profile.label}${copyText}.`;
}

export function dreamsignDraftText(choiceCount: number): string {
  return `Choose 1 of ${choiceCount} Dreamsigns.`;
}

export function chosenCardText(): string {
  return "a chosen card";
}

export function draftCards(
  profile: CardDraftProfile,
  options: {
    takeCount?: number;
    copyCount?: number;
    temporary?: boolean;
  } = {},
) {
  return {
    kind: "card_draft",
    takeCount: options.takeCount ?? 1,
    choiceCount: CARD_DRAFT_CHOICE_COUNT,
    ...(options.copyCount !== undefined ? { copyCount: options.copyCount } : {}),
    ...(options.temporary === true ? { temporary: true } : {}),
    predicate: cardDraftPredicate(profile),
  };
}

export function randomCardGain(
  profile: CardDraftProfile,
  count: number,
  options: {
    source?: "catalog" | "draftPool";
    copyCount?: number;
    temporary?: boolean;
  } = {},
) {
  return {
    kind: "card_gain",
    selection: "hidden_random",
    random: true,
    count,
    source: options.source ?? "catalog",
    ...(options.copyCount !== undefined ? { copyCount: options.copyCount } : {}),
    ...(options.temporary === true ? { temporary: true, duration: BATTLE_WINDOW_DURATION } : {}),
    predicate: {
      source: options.source ?? "catalog",
      ...profile.predicate,
    },
  };
}

export function randomCardGainText(
  profile: CardDraftProfile,
  count: number,
  temporary = false,
): string {
  const countText = count === 1 ? "1" : String(count);
  const temporaryText = temporary ? " temporary" : "";

  return `Gain ${countText}${temporaryText} random ${profile.label}.`;
}

export function dreamsignDraft(choiceCount: number) {
  return {
    kind: "dreamsign_draft",
    choiceCount,
    predicate: { source: "pool", tideOverlap: "selected" },
  };
}

export function pickSequentialVariant<T>(
  drawContext: DrawContext,
  label: string,
  variants: readonly T[],
): T {
  return variants[drawInt(drawContext, label, 0, variants.length - 1)]!;
}

export function sentenceCase(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

export function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

export function payableSequentialCost(
  context: JourneyContext,
  desiredAmount: number,
): number {
  return Math.min(desiredAmount, context.state.quest.resources.essence);
}

export function sequentialReward(
  context: JourneyContext,
  drawContext: DrawContext,
  label: string,
): SequentialReward {
  const cardProfile = legalCardDraftProfile(context, [
    CARD_DRAFT_PROFILES.events,
    CARD_DRAFT_PROFILES.lowCostCharacters,
    CARD_DRAFT_PROFILES.characters,
  ]);
  const cardDraft = draftCards(cardProfile);
  const essenceAmount = pickSequentialVariant(
    drawContext,
    `${label}:essence`,
    [90, 110, 130],
  );
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
      targets: [
        target("card", cardProfile.targetDescription, cardDraft.predicate),
      ],
      effect: valueCardDraft(cardDraft),
    },
  ];

  if (context.state.quest.dreamsignPoolIds.length > 0) {
    const choiceCount = pickSequentialVariant(
      drawContext,
      `${label}:dreamsign-choice`,
      [2, 3],
    );
    const dreamsignReward = dreamsignDraft(choiceCount);

    variants.push({
      text: `${lowerFirst(dreamsignDraftText(choiceCount))}`,
      effects: [dreamsignReward],
      targets: [
        target(
          "dreamsign",
          DREAMSIGN_POOL_TARGET_DESCRIPTION,
          dreamsignReward.predicate,
        ),
      ],
      effect: valueDreamsignDraft(dreamsignReward, context),
    });
  }

  if (context.state.quest.deck.summary.starterCards > 0) {
    variants.push({
      text: "purge up to 1 chosen Starter card.",
      effects: [starterCleanup(1)],
      targets: [
        target("card", "Starter cards in deck", {
          source: "deck",
          starter: true,
        }),
      ],
      effect: 85,
    });
  }

  return pickSequentialVariant(drawContext, label, variants);
}

export function delayedDreamsignDraftValue(
  reward: ReturnType<typeof dreamsignDraft>,
  context: JourneyContext,
  multiplier: number,
): number {
  return Math.round(valueDreamsignDraft(reward, context) * multiplier);
}

export function starterCleanup(count: number) {
  return {
    kind: "starter_cleanup",
    count,
    predicate: { source: "deck", starter: true },
  };
}

export function baneNameText(baneName: BaneName, count: number): string {
  return `${count} ${baneName}${count === 1 ? "" : "s"}`;
}

export function baneBurden(baneName: BaneName, count: number) {
  return {
    kind: "bane_gain",
    baneName,
    count,
  };
}

export function nightmare(count: number) {
  return baneBurden(DEFAULT_BANE_NAME, count);
}

export function baneBurdenSlot(
  drawContext: DrawContext,
  label: string,
  count = 1,
): BaneBurdenSlot {
  const baneName = pickSequentialVariant(
    drawContext,
    `${label}:bane-name`,
    BANE_NAMES,
  );

  return {
    key: "bane",
    baneName,
    prefix: `Gain ${baneNameText(baneName, count)}.`,
    burdens: [baneBurden(baneName, count)],
    burden: valueBaneGain(baneName, count),
  };
}

export function comparableEssenceLossAmount(
  comparisonLosses: readonly number[],
  availableEssence: number,
): number | null {
  const magnitudes = comparisonLosses
    .map((loss) => Math.abs(loss))
    .filter(
      (loss) => loss >= LOSS_CHOICE_VALUE_CONSTANTS.minimumComparableMagnitude,
    )
    .sort((left, right) => left - right);

  if (magnitudes.length === 0) {
    return null;
  }

  const lowest = magnitudes[0]!;
  const highest = magnitudes[magnitudes.length - 1]!;
  const target = Math.round((lowest + highest) / 2 / 5) * 5;
  const payable = Math.min(target, availableEssence);

  return payable >= LOSS_CHOICE_VALUE_CONSTANTS.minimumComparableMagnitude
    ? payable
    : null;
}

function addBaneReference(references: Set<string>, value: unknown): void {
  if (typeof value === "string" && isBaneName(value)) {
    references.add(value);
  }
}

function collectBaneReferencesFromValue(
  value: unknown,
  references: Set<string>,
): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectBaneReferencesFromValue(entry, references));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;

  addBaneReference(references, record.baneName);
  addBaneReference(references, record.newBaneName);

  if (Array.isArray(record.baneNames)) {
    record.baneNames.forEach((entry) => addBaneReference(references, entry));
  }

  if (Array.isArray(record.banes)) {
    record.banes.forEach((entry) => addBaneReference(references, entry));
  }

  if (
    (record.kind === "bane" || record.selectorKind === "bane") &&
    Array.isArray(record.names)
  ) {
    record.names.forEach((entry) => addBaneReference(references, entry));
  }

  Object.values(record).forEach((entry) =>
    collectBaneReferencesFromValue(entry, references),
  );
}

export function collectBaneReferences(
  values: readonly unknown[],
): string[] {
  const references = new Set<string>();

  values.forEach((value) => collectBaneReferencesFromValue(value, references));

  return uniqueSorted([...references]);
}

export function referencesFor(
  content: ContentBundle,
  cardIds: readonly string[],
  dreamsignIds: readonly string[],
  baneReferenceSources: readonly unknown[] = [],
): ManifestReferences {
  const dreamcallerIds = content.dreamcallers.map(
    (dreamcaller) => dreamcaller.id,
  );

  return {
    cardIds: uniqueSorted(cardIds),
    dreamsignIds: uniqueSorted(dreamsignIds),
    dreamcallerIds: uniqueSorted(dreamcallerIds),
    baneNames: collectBaneReferences(baneReferenceSources),
  };
}

export function renumberOptions(
  options: readonly JourneyOption[],
): JourneyOption[] {
  return options.map((item, index) => ({
    ...item,
    number: index + 1,
  }));
}

export function commonPositiveOptions(
  context: JourneyContext,
  drawContext: DrawContext,
  label: string,
): JourneyOption[] {
  const essenceAmount = pickSequentialVariant(
    drawContext,
    `${label}:essence-amount`,
    [330, 350, commonEssenceRewardAmount(context)],
  );
  const cardDraftProfile = pickLegalCardDraftProfile(
    context,
    drawContext,
    `${label}:card-profile`,
    [
      CARD_DRAFT_PROFILES.characters,
      CARD_DRAFT_PROFILES.events,
      CARD_DRAFT_PROFILES.lowCostCharacters,
      CARD_DRAFT_PROFILES.reclaimEvents,
      CARD_DRAFT_PROFILES.dissolveEvents,
      CARD_DRAFT_PROFILES.discardTextCards,
      CARD_DRAFT_PROFILES.abandonCards,
      CARD_DRAFT_PROFILES.eventCopyingCards,
      CARD_DRAFT_PROFILES.energyGenerationCards,
      CARD_DRAFT_PROFILES.duplicateCards,
      CARD_DRAFT_PROFILES.multiAbilityCards,
    ],
  );
  const cardDraft = draftCards(cardDraftProfile);
  const dreamsignChoiceCount = pickSequentialVariant(
    drawContext,
    `${label}:dreamsign-choice-count`,
    [2, 3],
  );
  const dreamsignChoice = dreamsignDraft(dreamsignChoiceCount);
  const fallbackReward =
    context.state.quest.deck.summary.starterCards > 0
      ? option({
          number: 3,
          text: "Purge up to 1 chosen Starter card. Gain 4 omens.",
          effects: [starterCleanup(1), gainOmen(4)],
          targets: [
            target("card", "Starter cards in deck", {
              source: "deck",
              starter: true,
            }),
          ],
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
      targets: [
        target("card", cardDraftProfile.targetDescription, cardDraft.predicate),
      ],
      effect: valueCardDraft(cardDraft) + valueOmenGain(4),
    }),
    context.state.quest.dreamsignPoolIds.length > 0
      ? option({
          number: 3,
          text: dreamsignDraftText(dreamsignChoiceCount),
          effects: [dreamsignChoice],
          targets: [
            target(
              "dreamsign",
              DREAMSIGN_POOL_TARGET_DESCRIPTION,
              dreamsignChoice.predicate,
            ),
          ],
          effect: valueDreamsignDraft(dreamsignChoice, context),
        })
      : fallbackReward,
  ];
}

export function paidDraft(
  context: JourneyContext,
  drawContext: DrawContext,
  label: string,
  number: number,
  price: number,
  profiles: readonly CardDraftProfile[],
): JourneyOption {
  const cardDraftProfile = pickLegalCardDraftProfile(
    context,
    drawContext,
    label,
    profiles,
  );
  const cardDraft = draftCards(cardDraftProfile);

  return option({
    number,
    text: `Pay ${price} essence. ${cardDraftText(cardDraftProfile)}`,
    costs: [cost("essence", price)],
    effects: [cardDraft],
    targets: [
      target("card", cardDraftProfile.targetDescription, cardDraft.predicate),
    ],
    cost: price,
    effect: valueCardDraft(cardDraft),
  });
}

export function routeEdit(
  number: number,
  future = false,
  drawContext?: DrawContext,
): JourneyOption {
  const reward = firstRouteEditReward({
    future,
    drawContext,
    label: `route-edit-option:${number}:${future ? "future" : "current"}`,
    polarities: ["positive"],
  });

  return option({
    number,
    text: reward.text,
    routeEffects: [reward.payload],
    effect: reward.effect,
  });
}

export function routeReplacementReward(
  future = false,
  drawContext?: DrawContext,
  label?: string,
): RewardSlot {
  const reward = firstRouteEditReward({
    future,
    drawContext,
    label: label ?? `route-replacement:${future ? "future" : "current"}`,
    operationKinds: ["replace_site"],
    polarities: ["positive"],
  });

  return {
    key: reward.key,
    text: reward.text,
    effects: [],
    routeEffects: [reward.payload],
    effect: Math.max(320, reward.effect),
  };
}

function stageFromContext(context: JourneyContext): JourneyStage {
  const dreamscape = context.state.quest.resources.dreamscape;

  if (dreamscape <= 1) {
    return "early";
  }

  return dreamscape <= 3 ? "mid" : "late";
}

export function rewardSlotOption(
  number: number,
  reward: RewardSlot,
  extra: Omit<
    OptionArgs,
    | "number"
    | "text"
    | "effects"
    | "targets"
    | "triggers"
    | "routeEffects"
    | "effect"
  > = {},
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

export function rewardSlots(
  context: JourneyContext,
  drawContext: DrawContext,
  label: string,
  stage: JourneyStage = stageFromContext(context),
): RewardSlot[] {
  const essenceAmount = pickSequentialVariant(
    drawContext,
    `${label}:essence`,
    [300, 320, 340],
  );
  const omenAmount = 5;
  const cardProfile = pickLegalCardDraftProfile(
    context,
    drawContext,
    `${label}:card-profile`,
    [
      CARD_DRAFT_PROFILES.characters,
      CARD_DRAFT_PROFILES.events,
      CARD_DRAFT_PROFILES.lowCostCharacters,
      CARD_DRAFT_PROFILES.reclaimEvents,
      CARD_DRAFT_PROFILES.dissolveEvents,
      CARD_DRAFT_PROFILES.fastCharacters,
      CARD_DRAFT_PROFILES.materializedCharacters,
      CARD_DRAFT_PROFILES.discardTextCards,
      CARD_DRAFT_PROFILES.abandonCards,
      CARD_DRAFT_PROFILES.eventCopyingCards,
      CARD_DRAFT_PROFILES.energyGenerationCards,
      CARD_DRAFT_PROFILES.legendaryCards,
      CARD_DRAFT_PROFILES.costOneCards,
      CARD_DRAFT_PROFILES.cheapCards,
      CARD_DRAFT_PROFILES.duplicateCards,
      CARD_DRAFT_PROFILES.multiAbilityCards,
    ],
  );
  const cardDraft = draftCards(cardProfile);
  const secondCardProfile = pickLegalCardDraftProfile(
    context,
    drawContext,
    `${label}:second-card-profile`,
    [
      CARD_DRAFT_PROFILES.survivors,
      CARD_DRAFT_PROFILES.warriors,
      CARD_DRAFT_PROFILES.spiritAnimals,
      CARD_DRAFT_PROFILES.events,
      CARD_DRAFT_PROFILES.fastCharacters,
      CARD_DRAFT_PROFILES.allEligibleCards,
    ],
  );
  const secondCardDraft = draftCards(secondCardProfile);
  const multiDraftProfile = pickLegalCardDraftProfile(
    context,
    drawContext,
    `${label}:multi-card-profile`,
    [
      CARD_DRAFT_PROFILES.events,
      CARD_DRAFT_PROFILES.characters,
      CARD_DRAFT_PROFILES.cheapCards,
      CARD_DRAFT_PROFILES.allEligibleCards,
    ],
  );
  const multiCardDraft = draftCards(multiDraftProfile, { takeCount: 2 });
  const copyDraftProfile = pickLegalCardDraftProfile(
    context,
    drawContext,
    `${label}:copy-card-profile`,
    [
      CARD_DRAFT_PROFILES.eventCopyingCards,
      CARD_DRAFT_PROFILES.energyGenerationCards,
      CARD_DRAFT_PROFILES.discardTextCards,
      CARD_DRAFT_PROFILES.events,
    ],
  );
  const copyCardDraft = draftCards(copyDraftProfile, { copyCount: 2 });
  const randomGainProfile = pickLegalCardDraftProfile(
    context,
    drawContext,
    `${label}:random-card-profile`,
    [
      CARD_DRAFT_PROFILES.events,
      CARD_DRAFT_PROFILES.discardTextCards,
      CARD_DRAFT_PROFILES.energyGenerationCards,
      CARD_DRAFT_PROFILES.allEligibleCards,
    ],
  );
  const randomCardReward = randomCardGain(randomGainProfile, 2);
  const dreamsignChoiceCount = pickSequentialVariant(
    drawContext,
    `${label}:dreamsign-choice`,
    [2, 3],
  );
  const dreamsignChoice = dreamsignDraft(dreamsignChoiceCount);
  const transfiguration = pickSequentialVariant(
    drawContext,
    `${label}:transfiguration`,
    ["Bronze", "Scarlet", "Viridian", "Prismatic", "Golden"],
  );
  const namedCard = selectContentBackedCard({
    context,
    drawContext,
    label,
    stage,
    sources: ["draftPool", "catalog"],
  });
  const namedDreamsign = selectContentBackedDreamsign({
    context,
    drawContext,
    label,
    stage,
    sources: ["pool", "catalog"],
  });
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
      targets: [
        target("card", cardProfile.targetDescription, cardDraft.predicate),
      ],
      effect: Math.max(320, valueCardDraft(cardDraft) + valueOmenGain(4)),
    },
    {
      key: `draft-transfigure:${secondCardProfile.label}`,
      text: `${cardDraftText(secondCardProfile)} Apply {${transfiguration} Transfiguration} to it.`,
      effects: [
        secondCardDraft,
        {
          kind: "transfiguration",
          transfigurationName: transfiguration,
          scope: "drafted_card",
        },
      ],
      targets: [
        target(
          "card",
          secondCardProfile.targetDescription,
          secondCardDraft.predicate,
        ),
      ],
      effect: Math.max(320, valueCardDraft(secondCardDraft) + 185),
    },
    {
      key: `multi-draft:${multiDraftProfile.label}`,
      text: `${cardDraftText(multiDraftProfile, 2)} Gain 2 omens.`,
      effects: [multiCardDraft, gainOmen(2)],
      targets: [
        target(
          "card",
          multiDraftProfile.targetDescription,
          multiCardDraft.predicate,
        ),
      ],
      effect: Math.max(320, valueCardDraft(multiCardDraft) + valueOmenGain(2)),
    },
    {
      key: `copy-draft:${copyDraftProfile.label}`,
      text: cardDraftText(copyDraftProfile, 1, 2),
      effects: [copyCardDraft],
      targets: [
        target(
          "card",
          copyDraftProfile.targetDescription,
          copyCardDraft.predicate,
        ),
      ],
      effect: Math.max(320, valueCardDraft(copyCardDraft)),
    },
    {
      key: `random-card-gain:${randomGainProfile.label}`,
      text: randomCardGainText(randomGainProfile, 2),
      effects: [randomCardReward],
      targets: [
        target("card", randomGainProfile.targetDescription, randomCardReward.predicate),
      ],
      effect: Math.max(320, valueRandomCardGain(randomCardReward)),
      uncertainty: -10,
    },
    {
      key: "random-transfiguration",
      text: `Apply {${transfiguration} Transfiguration} to a random card in your deck. Gain 3 omens.`,
      effects: [
        {
          kind: "transfiguration",
          transfigurationName: transfiguration,
          scope: "random_card",
        },
        gainOmen(3),
      ],
      targets: [target("card", "a random card in deck", { source: "deck" })],
      effect: 320,
    },
  ];

  if (namedCard) {
    const payload = namedCardPayload(
      {
        kind: "card_gain",
        result: namedCard.card,
        source: namedCard.source,
        extra: {
          targetOrigin: namedCard.targetOrigin,
          selectionWeight: namedCard.weight,
          weightHooks: namedCard.weightHooks,
        },
      },
      context,
    );

    slots.push({
      key: `named-card:${namedCard.card.id}`,
      text: `Gain {${namedCard.card.name}}.`,
      effects: [payload],
      targets: [
        cardExactTarget(
          namedCard.card,
          namedCard.source,
          `${namedCard.card.name} as a ${namedCard.targetOrigin.replace(/_/gu, " ")}`,
        ),
      ],
      effect: Math.max(320, cardQualityValue(namedCard.card)),
    });
  }

  if (namedDreamsign) {
    const payload = namedDreamsignPayload(
      {
        kind: "dreamsign_gain",
        dreamsign: namedDreamsign.dreamsign,
        source: namedDreamsign.source,
        extra: {
          targetOrigin: namedDreamsign.targetOrigin,
          selectionWeight: namedDreamsign.weight,
          weightHooks: namedDreamsign.weightHooks,
        },
      },
      context,
    );

    slots.push({
      key: `named-dreamsign:${namedDreamsign.dreamsign.id}`,
      text: `Gain {${namedDreamsign.dreamsign.name}}.`,
      effects: [payload],
      targets: [
        dreamsignExactTarget(namedDreamsign.dreamsign, namedDreamsign.source),
      ],
      effect: Math.max(
        320,
        DREAMSIGN_VALUE_CONSTANTS.namedGain +
          (namedDreamsign.targetOrigin === "dreamsign_pool_candidate"
            ? DREAMSIGN_VALUE_CONSTANTS.selectedTideMatchBonus
            : 0),
      ),
    });
  }

  if (context.state.quest.dreamsignPoolIds.length > 0) {
    slots.push({
      key: "dreamsign-draft",
      text: dreamsignDraftText(dreamsignChoiceCount),
      effects: [dreamsignChoice],
      targets: [
        target(
          "dreamsign",
          DREAMSIGN_POOL_TARGET_DESCRIPTION,
          dreamsignChoice.predicate,
        ),
      ],
      effect: valueDreamsignDraft(dreamsignChoice, context),
    });
  }

  if (context.state.quest.deck.summary.starterCards > 0) {
    slots.push({
      key: "starter-cleanup",
      text: "Purge up to 1 chosen Starter card. Gain 4 omens.",
      effects: [starterCleanup(1), gainOmen(4)],
      targets: [
        target("card", "Starter cards in deck", {
          source: "deck",
          starter: true,
        }),
      ],
      effect: 345,
    });
  }

  return shuffleDeterministic(drawContext, `${label}:reward-slots`, slots);
}

export function costSlots(
  context: JourneyContext,
  drawContext: DrawContext,
  label: string,
): CostSlot[] {
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
      ...baneBurdenSlot(drawContext, `${label}:bane-cost`),
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

export function costedRewardOption(
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

export function delayedRewardOption(
  number: number,
  trigger: {
    key: string;
    text: string;
    kind: string;
    multiplier: number;
    uncertainty: number;
  },
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

export function timingSlots(drawContext: DrawContext, label: string) {
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
      multiplier:
        TIMING_AND_RANDOMNESS_VALUE_CONSTANTS.twoDreamscapesMultiplier,
      uncertainty: -16,
    },
  ] as const);
}

export const treeBuilderTools: TreeBuilderTools = {
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
