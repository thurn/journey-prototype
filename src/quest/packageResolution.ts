import { createHash } from "node:crypto";
import type {
  CardContent,
  ContentBundle,
  DreamcallerContent,
  DreamsignContent,
} from "../content/model.js";
import type { QuestState } from "../state/schema.js";

const DEFAULT_DREAMCALLER_ID = "60BD584B-5BC8-4EE7-8A98-CBB304EB71AB";
const MANDATORY_MIN_COPIES = 110;
const MANDATORY_MAX_COPIES = 150;
const LEGAL_MIN_COPIES = 175;
const LEGAL_MAX_COPIES = 225;
const PREFERRED_MIN_COPIES = 190;
const PREFERRED_MAX_COPIES = 210;

type DraftPoolEntry = { cardId: string; copies: number };

type Candidate = {
  selectedTides: string[];
  optionalSubset: string[];
  sortedOptionalKey: string;
  draftPool: DraftPoolEntry[];
  draftPoolSummary: QuestState["draftPoolSummary"];
};

export type PackageResolution = {
  selectedTides: string[];
  mandatoryTides: string[];
  optionalSubset: string[];
  draftPool: { cardId: string; copies: number }[];
  draftPoolSummary: QuestState["draftPoolSummary"];
  dreamsignPoolIds: string[];
  dreamsignPoolSummary: QuestState["dreamsignPoolSummary"];
};

function countTideOverlap(tides: string[], selectedTides: Set<string>): number {
  let overlapCount = 0;

  tides.forEach((tide) => {
    if (selectedTides.has(tide)) {
      overlapCount += 1;
    }
  });

  return overlapCount;
}

function buildDraftPool(
  cards: CardContent[],
  selectedTides: string[],
): { draftPool: DraftPoolEntry[]; draftPoolSummary: QuestState["draftPoolSummary"] } {
  const selectedTideSet = new Set(selectedTides);
  const draftPool = cards
    .filter((card) => card.rarity !== "Starter")
    .map((card) => {
      const copies = Math.min(countTideOverlap(card.tides, selectedTideSet), 2);

      return { card, copies };
    })
    .filter(({ copies }) => copies > 0)
    .sort((left, right) => {
      const cardNumberComparison = left.card.cardNumber - right.card.cardNumber;

      if (cardNumberComparison !== 0) {
        return cardNumberComparison;
      }

      return left.card.id.localeCompare(right.card.id, "en-US");
    })
    .map(({ card, copies }) => ({ cardId: card.id, copies }));

  return {
    draftPool,
    draftPoolSummary: {
      totalCopies: draftPool.reduce((total, entry) => total + entry.copies, 0),
      uniqueCards: draftPool.length,
      oneCopyCards: draftPool.filter((entry) => entry.copies === 1).length,
      twoCopyCards: draftPool.filter((entry) => entry.copies === 2).length,
    },
  };
}

function combinations(values: string[], size: number): string[][] {
  const result: string[][] = [];

  function visit(startIndex: number, partial: string[]): void {
    if (partial.length === size) {
      result.push([...partial]);
      return;
    }

    for (
      let index = startIndex;
      index <= values.length - (size - partial.length);
      index += 1
    ) {
      partial.push(values[index] as string);
      visit(index + 1, partial);
      partial.pop();
    }
  }

  visit(0, []);
  return result;
}

function sortedOptionalKey(optionalSubset: string[]): string {
  return [...optionalSubset].sort((left, right) => left.localeCompare(right, "en-US")).join("|");
}

function selectBestCandidate(candidates: Candidate[]): Candidate | null {
  const preferredCandidates = candidates.filter(
    (candidate) =>
      candidate.draftPoolSummary.totalCopies >= PREFERRED_MIN_COPIES &&
      candidate.draftPoolSummary.totalCopies <= PREFERRED_MAX_COPIES,
  );
  const selectableCandidates = preferredCandidates.length > 0
    ? preferredCandidates
    : candidates;

  return [...selectableCandidates].sort((left, right) => {
    const copyComparison = right.draftPoolSummary.totalCopies -
      left.draftPoolSummary.totalCopies;

    if (copyComparison !== 0) {
      return copyComparison;
    }

    return left.sortedOptionalKey.localeCompare(right.sortedOptionalKey, "en-US");
  })[0] ?? null;
}

function dreamsignOverlaps(
  dreamsign: DreamsignContent,
  selectedTides: Set<string>,
): boolean {
  return dreamsign.kind === "tidal" &&
    dreamsign.tides.some((tide) => selectedTides.has(tide));
}

