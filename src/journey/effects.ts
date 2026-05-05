import type {
  CardContent,
  ContentBundle,
  DreamcallerContent,
  DreamsignContent,
  TideId,
} from "../content/model.js";
import type { QuestState } from "../state/schema.js";

export const EFFECT_CATALOG_VERSION: "effects:v1" = "effects:v1";

export type EffectEntry = {
  id: string;
  family: string;
  textTemplate: string;
  tags: string[];
  versionContribution: unknown;
};

export type CardTargetPredicate = {
  source?: "catalog" | "deck" | "draftPool";
  ids?: readonly string[];
  names?: readonly string[];
  cardType?: string;
  energyCost?: number | "*";
  minEnergyCost?: number;
  maxEnergyCost?: number;
  rarity?: string;
  isFast?: boolean;
  spark?: number;
  tideOverlap?: readonly TideId[] | "selected";
  starter?: boolean;
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
  "Draft",
  "Shop",
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

export const ALLOWED_RULES_VOCABULARY = Object.freeze({
  resources: Object.freeze(["essence", "max essence", "omens"] as const),
  siteTypes: SITE_TYPES,
  banes: BANE_NAMES,
  transfigurations: STANDARD_TRANSFIGURATIONS,
  timingsAndTriggers: TIMING_TRIGGERS,
  battleKeywords: BATTLE_KEYWORDS,
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
    textTemplate: "Gain {count} Nightmare.",
    tags: ["burden", "bane", "default-nightmare"],
  },
  {
    id: "bane-purge",
    family: "bane",
    textTemplate: "Purge up to {count} chosen Banes.",
    tags: ["reward", "bane", "purge"],
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
    textTemplate: "Choose one of {choiceCount} {predicate} Dreamsigns.",
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
    id: "take-up-to-n",
    family: "choice",
    textTemplate: "Take up to {count}: {menuText}.",
    tags: ["choice", "bounded"],
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

export const EFFECT_CATALOG: readonly EffectEntry[] = Object.freeze(
  EFFECT_DEFINITIONS.map((definition) =>
    Object.freeze({
      ...definition,
      tags: [...definition.tags],
      versionContribution: Object.freeze({
        id: definition.id,
        family: definition.family,
        textTemplate: definition.textTemplate,
        tags: [...definition.tags],
      }),
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

function isFast(card: CardContent): boolean {
  return card.raw["is-fast"] === true || card.raw.isFast === true;
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
    .filter((card) => numericCostMatches(card, predicate))
    .filter((card) => predicate.rarity === undefined || card.rarity === predicate.rarity)
    .filter((card) => predicate.isFast === undefined || isFast(card) === predicate.isFast)
    .filter((card) => predicate.spark === undefined || card.spark === predicate.spark)
    .filter((card) => !predicate.starter || card.rarity === "Starter")
    .filter((card) => tideOverlap === null || hasTideOverlap(card.tides, tideOverlap))
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

function stateBaneNames(quest: QuestState): BaneName[] {
  const stateSurface = quest as QuestState & {
    banes?: unknown;
    baneNames?: unknown;
    route: QuestState["route"] & {
      banes?: unknown;
      baneNames?: unknown;
    };
  };
  const source = stateSurface.banes ??
    stateSurface.baneNames ??
    stateSurface.route.banes ??
    stateSurface.route.baneNames ??
    [];

  if (!Array.isArray(source)) {
    return [];
  }

  return source.flatMap((entry) => {
    const name = typeof entry === "string"
      ? entry
      : entry &&
        typeof entry === "object" &&
        "name" in entry &&
        typeof entry.name === "string"
        ? entry.name
        : null;

    if (name === null || !isBaneName(name)) {
      return [];
    }

    return [name];
  });
}

export function resolveBaneTargets(
  quest: QuestState,
  predicate: BaneTargetPredicate = {},
): BaneName[] {
  const source = predicate.source === "state"
    ? stateBaneNames(quest)
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
