import type {
  CardContent,
  ContentBundle,
  DreamcallerContent,
  DreamsignContent,
  TideId,
} from "../content/model.js";
import type { QuestState } from "../state/schema.js";
import type {
  GeneratedObjectDefinition,
  JourneyManifest,
  JourneyOperation,
  TargetResolutionMetadata,
  TargetResolutionOrigin,
  TargetSelectionMode,
  TargetSelector,
} from "./manifest.js";

export const EFFECT_CATALOG_VERSION: "effects:v4" = "effects:v4";

export type EffectEntry = {
  readonly id: string;
  readonly family: string;
  readonly textTemplate: string;
  readonly tags: readonly string[];
  readonly versionContribution: EffectVersionContribution;
};

export type EffectVersionContribution = {
  readonly catalogVersion: typeof EFFECT_CATALOG_VERSION;
  readonly id: string;
  readonly family: string;
  readonly textTemplate: string;
  readonly tags: readonly string[];
};

export type CardTargetPredicate = {
  source?: "catalog" | "deck" | "draftPool";
  ids?: readonly string[];
  names?: readonly string[];
  cardType?: string;
  subtype?: string;
  energyCost?: number | "*";
  minEnergyCost?: number;
  maxEnergyCost?: number;
  rarity?: string;
  isFast?: boolean;
  spark?: number;
  renderedTextIncludes?: readonly string[] | string;
  tideOverlap?: readonly TideId[] | "selected";
  starter?: boolean;
  minCopies?: number;
  maxCopies?: number;
  minAbilityCount?: number;
  hasMultipleAbilities?: boolean;
};

export type DreamsignTargetPredicate = {
  source?: "catalog" | "active" | "pool";
  ids?: readonly string[];
  names?: readonly string[];
  kind?: DreamsignContent["kind"];
  tideOverlap?: readonly TideId[] | "selected";
};

export type BaneTargetPredicate = {
  source?: "vocabulary" | "state";
  names?: readonly BaneName[];
};

export type BaneTargetContext = {
  readonly baneNames: readonly BaneName[];
};

export type ImmediateCost = {
  essence?: number;
  omens?: number;
};

export type NamedReferenceSet = {
  cards?: readonly string[];
  dreamsigns?: readonly string[];
  dreamcallers?: readonly string[];
  banes?: readonly string[];
  rules?: readonly string[];
};

export type ReferenceValidationResult = {
  ok: boolean;
  errors: string[];
};

export const DEFAULT_BANE_NAME = "Nightmare";

export const BANE_NAMES = Object.freeze([
  "Nightmare",
  "Despair",
  "Oblivion",
  "Betrayal",
  "Envy",
  "Doubt",
  "Silence",
  "Paranoia",
  "Burden",
  "Paralysis",
  "Lethargy",
] as const);

export type BaneName = (typeof BANE_NAMES)[number];

export const STANDARD_TRANSFIGURATIONS = Object.freeze([
  "Viridian",
  "Golden",
  "Scarlet",
  "Bronze",
  "Prismatic",
] as const);

export const SITE_TYPES = Object.freeze([
  "Battle",
  "Draft",
  "Shop",
  "Specialty Shop",
  "Purge",
  "Transfiguration",
  "Dreamsign Offering",
  "Dream Journey",
] as const);

export const TIMING_TRIGGERS = Object.freeze([
  "immediate",
  "after next battle",
  "after next victory",
  "after two victories",
  "next dreamscape",
] as const);

export const BATTLE_KEYWORDS = Object.freeze([
  "Fast",
  "Reclaim",
  "Foresee",
  "Discover",
  "Materialize",
  "Banish",
  "Dissolve",
  "Abandon",
  "Copy",
  "Echo",
  "Kindle",
] as const);

export const STATUS_SCOPES = Object.freeze([
  "quest",
  "battle",
  "shop",
  "dreamwell",
  "route",
  "reward",
] as const);

export const GENERATED_OBJECT_REFERENCE_KINDS = Object.freeze([
  "definition",
  "placeholder",
] as const);

export const GENERATED_OBJECT_KINDS = Object.freeze([
  "card",
  "dreamsign",
  "status",
  "transfiguration",
] as const);

export const ALLOWED_RULES_VOCABULARY = Object.freeze({
  resources: Object.freeze(["essence", "max essence", "omens"] as const),
  siteTypes: SITE_TYPES,
  banes: BANE_NAMES,
  transfigurations: STANDARD_TRANSFIGURATIONS,
  timingsAndTriggers: TIMING_TRIGGERS,
  battleKeywords: BATTLE_KEYWORDS,
  statusScopes: STATUS_SCOPES,
  generatedObjectReferenceKinds: GENERATED_OBJECT_REFERENCE_KINDS,
  generatedObjectKinds: GENERATED_OBJECT_KINDS,
});

