import type { ContentBundle } from "../../content/model.js";
import type { JourneyContext } from "../../quest/context.js";
import {
  drawInt,
  shuffleDeterministic,
  weightedChoice,
  type DrawContext,
} from "../../util/rng.js";
import type { DebugPayloadSelection } from "../debugPayloads.js";
import {
  ALLOWED_TRANSFIGURATIONS,
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
  JourneySymmetryContractDebug,
  ManifestReferences,
  PickBehavior,
} from "../manifest.js";
import { adaptJourneyOptionOperations } from "../operationAdapters.js";
import { getShapeDefinition, type JourneyShapeId } from "../shapes.js";
import { symbolsForOption } from "../symbols.js";
import {
  CARD_MODIFICATION_VALUE_CONSTANTS,
  commonEssenceRewardAmount,
  DREAMSIGN_VALUE_CONSTANTS,
  LOSS_CHOICE_VALUE_CONSTANTS,
  TIMING_AND_RANDOMNESS_VALUE_CONSTANTS,
  valueBaneBurden,
  valueBaneGain,
  valueBanePurge,
  valueBaneReplacement,
  valueBaneTransformToCard,
  valueCardDraft,
  valueDreamsignDraft,
  valueDreamsignOperation,
  valueEssenceGain,
  valueOmenGain,
  valueOmenLoss,
  valueRandomCardGain,
  valueStatusRuleMutation,
  valueStarterCleanup,
  valueStarterReplacement,
  valueUsefulNonStarterCardSacrifice,
} from "../value.js";
import { statusPayload } from "./environmentPayloads.js";
import {
  baneGainPayload,
  banePurgePayload,
  baneReplaceWithCardPayload,
  baneTransformToCardPayload,
  type BaneSelectionMode,
  type BaneTargetContextId,
} from "./banePayloads.js";
import {
  cardExactTarget,
  cardQualityValue,
  namedCardPayload,
  selectContentBackedCard,
  starterDeckCardCount,
  starterDeckCards,
  starterEligibleReplacementCards,
  starterReplacementProfile,
  starterReplacementResultPredicate,
} from "./namedCardPayloads.js";
import {
  dreamsignExactTarget,
  namedDreamsignPayload,
  selectContentBackedDreamsign,
} from "./dreamsignPayloads.js";
import {
  resourceCostCatalog,
  resourceRewardCatalog,
} from "./resourcePayloads.js";
import {
  firstRouteEditReward,
  routeEditRewards,
  routePayload,
} from "./routeEditCatalog.js";

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

export function symmetryContract(
  args: JourneySymmetryContractDebug,
): JourneySymmetryContractDebug {
  return {
    ...args,
    optionNumbers: [...args.optionNumbers],
    ...(args.sharedPayloadKeys
      ? { sharedPayloadKeys: [...args.sharedPayloadKeys] }
      : {}),
    ...(args.variedPayloadKeys
      ? { variedPayloadKeys: [...args.variedPayloadKeys] }
      : {}),
  };
}

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

const COMMON_POSITIVE_FALLBACK_ESSENCE_AMOUNTS = {
  early: [300, 330],
  mid: [320, 350],
  late: [340, 370],
} as const satisfies Record<JourneyStage, readonly number[]>;

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
  options: {
    selection?: "exact" | "predicate" | "chosen_after_commitment" | "visible_random" | "hidden_random";
    cardOperationTargetMode?: string;
    dreamsignOperationTargetMode?: string;
  } = {},
) {
  return {
    kind,
    description,
    predicate,
    ...(options.selection ? { selection: options.selection } : {}),
    ...(options.cardOperationTargetMode
      ? { cardOperationTargetMode: options.cardOperationTargetMode }
      : {}),
    ...(options.dreamsignOperationTargetMode
      ? { dreamsignOperationTargetMode: options.dreamsignOperationTargetMode }
      : {}),
    required: true,
  };
}