function buildDreamsignPool(
  dreamsigns: DreamsignContent[],
  selectedTides: string[],
): {
  dreamsignPoolIds: string[];
  dreamsignPoolSummary: QuestState["dreamsignPoolSummary"];
} {
  const selectedTideSet = new Set(selectedTides);
  const dreamsignPoolIds = dreamsigns
    .filter((dreamsign) => dreamsignOverlaps(dreamsign, selectedTideSet))
    .map((dreamsign) => dreamsign.id);

  return {
    dreamsignPoolIds,
    dreamsignPoolSummary: {
      tidalPoolCount: dreamsignPoolIds.length,
      neutralCatalogCount: dreamsigns.filter((dreamsign) => dreamsign.kind === "neutral").length,
    },
  };
}

function candidateForSubset(
  dreamcaller: DreamcallerContent,
  content: ContentBundle,
  optionalSubset: string[],
): Candidate | null {
  const selectedTides = [...dreamcaller.mandatoryTides, ...optionalSubset];
  const { draftPool, draftPoolSummary } = buildDraftPool(content.cards, selectedTides);

  if (
    draftPoolSummary.totalCopies < LEGAL_MIN_COPIES ||
    draftPoolSummary.totalCopies > LEGAL_MAX_COPIES
  ) {
    return null;
  }

  return {
    selectedTides,
    optionalSubset,
    sortedOptionalKey: sortedOptionalKey(optionalSubset),
    draftPool,
    draftPoolSummary,
  };
}

function resolveCandidateForDreamcaller(
  dreamcaller: DreamcallerContent,
  content: ContentBundle,
): Candidate | null {
  const mandatoryPool = buildDraftPool(content.cards, dreamcaller.mandatoryTides);

  if (
    mandatoryPool.draftPoolSummary.totalCopies < MANDATORY_MIN_COPIES ||
    mandatoryPool.draftPoolSummary.totalCopies > MANDATORY_MAX_COPIES
  ) {
    return null;
  }

  const candidates = [3, 4]
    .flatMap((size) => combinations(dreamcaller.optionalTides, size))
    .map((optionalSubset) => candidateForSubset(dreamcaller, content, optionalSubset))
    .filter((candidate): candidate is Candidate => candidate !== null);

  return selectBestCandidate(candidates);
}

function isLegalDreamcaller(
  dreamcaller: DreamcallerContent,
  content: ContentBundle,
): boolean {
  return resolveCandidateForDreamcaller(dreamcaller, content) !== null;
}

function seedIndex(seed: string, length: number): number {
  const digest = createHash("sha256").update(seed).digest();
  const numericValue = digest.readUInt32BE(0);

  return numericValue % length;
}

function stableDreamcallerComparison(
  left: DreamcallerContent,
  right: DreamcallerContent,
): number {
  const idComparison = left.id.localeCompare(right.id, "en-US");

  if (idComparison !== 0) {
    return idComparison;
  }

  return left.name.localeCompare(right.name, "en-US");
}

export function selectDreamcallerForSeed(
  seed: string,
  content: ContentBundle,
): DreamcallerContent {
  if (seed === "default") {
    const vaela = content.dreamcallers.find(
      (dreamcaller) => dreamcaller.id === DEFAULT_DREAMCALLER_ID,
    );

    if (!vaela) {
      throw new Error(`Default Dreamcaller ${DEFAULT_DREAMCALLER_ID} is missing`);
    }

    if (!isLegalDreamcaller(vaela, content)) {
      throw new Error(`Default Dreamcaller ${DEFAULT_DREAMCALLER_ID} is illegal`);
    }

    return vaela;
  }

  const legalDreamcallers = content.dreamcallers
    .filter((dreamcaller) => isLegalDreamcaller(dreamcaller, content))
    .sort(stableDreamcallerComparison);

  if (legalDreamcallers.length === 0) {
    throw new Error("No legal Dreamcallers are available");
  }

  return legalDreamcallers[seedIndex(seed, legalDreamcallers.length)] as DreamcallerContent;
}

export function resolvePackageForDreamcaller(
  dreamcaller: DreamcallerContent,
  content: ContentBundle,
): PackageResolution {
  const candidate = resolveCandidateForDreamcaller(dreamcaller, content);

  if (!candidate) {
    throw new Error(
      `Dreamcaller ${dreamcaller.id} ${dreamcaller.name} is not legal for quest initialization`,
    );
  }

  const { dreamsignPoolIds, dreamsignPoolSummary } = buildDreamsignPool(
    content.dreamsigns,
    candidate.selectedTides,
  );

  return {
    selectedTides: candidate.selectedTides,
    mandatoryTides: [...dreamcaller.mandatoryTides],
    optionalSubset: candidate.optionalSubset,
    draftPool: candidate.draftPool,
    draftPoolSummary: candidate.draftPoolSummary,
    dreamsignPoolIds,
    dreamsignPoolSummary,
  };
}