const EFFECT_DEFINITIONS = [
  {
    id: "essence-gain",
    family: "essence",
    textTemplate: "Gain {amount} essence.",
    tags: ["reward", "resource", "immediate"],
  },
  {
    id: "essence-loss",
    family: "essence",
    textTemplate: "Lose {amount} essence.",
    tags: ["cost", "resource", "immediate"],
  },
  {
    id: "essence-cap",
    family: "essence",
    textTemplate: "Increase max essence by {amount}.",
    tags: ["reward", "resource", "persistent"],
  },
  {
    id: "essence-restoration",
    family: "essence",
    textTemplate: "Restore essence to full.",
    tags: ["reward", "resource", "immediate"],
  },
  {
    id: "essence-scaled",
    family: "essence",
    textTemplate: "Gain {amount} essence for each {scalingUnit}.",
    tags: ["reward", "resource", "scaled"],
  },
  {
    id: "omen-gain",
    family: "omen",
    textTemplate: "Gain {amount} omens.",
    tags: ["reward", "resource", "immediate"],
  },
  {
    id: "omen-loss",
    family: "omen",
    textTemplate: "Lose {amount} omens.",
    tags: ["cost", "resource", "immediate"],
  },
  {
    id: "card-draft",
    family: "card",
    textTemplate: "Draft {takeCount} of {choiceCount} {predicate} cards.",
    tags: ["reward", "card", "choice"],
  },
  {
    id: "card-gain",
    family: "card",
    textTemplate: "Gain {cardName}.",
    tags: ["reward", "card", "named-reference"],
  },
  {
    id: "card-pack",
    family: "card",
    textTemplate: "Add {count} random {predicate} cards to your draft choices.",
    tags: ["reward", "card", "random"],
  },
  {
    id: "card-replacement",
    family: "card",
    textTemplate: "Replace {oldCardName} with {newCardName}.",
    tags: ["reward", "card", "named-reference"],
  },
  {
    id: "chosen-purge",
    family: "purge",
    textTemplate: "Purge up to {count} chosen {predicate} cards.",
    tags: ["reward", "purge", "choice"],
  },
  {
    id: "random-purge",
    family: "purge",
    textTemplate: "Purge {count} random {predicate} cards.",
    tags: ["reward", "purge", "random"],
  },
  {
    id: "starter-cleanup",
    family: "purge",
    textTemplate: "Purge up to {count} chosen Starter cards.",
    tags: ["reward", "purge", "starter"],
  },
  {
    id: "bane-gain",
    family: "bane",
    textTemplate: "Gain {count} {baneName}.",
    tags: ["burden", "bane", "named-bane"],
  },
  {
    id: "bane-purge",
    family: "bane",
    textTemplate: "Purge up to {count} chosen Banes.",
    tags: ["reward", "bane", "purge"],
  },
  {
    id: "bane-replace",
    family: "bane",
    textTemplate: "Replace {baneName} with {newBaneName}.",
    tags: ["reward", "bane", "replacement"],
  },
  {
    id: "bane-transform-to-card",
    family: "bane",
    textTemplate: "Transform {baneName} into {cardName}.",
    tags: ["reward", "bane", "card", "transform"],
  },
  {
    id: "resource-edge",
    family: "resource",
    textTemplate: "Resolve a typed resource edge case.",
    tags: ["reward", "cost", "resource", "typed"],
  },
  {
    id: "dreamsign-gain",
    family: "dreamsign",
    textTemplate: "Gain {dreamsignName}.",
    tags: ["reward", "dreamsign", "named-reference"],
  },
  {
    id: "dreamsign-draft",
    family: "dreamsign",
    textTemplate: "Choose 1 of {choiceCount} {predicate} Dreamsigns.",
    tags: ["reward", "dreamsign", "choice"],
  },
  {
    id: "dreamsign-transformation",
    family: "dreamsign",
    textTemplate: "Transform {dreamsignName} into {newDreamsignName}.",
    tags: ["reward", "dreamsign", "named-reference"],
  },
  {
    id: "dreamsign-loss",
    family: "dreamsign",
    textTemplate: "Lose {dreamsignName}.",
    tags: ["cost", "dreamsign", "named-reference"],
  },
  {
    id: "transfiguration-viridian",
    family: "transfiguration",
    textTemplate: "Apply Viridian to {targetText}.",
    tags: ["reward", "transfiguration", "standard"],
  },
  {
    id: "transfiguration-golden",
    family: "transfiguration",
    textTemplate: "Apply Golden to {targetText}.",
    tags: ["reward", "transfiguration", "standard"],
  },
  {
    id: "transfiguration-scarlet",
    family: "transfiguration",
    textTemplate: "Apply Scarlet to {targetText}.",
    tags: ["reward", "transfiguration", "standard"],
  },
  {
    id: "transfiguration-bronze",
    family: "transfiguration",
    textTemplate: "Apply Bronze to {targetText}.",
    tags: ["reward", "transfiguration", "standard"],
  },
  {
    id: "transfiguration-prismatic",
    family: "transfiguration",
    textTemplate: "Apply Prismatic to {targetText}.",
    tags: ["reward", "transfiguration", "standard"],
  },
  {
    id: "card-rewrite-lower-cost",
    family: "card-rewrite",
    textTemplate: "Lower the cost of {targetText} by {amount}.",
    tags: ["reward", "card", "rewrite"],
  },
  {
    id: "card-rewrite-fast",
    family: "card-rewrite",
    textTemplate: "Add Fast to {targetText}.",
    tags: ["reward", "card", "battle-keyword"],
  },
  {
    id: "card-rewrite-reclaim",
    family: "card-rewrite",
    textTemplate: "Add Reclaim {amount} to {targetText}.",
    tags: ["reward", "card", "battle-keyword"],
  },
  {
    id: "card-duplicate",
    family: "card-mutation",
    textTemplate: "Duplicate {count} chosen {predicate} cards.",
    tags: ["reward", "card", "mutation"],
  },
  {
    id: "card-merge",
    family: "card-mutation",
    textTemplate: "Merge {firstTargetText} and {secondTargetText}.",
    tags: ["reward", "card", "mutation"],
  },
  {
    id: "card-split",
    family: "card-mutation",
    textTemplate: "Split {targetText} into two copies with divided text.",
    tags: ["reward", "card", "mutation"],
  },
  {
    id: "card-text-mutation",
    family: "card-mutation",
    textTemplate: "Replace one line of text on {targetText} with {newText}.",
    tags: ["reward", "card", "mutation"],
  },
  {
    id: "current-route-edit",
    family: "route",
    textTemplate: "Replace a {fromSite} site in the current dreamscape with a {toSite} site.",
    tags: ["reward", "route", "current"],
  },
  {
    id: "future-route-edit",
    family: "route",
    textTemplate: "Replace a {fromSite} site in the next dreamscape with a {toSite} site.",
    tags: ["reward", "route", "future"],
  },
  {
    id: "route-add-site",
    family: "route",
    textTemplate: "Add a {siteType} site to {routeScope}.",
    tags: ["reward", "route", "add"],
  },
  {
    id: "route-remove-site",
    family: "route",
    textTemplate: "Remove a {siteType} site from {routeScope}.",
    tags: ["reward", "route", "remove"],
  },
  {
    id: "route-purge-site",
    family: "route",
    textTemplate: "Purge {siteType} sites from {routeScope}.",
    tags: ["reward", "route", "purge"],
  },
  {
    id: "route-probability-adjust",
    family: "route",
    textTemplate: "Adjust future {siteType} site probability by {probabilityDeltaPercent}%.",
    tags: ["reward", "route", "probability"],
  },
  {
    id: "shop-economy-modifier",
    family: "shop",
    textTemplate: "Apply {economyOperationKind} to {shopScope}.",
    tags: ["reward", "shop", "economy"],
  },
  {
    id: "dreamwell-modifier",
    family: "dreamwell",
    textTemplate: "Apply {dreamwellOperationKind} to the Dreamwell.",
    tags: ["reward", "dreamwell", "battle"],
  },
  {
    id: "status-rule-mutation",
    family: "status",
    textTemplate: "Create {statusName} with {statusScope} scope.",
    tags: ["reward", "status", "rule"],
  },
  {
    id: "triggered-reward",
    family: "timing",
    textTemplate: "After {trigger}, {reward}.",
    tags: ["reward", "triggered", "delayed"],
  },
  {
    id: "delayed-reward",
    family: "timing",
    textTemplate: "At {timing}, {reward}.",
    tags: ["reward", "delayed"],
  },
  {
    id: "risk",
    family: "risk",
    textTemplate: "Accept {riskText}. {reward}.",
    tags: ["risk", "reward"],
  },
  {
    id: "wager",
    family: "risk",
    textTemplate: "Pay {wagerText}. If you win, {reward}.",
    tags: ["risk", "cost", "reward"],
  },
  {
    id: "random-outcome",
    family: "random",
    textTemplate: "Roll for one: {outcomeA}, {outcomeB}, or {outcomeC}.",
    tags: ["random", "reward"],
  },
  {
    id: "take-any-number",
    family: "choice",
    textTemplate: "Take any number up to {count}: {menuText}.",
    tags: ["choice", "bounded", "sequential"],
  },
  {
    id: "push-your-luck",
    family: "risk",
    textTemplate: "Reach again: {reward}. {riskOrCost}.",
    tags: ["risk", "sequential"],
  },
  {
    id: "sequential-offer",
    family: "sequence",
    textTemplate: "Choose, then continue to offer {nextStep}.",
    tags: ["choice", "sequential"],
  },
] as const;