export function baneTarget(
  description: string,
  names: string[],
  source: "vocabulary" | "state" | "future_burden" | "manifest_obligation" = "vocabulary",
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
      effect: valueStarterCleanup({ count: 1, stage: stageFromContext(context) }),
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

function starterTarget(
  description = "Starter cards in deck",
  options: {
    selection?: "predicate" | "chosen_after_commitment" | "hidden_random";
    cardOperationTargetMode?: "chosen" | "random_predicate" | "all_matching";
  } = {},
) {
  return target(
    "card",
    description,
    { source: "deck", starter: true },
    {
      selection: options.selection ?? "chosen_after_commitment",
      cardOperationTargetMode: options.cardOperationTargetMode ?? "chosen",
    },
  );
}

function starterPayloadBase(
  context: JourneyContext,
  extra: Record<string, unknown> = {},
) {
  return {
    source: "deck",
    sourcePoolSize: context.state.quest.deck.summary.uniqueCards,
    starterTargetCount: starterDeckCardCount(context),
    timing: "immediate",
    starterTarget: true,
    predicate: { source: "deck", starter: true },
    ...extra,
  };
}

function starterSurgeryMenuValue(value: number): number {
  return Math.max(320, Math.min(390, value));
}

type StarterTransfigurationSlotMode = "chosen" | "random";

const STARTER_SURGERY_TRANSFIGURATION_TARGET_COUNTS = {
  chosen: {
    early: [1, 2],
    mid: [1, 2],
    late: [2, 3],
  },
  random: {
    early: [1, 2],
    mid: [2, 3],
    late: [2, 3],
  },
} as const satisfies Record<
  StarterTransfigurationSlotMode,
  Record<JourneyStage, readonly number[]>
>;

const STARTER_SURGERY_EXTRA_STARTER_COUNTS = {
  early: [2, 3],
  mid: [2, 3, 4],
  late: [3, 4],
} as const satisfies Record<JourneyStage, readonly number[]>;

function starterTransfigurationTargetCount(
  drawContext: DrawContext,
  label: string,
  stage: JourneyStage,
  mode: StarterTransfigurationSlotMode,
  starterCount: number,
): number | undefined {
  const counts = STARTER_SURGERY_TRANSFIGURATION_TARGET_COUNTS[mode][stage]
    .filter((count) => count <= starterCount);

  return counts.length > 0
    ? pickSequentialVariant(drawContext, `${label}:${mode}:target-count`, counts)
    : undefined;
}

function starterTransfigurationTargetText(
  mode: StarterTransfigurationSlotMode,
  count: number,
): string {
  const cardText = count === 1 ? "Starter card" : "Starter cards";

  return count === 1
    ? `a ${mode} ${cardText}`
    : `${count} ${mode} ${cardText}`;
}

export function starterSurgeryRewardSlots(
  context: JourneyContext,
  drawContext: DrawContext,
  label: string,
  stage: JourneyStage,
): RewardSlot[] {
  const starterCount = starterDeckCardCount(context);

  if (starterCount === 0) {
    return [];
  }

  const starters = starterDeckCards(context);
  const starterOrder = shuffleDeterministic(
    drawContext,
    `${label}:starter-order`,
    starters,
  );
  const namedReplacementProfile = starterReplacementProfile({
    context,
    drawContext,
    label: `${label}:named-replacement-profile`,
    stage,
    sources: ["catalog"],
  });
  const namedReplacement = namedReplacementProfile
    ? selectContentBackedCard({
        context,
        drawContext,
        label: `${label}:named-replacement`,
        stage,
        sources: [namedReplacementProfile.profile.source],
        predicate: namedReplacementProfile.profile.predicate,
      })
    : undefined;
  const randomReplacementProfile = starterReplacementProfile({
    context,
    drawContext,
    label: `${label}:random-replacement-profile`,
    stage,
    sources: ["catalog"],
  });
  const allReplacementProfile = starterReplacementProfile({
    context,
    drawContext,
    label: `${label}:all-replacement-profile`,
    stage,
    sources: ["catalog"],
    minCandidates: starterCount,
  });
  const draftReplacementProfile = starterReplacementProfile({
    context,
    drawContext,
    label: `${label}:draft-replacement-profile`,
    stage,
    sources: ["draftPool"],
    minCandidates: CARD_DRAFT_CHOICE_COUNT,
  });
  const starterEligiblePool = randomReplacementProfile?.candidates ??
    starterEligibleReplacementCards(context);
  const transfiguration = pickSequentialVariant(
    drawContext,
    `${label}:starter-transfiguration`,
    ALLOWED_TRANSFIGURATIONS,
  );
  const chosenTransfigurationCount = starterTransfigurationTargetCount(
    drawContext,
    `${label}:starter-transfiguration`,
    stage,
    "chosen",
    starterCount,
  );
  const randomTransfigurationCount = starterTransfigurationTargetCount(
    drawContext,
    `${label}:starter-transfiguration`,
    stage,
    "random",
    starterCount,
  );
  const extraStarterCount = pickSequentialVariant(
    drawContext,
    `${label}:extra-starter-count`,
    STARTER_SURGERY_EXTRA_STARTER_COUNTS[stage],
  );
  const firstStarter = starterOrder[0]!;
  const secondStarter = starterOrder[1] ?? firstStarter;
  const thirdStarter = starterOrder[2] ?? secondStarter;
  const slots: RewardSlot[] = [
    {
      key: "starter-cleanup-up-to-two",
      text: "Purge up to 2 chosen Starter cards.",
      effects: [
        {
          kind: "starter_cleanup",
          cleanupMode: "chosen_up_to",
          count: 2,
          minRequiredTargets: 1,
          ...starterPayloadBase(context),
        },
      ],
      targets: [starterTarget()],
      effect: starterSurgeryMenuValue(
        valueStarterCleanup({ count: Math.min(2, starterCount), stage }),
      ),
    },
    {
      key: "starter-cleanup-random",
      text: "Purge a random Starter card.",
      effects: [
        {
          kind: "starter_cleanup",
          cleanupMode: "random",
          count: 1,
          selection: "hidden_random",
          cardOperationFamily: "purge",
          cardOperationTargetModes: ["random_predicate"],
          cardOperationTargetMode: "random_predicate",
          ...starterPayloadBase(context),
        },
      ],
      targets: [
        starterTarget("random Starter cards in deck", {
          selection: "hidden_random",
          cardOperationTargetMode: "random_predicate",
        }),
      ],
      effect: starterSurgeryMenuValue(
        valueStarterCleanup({ count: 1, stage, random: true }),
      ),
      uncertainty: -10,
    },
    {
      key: "starter-replacement-random",
      text: `Purge a random Starter card and gain a random ${randomReplacementProfile?.profile.resultText ?? "starter replacement"}.`,
      effects: [
        {
          kind: "starter_replacement",
          replacementMode: "random",
          count: 1,
          targetCount: 1,
          selection: "hidden_random",
          resultSelection: "hidden_random",
          resultPredicate: randomReplacementProfile
            ? starterReplacementResultPredicate(randomReplacementProfile.profile)
            : { source: "catalog" },
          resultPoolSize: starterEligiblePool.length,
          cardOperationFamily: "replacement",
          cardOperationTargetModes: ["random_predicate"],
          cardOperationTargetMode: "random_predicate",
          ...starterPayloadBase(context),
        },
      ],
      targets: [
        starterTarget("random Starter cards in deck", {
          selection: "hidden_random",
          cardOperationTargetMode: "random_predicate",
        }),
      ],
      effect: starterSurgeryMenuValue(
        valueStarterReplacement({ count: 1, resultValue: 55, stage }),
      ),
      uncertainty: -10,
    },
    {
      key: "starter-cleanup-all",
      text: "Purge all Starter cards.",
      effects: [
        {
          kind: "starter_cleanup",
          cleanupMode: "all",
          count: starterCount,
          targetCount: starterCount,
          selection: "predicate",
          cardOperationFamily: "purge",
          cardOperationTargetModes: ["all_matching"],
          cardOperationTargetMode: "all_matching",
          ...starterPayloadBase(context),
        },
      ],
      targets: [
        starterTarget("all Starter cards in deck", {
          selection: "predicate",
          cardOperationTargetMode: "all_matching",
        }),
      ],
      effect: starterSurgeryMenuValue(
        valueStarterCleanup({ count: starterCount, stage, all: true }),
      ),
    },
    {
      key: "starter-replacement-draft",
      text: `Replace a chosen Starter card with 1 of 4 ${draftReplacementProfile?.profile.description ?? "replacement cards"}.`,
      effects: [
        {
          kind: "starter_replacement",
          replacementMode: "draft",
          takeCount: 1,
          choiceCount: CARD_DRAFT_CHOICE_COUNT,
          resultPredicate: draftReplacementProfile
            ? starterReplacementResultPredicate(draftReplacementProfile.profile)
            : { source: "draftPool" },
          ...starterPayloadBase(context),
        },
      ],
      targets: [starterTarget()],
      effect: starterSurgeryMenuValue(
        valueStarterReplacement({
          count: 1,
          resultValue: valueCardDraft({
            takeCount: 1,
            choiceCount: CARD_DRAFT_CHOICE_COUNT,
            predicate: draftReplacementProfile
              ? starterReplacementResultPredicate(draftReplacementProfile.profile)
              : { source: "draftPool" },
          }),
          stage,
        }),
      ),
    },
    {
      key: "starter-gain-extra",
      text: `Gain ${extraStarterCount} additional Starter cards.`,
      effects: [
        randomCardGain(
          CARD_DRAFT_PROFILES.starters,
          extraStarterCount,
          { source: "catalog" },
        ),
      ],
      targets: [
        target("card", "Starter cards in catalog", {
          source: "catalog",
          starter: true,
        }),
      ],
      effect: starterSurgeryMenuValue(
        valueRandomCardGain({
          count: extraStarterCount,
          predicate: { source: "catalog", starter: true },
        }),
      ),
      uncertainty: -10,
    },
  ];

  if (namedReplacement) {
    const resultValue = cardQualityValue(namedReplacement.card);

    slots.push({
      key: `starter-replacement-named:${namedReplacement.card.id}`,
      text: `Replace a chosen Starter card with {${namedReplacement.card.name}}.`,
      effects: [
        namedCardPayload(
          {
            kind: "starter_replacement",
            target: firstStarter,
            result: namedReplacement.card,
            source: "deck",
            extra: {
              replacementMode: "named",
              resultSelection: "exact_named",
              resultTargetOrigin: "catalog_reward",
              cardOperationFamily: "replacement",
              cardOperationTargetModes: ["chosen", "exact_named"],
              cardOperationTargetMode: "chosen",
              starterTarget: true,
              starterTargetCount: starterCount,
              predicate: { source: "deck", starter: true },
            },
          },
          context,
        ),
      ],
      targets: [starterTarget()],
      effect: starterSurgeryMenuValue(
        valueStarterReplacement({ count: 1, resultValue, stage }),
      ),
    });
  }

  if (allReplacementProfile) {
    slots.push({
      key: "starter-replacement-all",
      text: `Purge all Starter cards and replace them with ${allReplacementProfile.profile.description}.`,
      effects: [
        {
          kind: "starter_replacement",
          replacementMode: "all",
          count: starterCount,
          targetCount: starterCount,
          selection: "predicate",
          resultSelection: "hidden_random",
          resultPredicate: starterReplacementResultPredicate(
            allReplacementProfile.profile,
          ),
          resultPoolSize: allReplacementProfile.candidates.length,
          cardOperationFamily: "replacement",
          cardOperationTargetModes: ["all_matching"],
          cardOperationTargetMode: "all_matching",
          ...starterPayloadBase(context),
        },
      ],
      targets: [
        starterTarget("all Starter cards in deck", {
          selection: "predicate",
          cardOperationTargetMode: "all_matching",
        }),
      ],
      effect: starterSurgeryMenuValue(
        valueStarterReplacement({
          count: starterCount,
          resultValue: 45,
          stage,
          all: true,
        }),
      ),
      uncertainty: -10,
    });
  }

  if (chosenTransfigurationCount !== undefined) {
    const targetText = starterTransfigurationTargetText(
      "chosen",
      chosenTransfigurationCount,
    );

    slots.push({
      key: "starter-two-chosen-transfiguration",
      text: `Apply {${transfiguration} Transfiguration} to ${targetText}.`,
      effects: [
        {
          kind: "card_transfigure",
          transfigurationName: transfiguration,
          targetCount: chosenTransfigurationCount,
          minRequiredTargets: chosenTransfigurationCount,
          selection: "chosen_after_commitment",
          transfigurationScope: "two_chosen_starters",
          cardOperationFamily: "transfiguration",
          cardOperationTargetModes: ["chosen"],
          cardOperationTargetMode: "chosen",
          ...starterPayloadBase(context),
        },
      ],
      targets: [starterTarget()],
      effect: starterSurgeryMenuValue(
        valueStarterCleanup({ count: chosenTransfigurationCount, stage }) + 25,
      ),
    });
  }

  if (randomTransfigurationCount !== undefined) {
    const targetText = starterTransfigurationTargetText(
      "random",
      randomTransfigurationCount,
    );

    slots.push({
      key: "starter-random-transfiguration",
      text: `Apply {${transfiguration} Transfiguration} to ${targetText}.`,
      effects: [
        {
          kind: "card_transfigure",
          transfigurationName: transfiguration,
          targetCount: randomTransfigurationCount,
          minRequiredTargets: randomTransfigurationCount,
          selection: "hidden_random",
          transfigurationScope: "random_starters",
          cardOperationFamily: "transfiguration",
          cardOperationTargetModes: ["random_predicate"],
          cardOperationTargetMode: "random_predicate",
          ...starterPayloadBase(context),
        },
      ],
      targets: [
        starterTarget(`${targetText} in deck`, {
          selection: "hidden_random",
          cardOperationTargetMode: "random_predicate",
        }),
      ],
      effect: starterSurgeryMenuValue(
        valueStarterCleanup({
          count: randomTransfigurationCount,
          stage,
          random: true,
        }) + 30,
      ),
      uncertainty: -10,
    });
  }

  if (starters.length >= 3 && namedReplacement) {
    slots.push({
      key: `starter-door-named-transform:${namedReplacement.card.id}`,
      text: `Transform {${thirdStarter.name}} into {${namedReplacement.card.name}}.`,
      effects: [
        namedCardPayload(
          {
            kind: "card_transform",
            target: thirdStarter,
            result: namedReplacement.card,
            source: "deck",
            extra: {
              resultSelection: "exact_named",
              resultTargetOrigin: "catalog_reward",
              cardOperationFamily: "transform",
              cardOperationTargetModes: ["exact_named"],
              cardOperationTargetMode: "exact_named",
              starterTarget: true,
              starterTargetCount: starterCount,
              predicate: { source: "deck", starter: true },
            },
          },
          context,
        ),
      ],
      targets: [
        cardExactTarget(
          thirdStarter,
          "deck",
          `${thirdStarter.name} in starter deck`,
        ),
      ],
      effect: starterSurgeryMenuValue(
        valueStarterReplacement({
          count: 1,
          resultValue: cardQualityValue(namedReplacement.card),
          stage,
        }),
      ),
    });
  }

  if (label.includes(":starter-services")) {
    const thornedBaneSlots = baneReliefRewardSlots(
      context,
      drawContext,
      `${label}:thorned-bane`,
      stage,
    )
      .filter((slot) =>
        slot.key.startsWith("bane-chosen-purge") ||
        slot.key.startsWith("bane-random-purge") ||
        slot.key.startsWith("bane-future-purge")
      )
      .slice(0, 3);

    slots.push(
      ...thornedBaneSlots.map((slot) => ({
        ...slot,
        key: `starter-cleanup-plus-${slot.key}`,
        text: `Purge up to 1 chosen Starter card. ${slot.text}`,
        effects: [
          {
            kind: "starter_cleanup",
            cleanupMode: "chosen_up_to",
            count: 1,
            minRequiredTargets: 1,
            ...starterPayloadBase(context),
          },
          ...slot.effects,
        ],
        targets: [
          starterTarget(),
          ...(slot.targets ?? []),
        ],
        effect: starterSurgeryMenuValue(
          valueStarterCleanup({ count: 1, stage }) + slot.effect,
        ),
        uncertainty: slot.uncertainty,
      })),
    );
  }

  return shuffleDeterministic(drawContext, `${label}:starter-surgery-slots`, slots);
}

export function baneNameText(baneName: BaneName, count: number): string {
  return `${count} ${baneName}${count === 1 ? "" : "s"}`;
}

export function baneBurden(
  baneName: BaneName,
  count: number,
  options: {
    timing?: string;
    temporary?: boolean;
    duration?: string;
    durationCount?: number;
    targetContext?: BaneTargetContextId;
  } = {},
) {
  return baneGainPayload({
    baneName,
    count,
    targetContext: options.targetContext ?? "future_burden",
    timing: options.timing,
    temporary: options.temporary,
    duration: options.duration,
    durationCount: options.durationCount,
  });
}

export function nightmare(count: number) {
  return baneBurden(DEFAULT_BANE_NAME, count);
}

export function baneBurdenSlot(
  drawContext: DrawContext,
  label: string,
  count?: number,
  options: {
    timing?: string;
    temporary?: boolean;
    duration?: string;
    durationCount?: number;
    key?: string;
  } = {},
): BaneBurdenSlot {
  const baneName = pickSequentialVariant(
    drawContext,
    `${label}:bane-name`,
    BANE_NAMES,
  );
  const baneCount = count ?? pickSequentialVariant(
    drawContext,
    `${label}:bane-count`,
    [1, 1, 2],
  );
  const timingText = options.temporary === true
    ? ` for ${options.duration ?? BATTLE_WINDOW_DURATION}`
    : options.timing && options.timing !== "immediate"
      ? ` ${options.timing}`
      : "";
  const burdenPayload = baneBurden(baneName, baneCount, {
    timing: options.timing,
    temporary: options.temporary,
    duration: options.duration,
    durationCount: options.durationCount,
  });

  return {
    key: options.key ?? "bane",
    baneName,
    prefix: `Gain ${baneNameText(baneName, baneCount)}${timingText}.`,
    burdens: [burdenPayload],
    burden: valueBaneBurden({
      baneName,
      count: baneCount,
      temporary: options.temporary,
      delayed: Boolean(options.timing && options.timing !== "immediate"),
    }),
  };
}

function baneReliefText(args: {
  operation: "chosen_purge" | "random_purge" | "future_purge" | "replace_card" | "transform_card";
  baneName: BaneName;
  cardName?: string;
}): string {
  switch (args.operation) {
    case "random_purge":
      return "Purge a random Bane.";
    case "future_purge":
      return `Purge the next ${args.baneName} you would gain.`;
    case "replace_card":
      return `Replace a chosen ${args.baneName} with {${args.cardName}}.`;
    case "transform_card":
      return `Transform ${args.baneName} into {${args.cardName}}.`;
    case "chosen_purge":
      return "Purge a chosen Bane.";
  }
}

function baneReliefTarget(
  description: string,
  baneName: BaneName,
  source: "vocabulary" | "state" | "future_burden" | "manifest_obligation",
  selection: BaneSelectionMode,
) {
  return baneTarget(description, [baneName], source, selection);
}

export function baneReliefRewardSlots(
  context: JourneyContext,
  drawContext: DrawContext,
  label: string,
  stage: JourneyStage,
): RewardSlot[] {
  const names = shuffleDeterministic(
    drawContext,
    `${label}:bane-relief-names`,
    BANE_NAMES,
  );
  const replacementCard = selectContentBackedCard({
    context,
    drawContext,
    label: `${label}:bane-replacement-card`,
    stage,
    sources: ["draftPool", "catalog"],
  });
  const transformCard = selectContentBackedCard({
    context,
    drawContext,
    label: `${label}:bane-transform-card`,
    stage,
    sources: ["draftPool", "catalog"],
  }) ?? replacementCard;
  const chosenBane = names[0] ?? DEFAULT_BANE_NAME;
  const randomBane = names[1] ?? chosenBane;
  const futureBane = names[2] ?? chosenBane;
  const replaceBane = names[3] ?? chosenBane;
  const transformBane = names[4] ?? chosenBane;
  const slots: RewardSlot[] = [
    {
      key: `bane-chosen-purge:${chosenBane}`,
      text: baneReliefText({ operation: "chosen_purge", baneName: chosenBane }),
      effects: [
        banePurgePayload({
          baneName: chosenBane,
          targetContext: "manifest_obligation",
          selection: "chosen_after_commitment",
        }),
      ],
      targets: [
        baneReliefTarget(
          "manifest-local Bane obligations",
          chosenBane,
          "manifest_obligation",
          "chosen_after_commitment",
        ),
      ],
      effect: valueBanePurge({
        baneName: chosenBane,
        selection: "chosen_after_commitment",
        targetContext: "manifest_obligation",
      }),
    },
    {
      key: `bane-random-purge:${randomBane}`,
      text: baneReliefText({ operation: "random_purge", baneName: randomBane }),
      effects: [
        banePurgePayload({
          baneName: randomBane,
          targetContext: "manifest_obligation",
          selection: "visible_random",
        }),
      ],
      targets: [
        baneReliefTarget(
          "visible random manifest-local Bane obligation",
          randomBane,
          "manifest_obligation",
          "visible_random",
        ),
      ],
      effect: valueBanePurge({
        baneName: randomBane,
        selection: "visible_random",
        targetContext: "manifest_obligation",
      }),
      uncertainty: -10,
    },
    {
      key: `bane-future-purge:${futureBane}`,
      text: baneReliefText({ operation: "future_purge", baneName: futureBane }),
      effects: [
        banePurgePayload({
          baneName: futureBane,
          targetContext: "future_burden",
          selection: "exact",
        }),
      ],
      targets: [
        baneReliefTarget(
          "named future Bane burden",
          futureBane,
          "future_burden",
          "exact",
        ),
      ],
      effect: valueBanePurge({
        baneName: futureBane,
        selection: "exact",
        targetContext: "future_burden",
      }),
    },
  ];

  if (replacementCard) {
    slots.push({
      key: `bane-replace-card:${replaceBane}:${replacementCard.card.id}`,
      text: baneReliefText({
        operation: "replace_card",
        baneName: replaceBane,
        cardName: replacementCard.card.name,
      }),
      effects: [
        baneReplaceWithCardPayload({
          baneName: replaceBane,
          cardId: replacementCard.card.id,
          cardName: replacementCard.card.name,
          source: replacementCard.source,
          targetContext: "manifest_obligation",
          selection: "chosen_after_commitment",
        }),
      ],
      targets: [
        baneReliefTarget(
          "manifest-local Bane obligation",
          replaceBane,
          "manifest_obligation",
          "chosen_after_commitment",
        ),
        cardExactTarget(replacementCard.card, replacementCard.source),
      ],
      effect: valueBaneReplacement({
        baneName: replaceBane,
        replacementValue: cardQualityValue(replacementCard.card),
        selection: "chosen_after_commitment",
        targetContext: "manifest_obligation",
      }),
    });
  }

  if (transformCard) {
    slots.push({
      key: `bane-transform-card:${transformBane}:${transformCard.card.id}`,
      text: baneReliefText({
        operation: "transform_card",
        baneName: transformBane,
        cardName: transformCard.card.name,
      }),
      effects: [
        baneTransformToCardPayload({
          baneName: transformBane,
          cardId: transformCard.card.id,
          cardName: transformCard.card.name,
          source: transformCard.source,
          targetContext: "manifest_obligation",
        }),
      ],
      targets: [
        baneReliefTarget(
          "manifest-local Bane obligation",
          transformBane,
          "manifest_obligation",
          "exact",
        ),
        cardExactTarget(transformCard.card, transformCard.source),
      ],
      effect: valueBaneTransformToCard({
        baneName: transformBane,
        cardValue: cardQualityValue(transformCard.card),
        targetContext: "manifest_obligation",
      }),
    });
  }

  return shuffleDeterministic(drawContext, `${label}:bane-relief-slots`, slots);
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
  const fallbackEssenceAmount = pickSequentialVariant(
    drawContext,
    `${label}:fallback-essence`,
    COMMON_POSITIVE_FALLBACK_ESSENCE_AMOUNTS[stageFromContext(context)],
  );
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
          effect:
            valueStarterCleanup({ count: 1, stage: stageFromContext(context) }) +
            valueOmenGain(4),
        })
      : option({
          number: 3,
          text: `Gain ${fallbackEssenceAmount} essence.`,
          effects: [gainEssence(fallbackEssenceAmount)],
          effect: valueEssenceGain(fallbackEssenceAmount, context),
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

function shouldIncludeBaneReliefRewardSlots(label: string): boolean {
  return label.includes(":services") ||
    label.includes(":trigger-rewards") ||
    label.endsWith(":reward");
}

function nextVictoryRewardReplacementSlots(
  context: JourneyContext,
  drawContext: DrawContext,
  label: string,
): RewardSlot[] {
  const dreamsignChoiceCount = pickSequentialVariant(
    drawContext,
    `${label}:replacement-dreamsign-choice`,
    [2, 3] as const,
  );
  const essenceAmount = pickSequentialVariant(
    drawContext,
    `${label}:replacement-essence`,
    [200, 220, 240] as const,
  );
  const dreamsignReplacement = dreamsignDraft(dreamsignChoiceCount);
  const transfigurationSite = routePayload({
    operation: "add_site",
    routeScope: "next_dreamscape",
    polarity: "positive",
    siteDeltaValue: 110,
    siteType: "Transfiguration",
    timing: "next dreamscape",
    description: "add a Transfiguration site to the next dreamscape",
  });
  const transfigurationReplacement = { ...transfigurationSite };
  delete transfigurationReplacement.timing;
  const slots: RewardSlot[] = [
    {
      key: "next-victory-replacement:dreamsign-draft",
      text: `Your next victory yields ${lowerFirst(dreamsignDraftText(dreamsignChoiceCount)).replace(/\.$/u, "")} instead of card rewards.`,
      effects: [
        statusPayload({
          kind: "status_reward_replacement",
          statusName: "Spoiled Victory",
          statusScope: "reward",
          duration: "one_time",
          ruleMutationKind: "next_victory_reward_replacement",
          rewardTrigger: "next_victory",
          replacedRewardKind: "card_rewards",
          replacement: `${dreamsignChoiceCount}-choice Dreamsign draft`,
          replacementKind: "dreamsign_draft",
          replacementPayload: dreamsignReplacement,
        }),
      ],
      targets: [
        target(
          "dreamsign",
          DREAMSIGN_POOL_TARGET_DESCRIPTION,
          dreamsignReplacement.predicate,
        ),
      ],
      effect: valueStatusRuleMutation("next_victory_reward_replacement"),
      uncertainty: -8,
    },
    {
      key: "next-victory-replacement:essence",
      text: `Your next victory yields ${essenceAmount} essence instead of card rewards.`,
      effects: [
        statusPayload({
          kind: "status_reward_replacement",
          statusName: "Spoiled Victory",
          statusScope: "reward",
          duration: "one_time",
          ruleMutationKind: "next_victory_reward_replacement",
          rewardTrigger: "next_victory",
          replacedRewardKind: "card_rewards",
          replacement: `${essenceAmount} essence`,
          replacementKind: "resource",
          replacementPayload: gainEssence(essenceAmount),
          resource: "essence",
          amount: essenceAmount,
        }),
      ],
      effect: Math.max(
        valueStatusRuleMutation("next_victory_reward_replacement"),
        valueEssenceGain(essenceAmount, context),
      ),
      uncertainty: -8,
    },
    {
      key: "next-victory-replacement:route",
      text: "Your next victory adds a {Transfiguration} site to the next dreamscape instead of card rewards.",
      effects: [
        statusPayload({
          kind: "status_reward_replacement",
          statusName: "Spoiled Victory",
          statusScope: "reward",
          duration: "one_time",
          ruleMutationKind: "next_victory_reward_replacement",
          rewardTrigger: "next_victory",
          replacedRewardKind: "card_rewards",
          replacement: "add a Transfiguration site to the next dreamscape",
          replacementKind: "route_reward",
          replacementPayload: transfigurationReplacement,
        }),
      ],
      effect: valueStatusRuleMutation("next_victory_reward_replacement"),
      uncertainty: -8,
    },
  ];

  return context.state.quest.dreamsignPoolIds.length > 0
    ? slots
    : slots.filter((slot) => slot.key !== "next-victory-replacement:dreamsign-draft");
}

type RewardReductionTrigger = "battle" | "essence_site";

type RewardReductionStatusDuration = Parameters<
  typeof statusPayload
>[0]["duration"];

type RewardReductionDuration = {
  label: string;
  statusDuration: RewardReductionStatusDuration;
};

const REWARD_REDUCTION_DURATIONS: Record<
  RewardReductionTrigger,
  readonly RewardReductionDuration[]
> = {
  battle: [
    { label: "next 2 battles", statusDuration: "next_2_battles" },
    { label: "next 3 battles", statusDuration: "next_3_battles" },
    { label: "next 4 battles", statusDuration: "next_4_battles" },
  ],
  essence_site: [
    { label: "next 2 dreamscapes", statusDuration: "next_2_dreamscapes" },
    { label: "next 3 dreamscapes", statusDuration: "next_3_dreamscapes" },
    { label: "next 4 dreamscapes", statusDuration: "next_4_dreamscapes" },
  ],
};

function rewardReductionDuration(
  drawContext: DrawContext,
  label: string,
  trigger: RewardReductionTrigger,
): RewardReductionDuration {
  return pickSequentialVariant(
    drawContext,
    `${label}:${trigger}:duration`,
    REWARD_REDUCTION_DURATIONS[trigger],
  );
}

function statusBurdenSlots(
  drawContext: DrawContext,
  label: string,
): CostSlot[] {
  const battleRewardDuration = rewardReductionDuration(
    drawContext,
    label,
    "battle",
  );
  const essenceSiteDuration = rewardReductionDuration(
    drawContext,
    label,
    "essence_site",
  );
  const battleRewardReduction = pickSequentialVariant(
    drawContext,
    `${label}:battle-reward-reduction`,
    [1, 2] as const,
  );
  const essenceSiteReduction = pickSequentialVariant(
    drawContext,
    `${label}:essence-site-reduction`,
    [80, 100, 120] as const,
  );
  const deckFloor = pickSequentialVariant(
    drawContext,
    `${label}:deck-floor`,
    [18, 20, 22] as const,
  );
  const exactDeckSize = pickSequentialVariant(
    drawContext,
    `${label}:exact-deck-size`,
    [30, 32, 35] as const,
  );

  return [
    {
      key: "status-no-essence-gain",
      prefix: "You can no longer gain essence.",
      burdens: [
        statusPayload({
          kind: "status_persistent_prohibition",
          statusName: "Sealed Hands",
          statusScope: "quest",
          duration: "persistent",
          ruleMutationKind: "persistent_prohibition",
          polarity: "negative",
          prohibitionKind: "resource_gain",
          prohibitedAction: "gain_essence",
          resource: "essence",
        }),
      ],
      burden: valueStatusRuleMutation("no_essence_gain", {
        largeNamedReward: true,
      }),
    },
    {
      key: "status-no-deck-modification",
      prefix: "You can no longer modify your deck.",
      burdens: [
        statusPayload({
          kind: "status_persistent_prohibition",
          statusName: "Sealed Hands",
          statusScope: "quest",
          duration: "persistent",
          ruleMutationKind: "persistent_prohibition",
          polarity: "negative",
          prohibitionKind: "deck_modification",
          prohibitedAction: "modify_deck",
        }),
      ],
      burden: valueStatusRuleMutation("no_deck_modification", {
        largeNamedReward: true,
      }),
    },
    {
      key: "status-no-transfiguring",
      prefix: "You can no longer transfigure cards.",
      burdens: [
        statusPayload({
          kind: "status_persistent_prohibition",
          statusName: "Sealed Hands",
          statusScope: "quest",
          duration: "persistent",
          ruleMutationKind: "persistent_prohibition",
          polarity: "negative",
          prohibitionKind: "card_transfiguration",
          prohibitedAction: "transfigure_cards",
        }),
      ],
      burden: valueStatusRuleMutation("no_card_transfiguration", {
        largeNamedReward: true,
      }),
    },
    {
      key: "status-battle-reward-reduction",
      prefix: `For the ${battleRewardDuration.label}, Battle rewards offer ${battleRewardReduction} fewer card choice${battleRewardReduction === 1 ? "" : "s"}.`,
      burdens: [
        statusPayload({
          kind: "status_reward_reduction",
          statusName: "Thinned Battle Spoils",
          statusScope: "reward",
          duration: battleRewardDuration.statusDuration,
          ruleMutationKind: "battle_reward_reduction",
          polarity: "negative",
          rewardTrigger: "battle",
          replacedRewardKind: "battle_rewards",
          amount: battleRewardReduction,
        }),
      ],
      burden: valueStatusRuleMutation("battle_reward_reduction"),
    },
    {
      key: "status-essence-site-reward-reduction",
      prefix: `For the ${essenceSiteDuration.label}, Essence sites yield ${essenceSiteReduction} less essence.`,
      burdens: [
        statusPayload({
          kind: "status_reward_reduction",
          statusName: "Dry Wells",
          statusScope: "reward",
          duration: essenceSiteDuration.statusDuration,
          ruleMutationKind: "essence_site_reward_reduction",
          polarity: "negative",
          rewardTrigger: "essence_site",
          replacedRewardKind: "essence_site_rewards",
          resource: "essence",
          amount: essenceSiteReduction,
        }),
      ],
      burden: valueStatusRuleMutation("essence_site_reward_reduction"),
    },
    {
      key: "status-deck-size-floor",
      prefix: `Your deck cannot be cut below ${deckFloor} cards.`,
      burdens: [
        statusPayload({
          kind: "status_structural_constraint",
          statusName: "Deck Floor",
          statusScope: "quest",
          duration: "persistent",
          ruleMutationKind: "deck_size_floor",
          polarity: "negative",
          exactDeckSize: deckFloor,
          minDeckSize: deckFloor,
          prohibitionKind: "deck_cut_floor",
          prohibitedAction: "voluntary_deck_cut",
          deckCutFloor: deckFloor,
        }),
      ],
      burden: valueStatusRuleMutation("deck_size_floor"),
    },
    {
      key: "status-exact-deck-size",
      prefix: `Your deck must contain exactly ${exactDeckSize} cards.`,
      burdens: [
        statusPayload({
          kind: "status_structural_constraint",
          statusName: "Exact Deck",
          statusScope: "quest",
          duration: "persistent",
          ruleMutationKind: "exact_deck_size_mandate",
          polarity: "negative",
          exactDeckSize,
        }),
      ],
      burden: valueStatusRuleMutation("exact_deck_size_mandate"),
    },
  ];
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
    ALLOWED_TRANSFIGURATIONS,
  );
  const namedCard = selectContentBackedCard({
    context,
    drawContext,
    label,
    stage,
    sources: ["draftPool", "catalog"],
  });
  const namedDeckOperationTarget = selectContentBackedCard({
    context,
    drawContext,
    label: `${label}:named-card-operation-target`,
    stage,
    sources: ["deck"],
    includeStarters: true,
  });
  const namedDeckOperationResult = selectContentBackedCard({
    context,
    drawContext,
    label: `${label}:named-card-operation-result`,
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
  const resourceRewards = resourceRewardCatalog(
    context,
    drawContext,
    `${label}:resource`,
  );
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

  if (namedDeckOperationTarget && namedDeckOperationResult) {
    const operationKind = pickSequentialVariant(
      drawContext,
      `${label}:named-card-operation-kind`,
      ["card_transform", "card_replace", "card_duplicate"] as const,
    );
    const targetCard = namedDeckOperationTarget.card;
    const resultCard = namedDeckOperationResult.card;
    const payload = namedCardPayload(
      operationKind === "card_duplicate"
        ? {
            kind: operationKind,
            target: targetCard,
            source: "deck",
            extra: {
              copyCount: 2,
              cardOperationFamily: "duplicate",
              cardOperationTargetModes: ["exact_named"],
              cardOperationTargetMode: "exact_named",
            },
          }
        : {
            kind: operationKind,
            target: targetCard,
            result: resultCard,
            source: "deck",
            extra: {
              resultSelection: "exact_named",
              resultTargetOrigin: "catalog_reward",
              cardOperationFamily:
                operationKind === "card_transform" ? "transform" : "replacement",
              cardOperationTargetModes: ["exact_named"],
              cardOperationTargetMode: "exact_named",
            },
          },
      context,
    );
    const operationText = operationKind === "card_duplicate"
      ? `Add 2 copies of {${targetCard.name}} to your deck.`
      : operationKind === "card_transform"
        ? `Transform {${targetCard.name}} into {${resultCard.name}}.`
        : `Replace {${targetCard.name}} with {${resultCard.name}}.`;

    slots.push({
      key: `named-card-operation:${operationKind}:${targetCard.id}:${operationKind === "card_duplicate" ? "copies" : resultCard.id}`,
      text: operationText,
      effects: [payload],
      targets: [
        cardExactTarget(
          targetCard,
          "deck",
          `${targetCard.name} as an exact current deck card`,
        ),
      ],
      effect: Math.max(
        320,
        operationKind === "card_duplicate"
          ? CARD_MODIFICATION_VALUE_CONSTANTS.duplicateChosen
          : cardQualityValue(resultCard) + 80,
      ),
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

  slots.push(...resourceRewards);

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
      effect:
        valueStarterCleanup({ count: 1, stage }) +
        valueOmenGain(4),
    });
  }

  if (shouldIncludeBaneReliefRewardSlots(label)) {
    slots.push(
      ...baneReliefRewardSlots(
        context,
        drawContext,
        `${label}:bane-relief`,
        stage,
      ).map((slot) => ({
        ...slot,
        effect: Math.max(320, slot.effect),
      })),
    );
  }

  if (!label.includes(":cache-rewards")) {
    slots.push(
      ...starterSurgeryRewardSlots(
        context,
        drawContext,
        `${label}:starter-surgery`,
        stage,
      ),
    );
  }

  if (stage === "late") {
    slots.push(
      ...nextVictoryRewardReplacementSlots(
        context,
        drawContext,
        `${label}:next-victory-replacement`,
      ),
    );
  }

  return shuffleDeterministic(drawContext, `${label}:reward-slots`, slots);
}

export function costSlots(
  context: JourneyContext,
  drawContext: DrawContext,
  label: string,
  options: { includeStatusBurdens?: boolean } = {},
): CostSlot[] {
  const lowEssence = Math.min(
    pickSequentialVariant(drawContext, `${label}:low-essence`, [15, 20, 25]),
    context.state.quest.resources.essence,
  );
  const highEssence = Math.min(
    pickSequentialVariant(drawContext, `${label}:high-essence`, [35, 45, 55]),
    context.state.quest.resources.essence,
  );
  const resourceCosts = resourceCostCatalog(
    context,
    drawContext,
    `${label}:resource`,
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
    {
      ...baneBurdenSlot(drawContext, `${label}:temporary-bane-cost`, 1, {
        key: "bane-temporary",
        temporary: true,
        duration: BATTLE_WINDOW_DURATION,
        durationCount: 3,
        timing: BATTLE_WINDOW_DURATION,
      }),
    },
    {
      ...baneBurdenSlot(drawContext, `${label}:delayed-bane-cost`, 1, {
        key: "bane-delayed",
        timing: "after next battle",
      }),
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

  slots.push(...resourceCosts);
  if (options.includeStatusBurdens === true) {
    slots.push(...statusBurdenSlots(drawContext, `${label}:status-burdens`));
  }

  return shuffleDeterministic(drawContext, `${label}:cost-slots`, slots);
}

export type CompoundCompositionRole =
  | "primary_reward"
  | "cost"
  | "burden"
  | "route_side_effect"
  | "delayed_side_effect"
  | "follow_up_operation";

export type CompoundValueBand = "minor" | "standard" | "premium";

export type CompoundCompositionContract = {
  shapeId: JourneyShapeId;
  allowCosts?: boolean;
  allowBurdens?: boolean;
  allowRouteSideEffects?: boolean;
  allowDelayedSideEffects?: boolean;
  allowFollowUpOperations?: boolean;
  allowRouteOnlyReward?: boolean;
  minimumUpside: number;
  valueBands: readonly CompoundValueBand[];
  allowedTargetKinds?: readonly FillPlanVisibleObject["objectKind"][];
};

export type CompoundPayloadComponent = {
  role: CompoundCompositionRole;
  key: string;
  family: string;
  text: string;
  value: number;
  valueBand: CompoundValueBand;
  polarity: "positive" | "negative" | "mixed";
  costs?: readonly unknown[];
  effects?: readonly unknown[];
  burdens?: readonly unknown[];
  targets?: readonly unknown[];
  triggers?: readonly unknown[];
  routeEffects?: readonly unknown[];
  targetKinds?: readonly FillPlanVisibleObject["objectKind"][];
  uncertainty?: number;
};

function componentValue<T extends Record<string, unknown>>(
  payload: T,
  value: number,
): T & { componentConvertedEssence: number } {
  return {
    ...payload,
    componentConvertedEssence: value,
  };
}

function compoundValueBand(value: number): CompoundValueBand {
  const magnitude = Math.abs(value);

  if (magnitude >= 300) {
    return "premium";
  }

  if (magnitude >= 100) {
    return "standard";
  }

  return "minor";
}

function targetKindsCompatible(
  contract: CompoundCompositionContract,
  components: readonly CompoundPayloadComponent[],
): boolean {
  if (!contract.allowedTargetKinds) {
    return true;
  }

  return components
    .flatMap((component) => component.targetKinds ?? [])
    .every((targetKind) => contract.allowedTargetKinds!.includes(targetKind));
}

function roleAllowed(
  contract: CompoundCompositionContract,
  role: CompoundCompositionRole,
): boolean {
  switch (role) {
    case "primary_reward":
      return true;
    case "cost":
      return contract.allowCosts === true;
    case "burden":
      return contract.allowBurdens === true;
    case "route_side_effect":
      return contract.allowRouteSideEffects === true;
    case "delayed_side_effect":
      return contract.allowDelayedSideEffects === true;
    case "follow_up_operation":
      return contract.allowFollowUpOperations === true;
  }
}

export function composeCompoundPayloadOption(args: {
  number: number;
  contract: CompoundCompositionContract;
  components: readonly CompoundPayloadComponent[];
}): ResolvedShapeFillOption | undefined {
  const primary = args.components.find((component) =>
    component.role === "primary_reward"
  );
  const activeComponents = args.components.filter((component) =>
    component.value !== 0 ||
    (component.effects?.length ?? 0) > 0 ||
    (component.burdens?.length ?? 0) > 0 ||
    (component.costs?.length ?? 0) > 0 ||
    (component.routeEffects?.length ?? 0) > 0
  );

  if (!primary || primary.value < args.contract.minimumUpside) {
    return undefined;
  }

  if (
    !args.contract.valueBands.includes(primary.valueBand) ||
    !activeComponents.every((component) => roleAllowed(args.contract, component.role)) ||
    !targetKindsCompatible(args.contract, activeComponents)
  ) {
    return undefined;
  }

  const hasRouteOnlyReward =
    (primary.routeEffects?.length ?? 0) > 0 &&
    (primary.effects?.length ?? 0) === 0;
  const downside = activeComponents.filter((component) =>
    component.role === "cost" || component.role === "burden"
  );

  if (hasRouteOnlyReward && args.contract.allowRouteOnlyReward !== true) {
    return undefined;
  }

  if (downside.length > 0 && primary.value < args.contract.minimumUpside) {
    return undefined;
  }

  const orderedComponents = [
    ...activeComponents.filter((component) =>
      component.role === "cost" || component.role === "burden"
    ),
    ...activeComponents.filter((component) =>
      component.role === "primary_reward" ||
      component.role === "route_side_effect" ||
      component.role === "follow_up_operation" ||
      component.role === "delayed_side_effect"
    ),
  ];

  return {
    number: args.number,
    textParts: orderedComponents.map((component) => ({
      source: component.role === "cost"
        ? "cost"
        : component.role === "burden"
          ? "burden"
          : component.role === "delayed_side_effect"
            ? "timing"
            : "reward",
      text: component.text,
    })),
    payloadSpecs: orderedComponents.map((component) => ({
      role: component.role === "cost"
        ? "cost"
        : component.role === "burden"
          ? "burden"
          : component.role === "route_side_effect"
            ? "route"
            : component.role === "delayed_side_effect"
              ? "trigger"
              : "reward",
      key: component.key,
      family: component.family,
      payloads: [
        ...(component.costs ?? []),
        ...(component.effects ?? []),
        ...(component.burdens ?? []),
        ...(component.triggers ?? []),
        ...(component.routeEffects ?? []),
      ],
    })),
    costs: activeComponents.flatMap((component) => component.costs ?? []),
    effects: activeComponents.flatMap((component) => component.effects ?? []),
    burdens: activeComponents.flatMap((component) => component.burdens ?? []),
    targetSelectors: activeComponents.flatMap((component) =>
      component.targets ?? []
    ),
    triggers: activeComponents.flatMap((component) => component.triggers ?? []),
    routeEffects: activeComponents.flatMap((component) =>
      component.routeEffects ?? []
    ),
    valueEstimate: {
      cost: activeComponents
        .filter((component) => component.role === "cost")
        .reduce((total, component) => total + Math.abs(component.value), 0),
      effect: activeComponents
        .filter((component) =>
          component.role === "primary_reward" ||
          component.role === "route_side_effect" ||
          component.role === "follow_up_operation"
        )
        .reduce((total, component) => total + component.value, 0),
      burden: activeComponents
        .filter((component) => component.role === "burden")
        .reduce((total, component) => total + component.value, 0),
      uncertainty: activeComponents.reduce(
        (total, component) => total + (component.uncertainty ?? 0),
        0,
      ),
    },
  };
}

function exactCardByName(
  context: JourneyContext,
  name: string,
) {
  return context.content.cards.find((card) => card.name === name);
}

function exactDreamsignByName(
  context: JourneyContext,
  name: string,
) {
  return context.content.dreamsigns.find((dreamsign) => dreamsign.name === name);
}

function namedDreamsignRewardComponent(args: {
  context: JourneyContext;
  dreamsignName?: string;
  drawContext?: DrawContext;
  label?: string;
  stage?: JourneyStage;
  value?: number;
}): CompoundPayloadComponent | undefined {
  const dreamsign = args.dreamsignName
    ? exactDreamsignByName(args.context, args.dreamsignName)
    : args.drawContext && args.label && args.stage
      ? selectContentBackedDreamsign({
          context: args.context,
          drawContext: args.drawContext,
          label: args.label,
          stage: args.stage,
          sources: ["catalog"],
        })?.dreamsign
      : undefined;

  if (!dreamsign) {
    return undefined;
  }

  const value = args.value ?? DREAMSIGN_VALUE_CONSTANTS.namedGain;

  return {
    role: "primary_reward",
    key: `compound:named-dreamsign:${dreamsign.id}`,
    family: "named_dreamsign_reward",
    text: `Gain {${dreamsign.name}}.`,
    value,
    valueBand: compoundValueBand(value),
    polarity: "positive",
    effects: [
      componentValue(
        namedDreamsignPayload(
          {
            kind: "dreamsign_gain",
            dreamsign,
            source: "catalog",
            extra: { compoundComponentRole: "primary_reward" },
          },
          args.context,
        ),
        value,
      ),
    ],
    targets: [dreamsignExactTarget(dreamsign, "catalog")],
    targetKinds: ["dreamsign"],
  };
}

function namedCardRewardComponent(args: {
  context: JourneyContext;
  cardName?: string;
  predicate?: Parameters<typeof selectContentBackedCard>[0]["predicate"];
  text?: string;
}): CompoundPayloadComponent | undefined {
  const selected = args.cardName
    ? exactCardByName(args.context, args.cardName)
    : undefined;
  const card = selected ??
    selectContentBackedCard({
      context: args.context,
      drawContext: {
        seed: args.context.state.quest.seed,
        contentVersion: args.context.contentVersion,
        rootJourneyIndex: args.context.state.generator.rootJourneyIndex,
      },
      label: "compound:named-card-reward",
      stage: stageFromContext(args.context),
      sources: ["catalog"],
      predicate: args.predicate,
    })?.card;

  if (!card) {
    return undefined;
  }

  const value = Math.max(320, cardQualityValue(card));

  return {
    role: "primary_reward",
    key: `compound:named-card:${card.id}`,
    family: "named_card_reward",
    text: args.text ?? `Gain {${card.name}}.`,
    value,
    valueBand: compoundValueBand(value),
    polarity: "positive",
    effects: [
      componentValue(
        namedCardPayload(
          {
            kind: "card_gain",
            result: card,
            source: "catalog",
            extra: { compoundComponentRole: "primary_reward" },
          },
          args.context,
        ),
        value,
      ),
    ],
    targets: [cardExactTarget(card, "catalog")],
    targetKinds: ["card"],
  };
}

function cardDraftRewardComponent(
  context: JourneyContext,
  profile: CardDraftProfile,
): CompoundPayloadComponent {
  const draft = draftCards(profile);
  const value = Math.max(400, valueCardDraft(draft));

  return {
    role: "primary_reward",
    key: `compound:card-draft:${profile.label}`,
    family: "card_draft_reward",
    text: cardDraftText(profile),
    value,
    valueBand: compoundValueBand(value),
    polarity: "positive",
    effects: [componentValue(draft, value)],
    targets: [target("card", profile.targetDescription, draft.predicate)],
    targetKinds: ["card"],
  };
}

function transfigurationRewardComponent(
  transfigurationName: string,
  value = 220,
): CompoundPayloadComponent {
  return {
    role: "primary_reward",
    key: `compound:transfiguration:${transfigurationName}`,
    family: "card_transfiguration_reward",
    text: `Apply {${transfigurationName} Transfiguration} to a chosen card.`,
    value,
    valueBand: compoundValueBand(value),
    polarity: "positive",
    effects: [
      componentValue(
        {
          kind: "transfiguration",
          transfigurationName,
          scope: "chosen_card",
          compoundComponentRole: "primary_reward",
        },
        value,
      ),
    ],
    targets: [target("card", "a chosen card in deck", { source: "deck" })],
    targetKinds: ["card"],
  };
}

function cardSacrificeComponent(args: {
  context: JourneyContext;
  cardName?: string;
  randomCharacter?: boolean;
}): CompoundPayloadComponent | undefined {
  const card = args.cardName ? exactCardByName(args.context, args.cardName) : undefined;
  const payload = card
    ? namedCardPayload(
        {
          kind: "card_purge",
          target: card,
          source: "deck",
          extra: {
            purgeMode: "exact_named",
            cardOperationFamily: "purge",
            compoundComponentRole: "burden",
          },
        },
        args.context,
      )
    : {
        kind: "card_purge",
        purgeMode: "random",
        selection: "hidden_random",
        predicate: {
          source: "deck",
          ...(args.randomCharacter === true ? { cardType: "Character" } : {}),
        },
        cardOperationFamily: "purge",
        compoundComponentRole: "burden",
      };
  const value = valueUsefulNonStarterCardSacrifice(1);

  return {
    role: "burden",
    key: card ? `compound:card-sacrifice:${card.id}` : "compound:card-sacrifice:random-character",
    family: "card_sacrifice",
    text: card ? `Purge {${card.name}}.` : "Purge a random character.",
    value,
    valueBand: compoundValueBand(value),
    polarity: "negative",
    burdens: [componentValue(payload, value)],
    targets: card
      ? [cardExactTarget(card, "deck", `${card.name} in your deck`)]
      : [
          target(
            "card",
            "random Character cards in deck",
            { source: "deck", cardType: "Character" },
            { selection: "hidden_random" },
          ),
        ],
    targetKinds: ["card"],
    uncertainty: args.randomCharacter === true ? -10 : undefined,
  };
}

function dreamsignSacrificeComponent(args: {
  context: JourneyContext;
  dreamsignName?: string;
  drawContext?: DrawContext;
  label?: string;
  stage?: JourneyStage;
}): CompoundPayloadComponent | undefined {
  const dreamsign = args.dreamsignName
    ? exactDreamsignByName(args.context, args.dreamsignName)
    : args.drawContext && args.label && args.stage
      ? selectContentBackedDreamsign({
          context: args.context,
          drawContext: args.drawContext,
          label: args.label,
          stage: args.stage,
          sources: ["catalog"],
        })?.dreamsign
      : undefined;

  if (!dreamsign) {
    return undefined;
  }

  const value = DREAMSIGN_VALUE_CONSTANTS.loss;

  return {
    role: "burden",
    key: `compound:dreamsign-sacrifice:${dreamsign.id}`,
    family: "dreamsign_sacrifice",
    text: `Purge {${dreamsign.name}}.`,
    value,
    valueBand: compoundValueBand(value),
    polarity: "negative",
    burdens: [
      componentValue(
        namedDreamsignPayload(
          {
            kind: "dreamsign_purge",
            dreamsign,
            source: "catalog",
            extra: {
              dreamsignOperationFamily: "purge",
              compoundComponentRole: "burden",
            },
          },
          args.context,
        ),
        value,
      ),
    ],
    targets: [dreamsignExactTarget(dreamsign, "catalog")],
    targetKinds: ["dreamsign"],
  };
}

function rewardReductionBurdenComponent(args: {
  trigger: RewardReductionTrigger;
  amount: number;
  duration: RewardReductionDuration;
}): CompoundPayloadComponent {
  const isBattle = args.trigger === "battle";
  const value = valueStatusRuleMutation(
    isBattle ? "battle_reward_reduction" : "essence_site_reward_reduction",
  );

  return {
    role: "burden",
    key: `compound:reward-reduction:${args.trigger}:${args.amount}`,
    family: "reward_reduction_burden",
    text: isBattle
      ? `For the ${args.duration.label}, Battle rewards offer ${args.amount} fewer card choice${args.amount === 1 ? "" : "s"}.`
      : `For the ${args.duration.label}, Essence sites yield ${args.amount} less essence.`,
    value,
    valueBand: compoundValueBand(value),
    polarity: "negative",
    burdens: [
      componentValue(
        statusPayload({
          kind: "status_reward_reduction",
          statusName: isBattle ? "Withered Orchard" : "Dry Orchard",
          statusScope: "reward",
          duration: args.duration.statusDuration,
          ruleMutationKind: isBattle
            ? "battle_reward_reduction"
            : "essence_site_reward_reduction",
          polarity: "negative",
          rewardTrigger: args.trigger,
          replacedRewardKind: isBattle
            ? "battle_rewards"
            : "essence_site_rewards",
          resource: isBattle ? undefined : "essence",
          amount: args.amount,
        }),
        value,
      ),
    ],
    targetKinds: ["generated_object"],
  };
}

function randomCardGainRewardComponent(
  profile: CardDraftProfile,
  count: number,
): CompoundPayloadComponent {
  const payload = randomCardGain(profile, count);
  const value = Math.max(420, valueRandomCardGain(payload));

  return {
    role: "primary_reward",
    key: `compound:random-card-gain:${profile.label}:${count}`,
    family: "random_card_gain_reward",
    text: randomCardGainText(profile, count),
    value,
    valueBand: compoundValueBand(value),
    polarity: "positive",
    effects: [componentValue(payload, value)],
    targets: [target("card", profile.targetDescription, payload.predicate)],
    targetKinds: ["card"],
    uncertainty: -10,
  };
}

function transformCardToRandomRewardComponent(args: {
  context: JourneyContext;
  drawContext?: DrawContext;
  label?: string;
  cardName?: string;
  reward: CompoundPayloadComponent;
}): CompoundPayloadComponent | undefined {
  const deckCandidates = resolveCardTargets(
    args.context.content,
    args.context.state.quest,
    { source: "deck" },
  );
  const preferredDeckCandidates = deckCandidates.filter(
    (candidate) => candidate.rarity !== "Starter",
  );
  const card = args.cardName
    ? exactCardByName(args.context, args.cardName)
    : args.drawContext && args.label
      ? shuffleDeterministic(
          args.drawContext,
          `${args.label}:transform-card-target`,
          preferredDeckCandidates.length > 0
            ? preferredDeckCandidates
            : deckCandidates,
        )[0]
      : undefined;

  if (!card) {
    return undefined;
  }

  const value = 105;

  return {
    role: "follow_up_operation",
    key: `compound:card-transform-random:${card.id}`,
    family: "transform_plus_reward",
    text: `Transform {${card.name}} into a random card.`,
    value,
    valueBand: compoundValueBand(value),
    polarity: "mixed",
    effects: [
      componentValue(
        namedCardPayload(
          {
            kind: "card_transform",
            target: card,
            source: "deck",
            extra: {
              resultSelection: "hidden_random",
              resultPredicate: { source: "catalog" },
              cardOperationFamily: "transform",
              compoundComponentRole: "follow_up_operation",
            },
          },
          args.context,
        ),
        value,
      ),
    ],
    targets: [cardExactTarget(card, "deck", `${card.name} in your deck`)],
    targetKinds: ["card", ...(args.reward.targetKinds ?? [])],
    uncertainty: -10,
  };
}

function transformDreamsignToRandomRewardComponent(args: {
  context: JourneyContext;
  dreamsignName?: string;
  drawContext?: DrawContext;
  label?: string;
  stage?: JourneyStage;
}): CompoundPayloadComponent | undefined {
  const dreamsign = args.dreamsignName
    ? exactDreamsignByName(args.context, args.dreamsignName)
    : args.drawContext && args.label && args.stage
      ? selectContentBackedDreamsign({
          context: args.context,
          drawContext: args.drawContext,
          label: args.label,
          stage: args.stage,
          sources: ["catalog"],
        })?.dreamsign
      : undefined;

  if (!dreamsign) {
    return undefined;
  }

  const value = Math.max(
    250,
    valueDreamsignOperation("transform", { random: true }),
  );

  return {
    role: "primary_reward",
    key: `compound:dreamsign-transform-random:${dreamsign.id}`,
    family: "transform_plus_reward",
    text: `Transform {${dreamsign.name}} into a random Dreamsign.`,
    value,
    valueBand: compoundValueBand(value),
    polarity: "mixed",
    effects: [
      componentValue(
        namedDreamsignPayload(
          {
            kind: "dreamsign_transform",
            dreamsign,
            source: "catalog",
            extra: {
              resultSelection: "hidden_random",
              resultPredicate: { source: "catalog" },
              dreamsignOperationFamily: "transform",
              compoundComponentRole: "primary_reward",
            },
          },
          args.context,
        ),
        value,
      ),
    ],
    targets: [dreamsignExactTarget(dreamsign, "catalog")],
    targetKinds: ["dreamsign"],
    uncertainty: -10,
  };
}

function resourceRewardFollowUp(amount: number): CompoundPayloadComponent {
  return {
    role: "follow_up_operation",
    key: `compound:essence-follow-up:${amount}`,
    family: "resource_follow_up_reward",
    text: `Gain ${amount} essence.`,
    value: amount,
    valueBand: compoundValueBand(amount),
    polarity: "positive",
    effects: [componentValue(gainEssence(amount), amount)],
  };
}

function starterCleanupRewardComponent(stage: JourneyStage): CompoundPayloadComponent {
  const cleanup = starterCleanup(1);
  const value = Math.max(320, valueStarterCleanup({ count: 1, stage }));

  return {
    role: "primary_reward",
    key: "compound:starter-cleanup",
    family: "starter_cleanup_reward",
    text: "Purge up to 1 chosen Starter card.",
    value,
    valueBand: compoundValueBand(value),
    polarity: "positive",
    effects: [componentValue(cleanup, value)],
    targets: [
      target("card", "Starter cards in deck", {
        source: "deck",
        starter: true,
      }),
    ],
    targetKinds: ["card"],
  };
}

function routeSideEffectComponent(args: {
  drawContext: DrawContext;
  label: string;
  maxEffect?: number;
}): CompoundPayloadComponent {
  const boundedRewards = args.maxEffect === undefined
    ? []
    : routeEditRewards({
        drawContext: args.drawContext,
        label: `${args.label}:bounded`,
        count: 16,
        operationKinds: ["add_site"],
        scopes: ["current_dreamscape"],
        polarities: ["positive"],
      }).filter((reward) => reward.effect <= args.maxEffect!);
  const routeReward = boundedRewards[0] ?? firstRouteEditReward({
    drawContext: args.drawContext,
    label: args.label,
    operationKinds: ["add_site"],
    polarities: ["positive"],
  });
  const value = routeReward.effect;

  return {
    role: "route_side_effect",
    key: `compound:route-side-effect:${routeReward.key}`,
    family: "route_side_effect",
    text: routeReward.text,
    value,
    valueBand: compoundValueBand(value),
    polarity: "positive",
    routeEffects: [componentValue(routeReward.payload, value)],
    targetKinds: ["route_site"],
  };
}

function delayedSideEffectComponent(): CompoundPayloadComponent {
  return {
    role: "delayed_side_effect",
    key: "compound:delayed-side-effect:omen",
    family: "delayed_side_effect",
    text: "After next victory, gain 1 omen.",
    value: 40,
    valueBand: "minor",
    polarity: "positive",
    triggers: [
      {
        kind: "after_next_victory",
        compoundComponentRole: "delayed_side_effect",
      },
    ],
    effects: [componentValue(gainOmen(1), valueOmenGain(1))],
    uncertainty: -8,
  };
}

function compoundContract(shapeId: JourneyShapeId): CompoundCompositionContract {
  const definition = getShapeDefinition(shapeId);

  return {
    shapeId,
    allowCosts: true,
    allowBurdens: true,
    allowRouteSideEffects: definition.allowsRouteSideEffects,
    allowDelayedSideEffects: true,
    allowFollowUpOperations: true,
    allowRouteOnlyReward: shapeId === "alter_dreamscapes",
    minimumUpside: 140,
    valueBands: ["standard", "premium"],
    allowedTargetKinds: ["card", "dreamsign", "route_site", "generated_object"],
  };
}

function compoundOption(
  number: number,
  contract: CompoundCompositionContract,
  components: readonly (CompoundPayloadComponent | undefined)[],
): ResolvedShapeFillOption | undefined {
  if (components.some((component) => component === undefined)) {
    return undefined;
  }

  return composeCompoundPayloadOption({
    number,
    contract,
    components: components as readonly CompoundPayloadComponent[],
  });
}

function scissorSaintCompoundFill(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  stage: JourneyStage;
  shapeId: JourneyShapeId;
}): ResolvedShapeFill | undefined {
  const contract = compoundContract(args.shapeId);
  const transfigurationName = pickSequentialVariant(
    args.drawContext,
    `${args.shapeId}:scissor-saint:transfiguration`,
    ALLOWED_TRANSFIGURATIONS,
  );
  const options = [
    compoundOption(
      1,
      contract,
      [
        cardSacrificeComponent({
          context: args.context,
          randomCharacter: true,
        }),
        namedDreamsignRewardComponent({
          context: args.context,
          drawContext: args.drawContext,
          label: `${args.shapeId}:scissor-saint:premium-dreamsign`,
          stage: args.stage,
          value: 400,
        }),
      ],
    ),
    compoundOption(
      2,
      contract,
      [
        cardSacrificeComponent({
          context: args.context,
          randomCharacter: true,
        }),
        cardDraftRewardComponent(args.context, CARD_DRAFT_PROFILES.survivors),
      ],
    ),
    compoundOption(
      3,
      contract,
      [
        dreamsignSacrificeComponent({
          context: args.context,
          drawContext: args.drawContext,
          label: `${args.shapeId}:scissor-saint:sacrificed-dreamsign`,
          stage: args.stage,
        }),
        transfigurationRewardComponent(transfigurationName, 420),
      ],
    ),
  ];

  if (options.some((entry) => entry === undefined)) {
    return undefined;
  }

  return {
    fillKind: "compound_payload:scissor_saint",
    options: options as ResolvedShapeFillOption[],
  };
}

function moltingArchiveCompoundFill(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  stage: JourneyStage;
  shapeId: JourneyShapeId;
}): ResolvedShapeFill | undefined {
  const contract = compoundContract(args.shapeId);
  const followUpAmount = pickSequentialVariant(
    args.drawContext,
    `${args.shapeId}:molting-archive:follow-up-essence`,
    [75, 90, 105],
  );
  const gingerRoot = namedDreamsignRewardComponent({
    context: args.context,
    drawContext: args.drawContext,
    label: `${args.shapeId}:molting-archive:dreamsign-reward`,
    stage: args.stage,
    value: 320,
  });
  const options = [
    compoundOption(
      1,
      contract,
      [
        transformDreamsignToRandomRewardComponent({
          context: args.context,
          drawContext: args.drawContext,
          label: `${args.shapeId}:molting-archive:dreamsign-transform`,
          stage: args.stage,
        }),
        resourceRewardFollowUp(followUpAmount),
      ],
    ),
    compoundOption(
      2,
      contract,
      [
        gingerRoot,
        transformCardToRandomRewardComponent({
          context: args.context,
          drawContext: args.drawContext,
          label: `${args.shapeId}:molting-archive:card-transform`,
          reward: gingerRoot ?? {
            role: "primary_reward",
            key: "missing",
            family: "missing",
            text: "",
            value: 0,
            valueBand: "minor",
            polarity: "positive",
          },
        }),
      ],
    ),
    compoundOption(
      3,
      contract,
      [
        cardSacrificeComponent({ context: args.context }),
        randomCardGainRewardComponent(CARD_DRAFT_PROFILES.energyGenerationCards, 3),
      ],
    ),
  ];

  if (options.some((entry) => entry === undefined)) {
    return undefined;
  }

  return {
    fillKind: "compound_payload:molting_archive",
    options: options as ResolvedShapeFillOption[],
  };
}

function witheredOrchardCompoundFill(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  stage: JourneyStage;
  shapeId: JourneyShapeId;
}): ResolvedShapeFill | undefined {
  const contract = compoundContract(args.shapeId);
  const battleRewardReductionAmount = pickSequentialVariant(
    args.drawContext,
    `${args.shapeId}:withered-orchard:battle-reduction`,
    [1, 1, 2],
  );
  const essenceRewardReductionAmount = pickSequentialVariant(
    args.drawContext,
    `${args.shapeId}:withered-orchard:essence-reduction`,
    [20, 30, 40],
  );
  const starterCleanupReductionAmount = pickSequentialVariant(
    args.drawContext,
    `${args.shapeId}:withered-orchard:starter-cleanup-reduction`,
    [15, 20, 25],
  );
  const battleRewardReductionDuration = rewardReductionDuration(
    args.drawContext,
    `${args.shapeId}:withered-orchard:battle-reduction`,
    "battle",
  );
  const essenceRewardReductionDuration = rewardReductionDuration(
    args.drawContext,
    `${args.shapeId}:withered-orchard:essence-reduction`,
    "essence_site",
  );
  const starterCleanupReductionDuration = rewardReductionDuration(
    args.drawContext,
    `${args.shapeId}:withered-orchard:starter-cleanup-reduction`,
    "essence_site",
  );
  const options = [
    compoundOption(
      1,
      contract,
      [
        rewardReductionBurdenComponent({
          trigger: "battle",
          amount: battleRewardReductionAmount,
          duration: battleRewardReductionDuration,
        }),
        namedDreamsignRewardComponent({
          context: args.context,
          drawContext: args.drawContext,
          label: `${args.shapeId}:withered-orchard:dreamsign-reward`,
          stage: args.stage,
          value: 320,
        }),
      ],
    ),
    compoundOption(
      2,
      contract,
      [
        rewardReductionBurdenComponent({
          trigger: "essence_site",
          amount: essenceRewardReductionAmount,
          duration: essenceRewardReductionDuration,
        }),
        namedCardRewardComponent({
          context: args.context,
          predicate: { rarity: "Legendary" },
          text: "Gain a Legendary card.",
        }),
      ],
    ),
    compoundOption(
      3,
      contract,
      [
        rewardReductionBurdenComponent({
          trigger: "essence_site",
          amount: starterCleanupReductionAmount,
          duration: starterCleanupReductionDuration,
        }),
        starterCleanupRewardComponent(args.stage),
      ],
    ),
  ];

  if (options.some((entry) => entry === undefined)) {
    return undefined;
  }

  return {
    fillKind: "compound_payload:withered_orchard",
    options: options as ResolvedShapeFillOption[],
  };
}

function mixedServiceCompoundFill(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  shapeId: JourneyShapeId;
}): ResolvedShapeFill | undefined {
  const contract = compoundContract(args.shapeId);
  const sharedCost = costSlots(
    args.context,
    args.drawContext,
    `${args.shapeId}:compound-mixed-cost`,
  ).find((slot) => slot.key === "low-essence") ??
    costSlots(
      args.context,
      args.drawContext,
      `${args.shapeId}:compound-mixed-cost`,
    ).find((slot) => (slot.cost ?? 0) > 0);
  const reward = namedDreamsignRewardComponent({
    context: args.context,
    drawContext: args.drawContext,
    label: `${args.shapeId}:compound-mixed-dreamsign`,
    stage: stageFromContext(args.context),
    value: 320,
  });
  const followUpAmount = pickSequentialVariant(
    args.drawContext,
    `${args.shapeId}:compound-mixed-follow-up-essence`,
    [55, 65, 75],
  );
  const costComponent = sharedCost
    ? {
        role: "cost" as const,
        key: `compound:cost:${sharedCost.key}`,
        family: "resource_cost",
        text: sharedCost.prefix,
        value: Math.abs(sharedCost.cost ?? 0),
        valueBand: compoundValueBand(sharedCost.cost ?? 0),
        polarity: "negative" as const,
        costs: sharedCost.costs?.map((entry) =>
          componentValue(entry as Record<string, unknown>, Math.abs(sharedCost.cost ?? 0))
        ),
      }
    : undefined;
  const options = [
    compoundOption(1, contract, [costComponent, reward]),
    compoundOption(2, contract, [
      reward,
      routeSideEffectComponent({
        drawContext: args.drawContext,
        label: `${args.shapeId}:compound-route`,
        maxEffect: 75,
      }),
    ]),
    compoundOption(3, contract, [
      reward,
      resourceRewardFollowUp(followUpAmount),
    ]),
  ];

  if (options.some((entry) => entry === undefined)) {
    return undefined;
  }

  return {
    fillKind: "compound_payload:mixed_service",
    options: options as ResolvedShapeFillOption[],
  };
}

export function compoundPayloadMenuFill(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  family?: "scissor_saint" | "molting_archive" | "withered_orchard" | "mixed_service";
  shapeId: JourneyShapeId;
  stage: JourneyStage;
}): ResolvedShapeFill | undefined {
  const family = args.family ??
    weightedChoice(
      args.drawContext,
      `${args.label}:compound-family`,
      [
        { item: "scissor_saint", weight: 3 },
        { item: "molting_archive", weight: 3 },
        { item: "withered_orchard", weight: 3 },
        { item: "mixed_service", weight: 1 },
      ] as const,
    );
  const fillArgs = {
    context: args.context,
    drawContext: args.drawContext,
    stage: args.stage,
    shapeId: args.shapeId,
  };

  switch (family) {
    case "scissor_saint":
      return scissorSaintCompoundFill(fillArgs);
    case "molting_archive":
      return moltingArchiveCompoundFill(fillArgs);
    case "withered_orchard":
      return witheredOrchardCompoundFill(fillArgs);
    case "mixed_service":
      return mixedServiceCompoundFill(fillArgs);
  }
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