function freezeSerializable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(freezeSerializable));
  }

  if (value && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [
          key,
          freezeSerializable(nestedValue),
        ]),
      ),
    );
  }

  return value;
}

function effectVersionContribution(
  definition: (typeof EFFECT_DEFINITIONS)[number],
): EffectVersionContribution {
  return freezeSerializable({
    catalogVersion: EFFECT_CATALOG_VERSION,
    id: definition.id,
    family: definition.family,
    textTemplate: definition.textTemplate,
    tags: [...definition.tags],
  }) as EffectVersionContribution;
}

export const EFFECT_CATALOG: readonly EffectEntry[] = Object.freeze(
  EFFECT_DEFINITIONS.map((definition) =>
    Object.freeze({
      ...definition,
      tags: Object.freeze([...definition.tags]),
      versionContribution: effectVersionContribution(definition),
    }),
  ),
);

const NORMALIZED_BANE_NAMES = new Set(BANE_NAMES.map(normalizeKey));
const ALLOWED_RULES = new Set(
  [
    ...ALLOWED_RULES_VOCABULARY.resources,
    ...ALLOWED_RULES_VOCABULARY.siteTypes,
    ...ALLOWED_RULES_VOCABULARY.banes,
    ...ALLOWED_RULES_VOCABULARY.transfigurations,
    ...ALLOWED_RULES_VOCABULARY.timingsAndTriggers,
    ...ALLOWED_RULES_VOCABULARY.battleKeywords,
    ...ALLOWED_RULES_VOCABULARY.statusScopes,
    ...ALLOWED_RULES_VOCABULARY.generatedObjectReferenceKinds,
    ...ALLOWED_RULES_VOCABULARY.generatedObjectKinds,
  ].map(normalizeKey),
);

function normalizeKey(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function idOrNameMatches(value: { id: string; name: string }, references?: readonly string[]): boolean {
  if (!references || references.length === 0) {
    return true;
  }

  const id = normalizeKey(value.id);
  const name = normalizeKey(value.name);

  return references.some((reference) => {
    const normalized = normalizeKey(reference);

    return normalized === id || normalized === name;
  });
}

function contentById<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function selectedTideSet(quest: QuestState, tideOverlap: readonly TideId[] | "selected"): Set<string> {
  const tides = tideOverlap === "selected" ? quest.selectedTides : tideOverlap;

  return new Set(tides.map(normalizeKey));
}

function hasTideOverlap(sourceTides: readonly TideId[], wantedTides: Set<string>): boolean {
  return sourceTides.some((tide) => wantedTides.has(normalizeKey(tide)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFast(card: CardContent): boolean {
  return card.raw["is-fast"] === true || card.raw.isFast === true;
}

function subtypeMatches(card: CardContent, subtype: string | undefined): boolean {
  if (subtype === undefined) {
    return true;
  }

  return String(card.raw.subtype ?? "").toLowerCase() === subtype.toLowerCase();
}

function renderedTextMatches(
  card: CardContent,
  renderedTextIncludes: readonly string[] | string | undefined,
): boolean {
  if (renderedTextIncludes === undefined) {
    return true;
  }

  const requiredText = Array.isArray(renderedTextIncludes)
    ? renderedTextIncludes
    : [renderedTextIncludes];
  const renderedText = String(card.raw["rendered-text"] ?? card.raw.renderedText ?? "").toLowerCase();

  return requiredText.every((text) => renderedText.includes(text.toLowerCase()));
}

function abilityCount(card: CardContent): number {
  const renderedText = String(card.raw["rendered-text"] ?? card.raw.renderedText ?? "");
  const markerMatches = [...renderedText.matchAll(/▸\s*([^:]+):/gu)];

  if (markerMatches.length === 0) {
    return renderedText.trim().length > 0 ? 1 : 0;
  }

  return markerMatches.reduce((total, match) => {
    const labels = match[1]
      ?.split(",")
      .map((label) => label.trim())
      .filter((label) => label.length > 0);

    return total + Math.max(1, labels?.length ?? 1);
  }, 0);
}

function numericCostMatches(card: CardContent, predicate: CardTargetPredicate): boolean {
  if (predicate.energyCost !== undefined && card.energyCost !== predicate.energyCost) {
    return false;
  }

  if (typeof card.energyCost !== "number") {
    return predicate.minEnergyCost === undefined && predicate.maxEnergyCost === undefined;
  }

  if (predicate.minEnergyCost !== undefined && card.energyCost < predicate.minEnergyCost) {
    return false;
  }

  if (predicate.maxEnergyCost !== undefined && card.energyCost > predicate.maxEnergyCost) {
    return false;
  }

  return true;
}

function cardCopiesInSource(
  card: CardContent,
  quest: QuestState,
  predicate: CardTargetPredicate,
): number {
  if (predicate.source === "deck" || predicate.starter === true) {
    return quest.deck.entries.find((entry) => entry.cardId === card.id)?.copies ?? 0;
  }

  if (predicate.source === "draftPool") {
    return quest.draftPool.find((entry) => entry.cardId === card.id)?.copies ?? 0;
  }

  return 1;
}

function copyCountMatches(
  card: CardContent,
  quest: QuestState,
  predicate: CardTargetPredicate,
): boolean {
  const copies = cardCopiesInSource(card, quest, predicate);

  if (predicate.minCopies !== undefined && copies < predicate.minCopies) {
    return false;
  }

  if (predicate.maxCopies !== undefined && copies > predicate.maxCopies) {
    return false;
  }

  return true;
}

function abilityCountMatches(card: CardContent, predicate: CardTargetPredicate): boolean {
  const count = abilityCount(card);

  if (predicate.minAbilityCount !== undefined && count < predicate.minAbilityCount) {
    return false;
  }

  if (predicate.hasMultipleAbilities === true && count < 2) {
    return false;
  }

  if (predicate.hasMultipleAbilities === false && count >= 2) {
    return false;
  }

  return true;
}

function candidateCards(
  content: ContentBundle,
  quest: QuestState,
  predicate: CardTargetPredicate,
): CardContent[] {
  if (predicate.source === "deck" || predicate.starter === true) {
    const cardsById = contentById(content.cards);

    return quest.deck.entries.flatMap((entry) => {
      const card = cardsById.get(entry.cardId);

      return card ? [card] : [];
    });
  }

  if (predicate.source === "draftPool") {
    const cardsById = contentById(content.cards);

    return quest.draftPool.flatMap((entry) => {
      const card = cardsById.get(entry.cardId);

      return card ? [card] : [];
    });
  }

  return [...content.cards];
}

export function resolveCardTargets(
  content: ContentBundle,
  quest: QuestState,
  predicate: CardTargetPredicate = {},
): CardContent[] {
  const tideOverlap = predicate.tideOverlap === undefined
    ? null
    : selectedTideSet(quest, predicate.tideOverlap);

  return candidateCards(content, quest, predicate)
    .filter((card) => idOrNameMatches(card, predicate.ids))
    .filter((card) => idOrNameMatches(card, predicate.names))
    .filter((card) => predicate.cardType === undefined || card.cardType === predicate.cardType)
    .filter((card) => subtypeMatches(card, predicate.subtype))
    .filter((card) => numericCostMatches(card, predicate))
    .filter((card) => predicate.rarity === undefined || card.rarity === predicate.rarity)
    .filter((card) => predicate.isFast === undefined || isFast(card) === predicate.isFast)
    .filter((card) => predicate.spark === undefined || card.spark === predicate.spark)
    .filter((card) => renderedTextMatches(card, predicate.renderedTextIncludes))
    .filter((card) => !predicate.starter || card.rarity === "Starter")
    .filter((card) => tideOverlap === null || hasTideOverlap(card.tides, tideOverlap))
    .filter((card) => copyCountMatches(card, quest, predicate))
    .filter((card) => abilityCountMatches(card, predicate))
    .sort((left, right) => {
      const cardNumberComparison = left.cardNumber - right.cardNumber;

      if (cardNumberComparison !== 0) {
        return cardNumberComparison;
      }

      return left.id.localeCompare(right.id, "en-US");
    });
}

function candidateDreamsigns(
  content: ContentBundle,
  quest: QuestState,
  predicate: DreamsignTargetPredicate,
): DreamsignContent[] {
  const dreamsignsById = contentById(content.dreamsigns);

  if (predicate.source === "active") {
    return quest.activeDreamsigns.flatMap((entry) => {
      const dreamsign = dreamsignsById.get(entry.dreamsignId);

      return dreamsign ? [dreamsign] : [];
    });
  }

  if (predicate.source === "pool") {
    return quest.dreamsignPoolIds.flatMap((dreamsignId) => {
      const dreamsign = dreamsignsById.get(dreamsignId);

      return dreamsign ? [dreamsign] : [];
    });
  }

  return [...content.dreamsigns];
}

export function resolveDreamsignTargets(
  content: ContentBundle,
  quest: QuestState,
  predicate: DreamsignTargetPredicate = {},
): DreamsignContent[] {
  const tideOverlap = predicate.tideOverlap === undefined
    ? null
    : selectedTideSet(quest, predicate.tideOverlap);

  return candidateDreamsigns(content, quest, predicate)
    .filter((dreamsign) => idOrNameMatches(dreamsign, predicate.ids))
    .filter((dreamsign) => idOrNameMatches(dreamsign, predicate.names))
    .filter((dreamsign) => predicate.kind === undefined || dreamsign.kind === predicate.kind)
    .filter((dreamsign) => tideOverlap === null || hasTideOverlap(dreamsign.tides, tideOverlap))
    .sort((left, right) => left.name.localeCompare(right.name, "en-US"));
}

const EMPTY_BANE_TARGET_CONTEXT: BaneTargetContext = Object.freeze({
  baneNames: Object.freeze([] as BaneName[]),
});

export function resolveBaneTargets(
  predicate: BaneTargetPredicate = {},
  context: BaneTargetContext = EMPTY_BANE_TARGET_CONTEXT,
): BaneName[] {
  const source = predicate.source === "state"
    ? context.baneNames
    : [...BANE_NAMES];
  const wanted = predicate.names === undefined
    ? null
    : new Set(predicate.names.map(normalizeKey));

  return [...new Set(source)].filter((name) => {
    if (!isBaneName(name)) {
      return false;
    }

    return wanted === null || wanted.has(normalizeKey(name));
  });
}

function selectedContentMetadata(
  items: readonly ({ id: string; name: string } & Record<string, unknown>)[],
  selector: { selection: TargetSelectionMode },
  sourcePool: string,
  targetOrigin: TargetResolutionOrigin,
): TargetResolutionMetadata["selected"] {
  if (selector.selection === "hidden_random") {
    return [];
  }

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    sourcePool,
    targetOrigin,
    ...(typeof item.kind === "string" ? { kind: item.kind } : {}),
    ...(typeof item.cardType === "string" ? { kind: item.cardType } : {}),
  }));
}

function selectedNameMetadata(
  names: readonly string[],
  selector: { selection: TargetSelectionMode },
  sourcePool: string,
  targetOrigin: TargetResolutionOrigin,
): TargetResolutionMetadata["selected"] {
  return selector.selection === "hidden_random"
    ? []
    : names.map((name) => ({ name, sourcePool, targetOrigin }));
}

function sourcePoolForCard(selector: Extract<TargetSelector, { selectorKind: "card" }>, predicate: CardTargetPredicate): string {
  return selector.source ?? predicate.source ?? "catalog";
}

function sourcePoolForDreamsign(
  selector: Extract<TargetSelector, { selectorKind: "dreamsign" }>,
  predicate: DreamsignTargetPredicate,
): string {
  return selector.source ?? predicate.source ?? "catalog";
}

function emptyReason(sourcePool: string): string {
  switch (sourcePool) {
    case "deck":
      return "empty_deck_or_no_matching_targets";
    case "draftPool":
      return "empty_draft_pool_or_no_matching_targets";
    case "active":
      return "empty_active_dreamsigns_or_no_matching_targets";
    case "pool":
      return "empty_dreamsign_pool_or_no_matching_targets";
    case "state":
      return "empty_state_pool_or_no_matching_targets";
    default:
      return "no_matching_targets";
  }
}

function targetOriginForSourcePool(
  selectorKind: TargetSelector["selectorKind"],
  sourcePool: string,
): TargetResolutionOrigin {
  if (selectorKind === "generated_object") {
    return "future_generated_object";
  }

  if (sourcePool === "deck" || sourcePool === "active") {
    return "current_object";
  }

  if (sourcePool === "draftPool") {
    return "draft_pool_candidate";
  }

  if (sourcePool === "pool") {
    return "dreamsign_pool_candidate";
  }

  if (sourcePool === "catalog") {
    return "catalog_reward";
  }

  if (sourcePool === "vocabulary") {
    return "controlled_vocabulary";
  }

  if (sourcePool === "state") {
    return "state_pool";
  }

  return "catalog_reference";
}

function metadata(args: {
  selectorKind: TargetSelector["selectorKind"];
  selection: TargetSelectionMode;
  sourcePool: string;
  targetOrigin?: TargetResolutionOrigin;
  candidateCount: number;
  selected: TargetResolutionMetadata["selected"];
}): TargetResolutionMetadata {
  const targetOrigin = args.targetOrigin ?? targetOriginForSourcePool(args.selectorKind, args.sourcePool);

  return {
    ...args,
    targetOrigin,
    selected: args.selected.map((selected) => ({
      ...selected,
      sourcePool: selected.sourcePool ?? args.sourcePool,
      targetOrigin: selected.targetOrigin ?? targetOrigin,
    })),
    ...(args.candidateCount === 0 ? { emptyReason: emptyReason(args.sourcePool) } : {}),
  };
}

function dreamcallerMatches(dreamcaller: DreamcallerContent, selector: Extract<TargetSelector, { selectorKind: "dreamcaller" }>): boolean {
  return idOrNameMatches(dreamcaller, selector.ids) && idOrNameMatches(dreamcaller, selector.names);
}

function generatedObjectMatches(
  generatedObject: GeneratedObjectDefinition,
  selector: Extract<TargetSelector, { selectorKind: "generated_object" }>,
): boolean {
  if (selector.generatedObjectId && generatedObject.generatedObjectId !== selector.generatedObjectId) {
    return false;
  }

  if (selector.generatedObjectKind && generatedObject.generatedObjectKind !== selector.generatedObjectKind) {
    return false;
  }

  if (selector.name && !idOrNameMatches({ id: generatedObject.generatedObjectId, name: generatedObject.name }, [selector.name])) {
    return false;
  }

  return true;
}

export function resolveTargetSelector(
  content: ContentBundle,
  quest: QuestState,
  selector: TargetSelector,
  generatedObjects: readonly GeneratedObjectDefinition[] = [],
): TargetResolutionMetadata {
  if (selector.selectorKind === "none") {
    return metadata({
      selectorKind: "none",
      selection: "exact",
      sourcePool: "none",
      targetOrigin: "catalog_reference",
      candidateCount: 0,
      selected: [],
    });
  }

  if (selector.selectorKind === "card") {
    const predicate = {
      ...(typeof selector.predicate === "object" && selector.predicate !== null ? selector.predicate : {}),
      ...(selector.source ? { source: selector.source } : {}),
      ...(selector.ids ? { ids: selector.ids } : {}),
      ...(selector.names ? { names: selector.names } : {}),
    } as CardTargetPredicate;
    const sourcePool = sourcePoolForCard(selector, predicate);
    const candidates = resolveCardTargets(content, quest, predicate);
    const targetOrigin = targetOriginForSourcePool(selector.selectorKind, sourcePool);

    return metadata({
      selectorKind: selector.selectorKind,
      selection: selector.selection,
      sourcePool,
      targetOrigin,
      candidateCount: candidates.length,
      selected: selectedContentMetadata(candidates, selector, sourcePool, targetOrigin),
    });
  }

  if (selector.selectorKind === "dreamsign") {
    const predicate = {
      ...(typeof selector.predicate === "object" && selector.predicate !== null ? selector.predicate : {}),
      ...(selector.source ? { source: selector.source } : {}),
      ...(selector.ids ? { ids: selector.ids } : {}),
      ...(selector.names ? { names: selector.names } : {}),
    } as DreamsignTargetPredicate;
    const sourcePool = sourcePoolForDreamsign(selector, predicate);
    const candidates = resolveDreamsignTargets(content, quest, predicate);
    const targetOrigin = targetOriginForSourcePool(selector.selectorKind, sourcePool);

    return metadata({
      selectorKind: selector.selectorKind,
      selection: selector.selection,
      sourcePool,
      targetOrigin,
      candidateCount: candidates.length,
      selected: selectedContentMetadata(candidates, selector, sourcePool, targetOrigin),
    });
  }

  if (selector.selectorKind === "dreamcaller") {
    const candidates = selector.source === "state"
      ? content.dreamcallers.filter((dreamcaller) =>
          dreamcaller.id === quest.dreamcaller.id && dreamcallerMatches(dreamcaller, selector)
        )
      : content.dreamcallers.filter((dreamcaller) => dreamcallerMatches(dreamcaller, selector));

    return metadata({
      selectorKind: selector.selectorKind,
      selection: selector.selection,
      sourcePool: selector.source ?? "catalog",
      targetOrigin: targetOriginForSourcePool(selector.selectorKind, selector.source ?? "catalog"),
      candidateCount: candidates.length,
      selected: selectedContentMetadata(
        candidates,
        selector,
        selector.source ?? "catalog",
        targetOriginForSourcePool(selector.selectorKind, selector.source ?? "catalog"),
      ),
    });
  }

  if (selector.selectorKind === "bane") {
    const candidates = resolveBaneTargets(
      {
        source: selector.source,
        names: selector.names as BaneName[] | undefined,
      },
      { baneNames: [] },
    );

    return metadata({
      selectorKind: selector.selectorKind,
      selection: selector.selection,
      sourcePool: selector.source ?? "vocabulary",
      targetOrigin: targetOriginForSourcePool(selector.selectorKind, selector.source ?? "vocabulary"),
      candidateCount: candidates.length,
      selected: selectedNameMetadata(
        candidates,
        selector,
        selector.source ?? "vocabulary",
        targetOriginForSourcePool(selector.selectorKind, selector.source ?? "vocabulary"),
      ),
    });
  }

  if (selector.selectorKind === "route_site") {
    const siteTypes = selector.siteTypes ?? (selector.siteType ? [selector.siteType] : [...SITE_TYPES]);
    const candidates = siteTypes.filter((siteType) => isAllowedRulesReference(siteType));

    return metadata({
      selectorKind: selector.selectorKind,
      selection: selector.selection,
      sourcePool: selector.scope ?? "route",
      targetOrigin: targetOriginForSourcePool(selector.selectorKind, selector.scope ?? "route"),
      candidateCount: candidates.length,
      selected: selectedNameMetadata(
        candidates,
        selector,
        selector.scope ?? "route",
        targetOriginForSourcePool(selector.selectorKind, selector.scope ?? "route"),
      ),
    });
  }

  if (selector.selectorKind === "status") {
    const candidates = isAllowedRulesReference(selector.scope)
      ? [selector.statusName ?? selector.statusId ?? selector.scope]
      : [];

    return metadata({
      selectorKind: selector.selectorKind,
      selection: selector.selection,
      sourcePool: selector.scope,
      targetOrigin: targetOriginForSourcePool(selector.selectorKind, selector.scope),
      candidateCount: candidates.length,
      selected: selectedNameMetadata(
        candidates,
        selector,
        selector.scope,
        targetOriginForSourcePool(selector.selectorKind, selector.scope),
      ),
    });
  }

  const candidates = generatedObjects.filter((generatedObject) => generatedObjectMatches(generatedObject, selector));
  const placeholderName = selector.name ?? selector.generatedObjectId ?? selector.generatedObjectKind ?? "generated object placeholder";
  const selected = candidates.length > 0
    ? candidates.map((generatedObject) => ({
        id: generatedObject.generatedObjectId,
        name: generatedObject.name,
        kind: generatedObject.generatedObjectKind,
        sourcePool: "manifest_generated",
        targetOrigin: "future_generated_object" as const,
      }))
    : selector.generatedObjectReferenceKind === "placeholder"
      ? [{
          id: selector.generatedObjectId,
          name: placeholderName,
          kind: selector.generatedObjectKind,
          sourcePool: "manifest_placeholder",
          targetOrigin: "future_generated_object" as const,
        }]
      : [];

  return metadata({
    selectorKind: selector.selectorKind,
    selection: selector.selection,
    sourcePool: selector.generatedObjectReferenceKind === "placeholder" ? "manifest_placeholder" : "manifest_generated",
    targetOrigin: "future_generated_object",
    candidateCount: selected.length,
    selected,
  });
}

function flattenOperationContracts(operations: readonly JourneyOperation[]): JourneyOperation[] {
  return operations.flatMap((operation) => [
    operation,
    ...(operation.operationKind === "delayed_hook" && Array.isArray(operation.rewardOperations)
      ? flattenOperationContracts(operation.rewardOperations)
      : []),
  ]);
}

function rootOperationsForGeneratedObjectResolver(manifest: JourneyManifest): JourneyOperation[] {
  const optionOperations = Array.isArray(manifest.options)
    ? manifest.options.flatMap((option) =>
        isRecord(option) && Array.isArray(option.operations)
          ? option.operations as JourneyOperation[]
          : []
      )
    : [];
  const precommittedOperations = isRecord(manifest.precommitted) && Array.isArray(manifest.precommitted.operations)
    ? manifest.precommitted.operations as JourneyOperation[]
    : [];
  const rewardPoolOperations = isRecord(manifest.rewardPool) && Array.isArray(manifest.rewardPool.operations)
    ? manifest.rewardPool.operations as JourneyOperation[]
    : [];
  const treeOperations = isRecord(manifest.tree) && Array.isArray(manifest.tree.nodes)
    ? manifest.tree.nodes.flatMap((node) =>
        isRecord(node) && Array.isArray(node.branches)
          ? node.branches.flatMap((branch) => [
              ...(isRecord(branch) && Array.isArray(branch.operations)
                ? branch.operations as JourneyOperation[]
                : []),
              ...(isRecord(branch) && isRecord(branch.terminal) && Array.isArray(branch.terminal.operations)
                ? branch.terminal.operations as JourneyOperation[]
                : []),
            ])
          : []
      )
    : [];

  return flattenOperationContracts([
    ...optionOperations,
    ...precommittedOperations,
    ...rewardPoolOperations,
    ...treeOperations,
  ]);
}

export function generatedObjectResolverPool(manifest: JourneyManifest): GeneratedObjectDefinition[] {
  const manifestGeneratedObjects = Array.isArray(manifest.generatedObjects)
    ? manifest.generatedObjects
    : [];

  return [
    ...manifestGeneratedObjects,
    ...rootOperationsForGeneratedObjectResolver(manifest).flatMap((operation) =>
      operation.operationKind === "generated_object" ? [operation.generatedObject] : []
    ),
  ];
}

function withTargetResolutionMetadata(
  operations: readonly JourneyOperation[],
  content: ContentBundle,
  quest: QuestState,
  generatedObjects: readonly GeneratedObjectDefinition[],
): JourneyOperation[] {
  return operations.map((operation) => {
    if (!operation.targetSelector) {
      return operation;
    }

    return {
      ...operation,
      targetResolution: resolveTargetSelector(content, quest, operation.targetSelector, generatedObjects),
    } as JourneyOperation;
  });
}

export function attachTargetResolutionMetadata(
  manifest: JourneyManifest,
  content: ContentBundle,
  quest: QuestState,
): JourneyManifest {
  const generatedObjects = generatedObjectResolverPool(manifest);

  return {
    ...manifest,
    options: manifest.options.map((option) => ({
      ...option,
      operations: withTargetResolutionMetadata(option.operations, content, quest, generatedObjects),
    })),
    ...(manifest.tree
      ? {
          tree: {
            ...manifest.tree,
            nodes: manifest.tree.nodes.map((node) => ({
              ...node,
              branches: node.branches.map((branch) => ({
                ...branch,
                operations: withTargetResolutionMetadata(branch.operations, content, quest, generatedObjects),
                ...(branch.terminal
                  ? {
                      terminal: {
                        ...branch.terminal,
                        operations: withTargetResolutionMetadata(branch.terminal.operations, content, quest, generatedObjects),
                      },
                    }
                  : {}),
              })),
            })),
          },
        }
      : {}),
    ...(manifest.rewardPool
      ? {
          rewardPool: {
            ...manifest.rewardPool,
            operations: withTargetResolutionMetadata(manifest.rewardPool.operations, content, quest, generatedObjects),
          },
        }
      : {}),
    precommitted: {
      ...manifest.precommitted,
      ...(manifest.precommitted.operations
        ? { operations: withTargetResolutionMetadata(manifest.precommitted.operations, content, quest, generatedObjects) }
        : {}),
    },
  };
}

export function isImmediateCostPayable(
  quest: QuestState,
  cost: ImmediateCost,
): boolean {
  return (
    (cost.essence === undefined || quest.resources.essence >= cost.essence) &&
    (cost.omens === undefined || quest.resources.omens >= cost.omens)
  );
}

export function resolveCardReference(
  content: ContentBundle,
  reference: string,
): CardContent | null {
  return (
    content.cards.find((card) => idOrNameMatches(card, [reference])) ?? null
  );
}

export function resolveDreamsignReference(
  content: ContentBundle,
  reference: string,
): DreamsignContent | null {
  return (
    content.dreamsigns.find((dreamsign) => idOrNameMatches(dreamsign, [reference])) ??
    null
  );
}

export function resolveDreamcallerReference(
  content: ContentBundle,
  reference: string,
): DreamcallerContent | null {
  return (
    content.dreamcallers.find((dreamcaller) => idOrNameMatches(dreamcaller, [reference])) ??
    null
  );
}

export function isBaneName(name: string): name is BaneName {
  return NORMALIZED_BANE_NAMES.has(normalizeKey(name));
}

export function isAllowedRulesReference(reference: string): boolean {
  return ALLOWED_RULES.has(normalizeKey(reference));
}

function pushMissingReferences(
  errors: string[],
  kind: string,
  references: readonly string[] | undefined,
  resolver: (reference: string) => unknown,
): void {
  references?.forEach((reference) => {
    if (!resolver(reference)) {
      errors.push(`Unresolved ${kind} reference: ${reference}`);
    }
  });
}

export function validateNamedReferences(
  content: ContentBundle,
  references: NamedReferenceSet,
): ReferenceValidationResult {
  const errors: string[] = [];

  pushMissingReferences(errors, "card", references.cards, (reference) =>
    resolveCardReference(content, reference),
  );
  pushMissingReferences(errors, "Dreamsign", references.dreamsigns, (reference) =>
    resolveDreamsignReference(content, reference),
  );
  pushMissingReferences(
    errors,
    "Dreamcaller",
    references.dreamcallers,
    (reference) => resolveDreamcallerReference(content, reference),
  );
  pushMissingReferences(errors, "Bane", references.banes, (reference) =>
    isBaneName(reference),
  );
  pushMissingReferences(errors, "rules vocabulary", references.rules, (reference) =>
    isAllowedRulesReference(reference),
  );

  return {
    ok: errors.length === 0,
    errors,
  };
}
