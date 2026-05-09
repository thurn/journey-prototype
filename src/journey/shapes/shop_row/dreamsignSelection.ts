import type { JourneyContext } from "../../../quest/context.js";
import {
  shuffleDeterministic,
  weightedChoice,
  type DrawContext,
} from "../../../util/rng.js";
import {
  contentBackedDreamsignCandidates,
  selectedTides,
  type ContentBackedDreamsignSelection,
  type DreamsignSelectionSource,
} from "../../fillers/dreamsignPayloads.js";
import type { JourneyStage } from "../../manifest.js";

export type NamedDreamsignShopRowCoherenceRule =
  | "same_kind"
  | "same_tide_overlap"
  | "similar_value"
  | "curated_pool_tags";

export type NamedDreamsignShopRowCandidateGroup = {
  coherenceRule: NamedDreamsignShopRowCoherenceRule;
  coherenceKey: string;
  candidates: readonly ContentBackedDreamsignSelection[];
  weight: number;
};

export type NamedDreamsignShopRowSelection = {
  coherenceRule: NamedDreamsignShopRowCoherenceRule;
  coherenceKey: string;
  candidates: readonly ContentBackedDreamsignSelection[];
};

function normalizedTide(tide: string): string {
  return tide.toLocaleLowerCase("en-US");
}

function displayTide(tide: string): string {
  return tide.replace(/_/gu, " ");
}

function uniqueByDreamsignId(
  candidates: readonly ContentBackedDreamsignSelection[],
): ContentBackedDreamsignSelection[] {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    if (seen.has(candidate.dreamsign.id)) {
      return false;
    }

    seen.add(candidate.dreamsign.id);
    return true;
  });
}

function groupedDreamsignRows(args: {
  rule: NamedDreamsignShopRowCoherenceRule;
  entries: readonly {
    key: string;
    candidates: readonly ContentBackedDreamsignSelection[];
  }[];
  baseWeight: number;
}): NamedDreamsignShopRowCandidateGroup[] {
  return args.entries
    .map((entry) => ({
      coherenceRule: args.rule,
      coherenceKey: entry.key,
      candidates: uniqueByDreamsignId(entry.candidates),
      weight: args.baseWeight + entry.candidates.length,
    }))
    .filter((entry) => entry.candidates.length >= 3);
}

export function namedDreamsignShopRowCandidateGroups(args: {
  context: JourneyContext;
  stage: JourneyStage;
  sources?: readonly DreamsignSelectionSource[];
}): NamedDreamsignShopRowCandidateGroup[] {
  const candidates = contentBackedDreamsignCandidates({
    context: args.context,
    stage: args.stage,
    sources: args.sources ?? ["catalog"],
  });
  const selectedTideKeys = selectedTides(args.context);
  const allTideKeys = new Map<string, string>();

  for (const candidate of candidates) {
    for (const tide of candidate.dreamsign.tides) {
      allTideKeys.set(normalizedTide(tide), tide);
    }
  }

  const byKind = ["tidal", "neutral"].map((kind) => ({
    key: kind,
    candidates: candidates.filter((candidate) => candidate.dreamsign.kind === kind),
  }));
  const bySelectedTide = [...selectedTideKeys].map((tideKey) => ({
    key: displayTide(tideKey),
    candidates: candidates.filter((candidate) =>
      candidate.dreamsign.tides.some((tide) => normalizedTide(tide) === tideKey)
    ),
  }));
  const byAnyTide = [...allTideKeys.entries()].map(([tideKey, tide]) => ({
    key: displayTide(tide),
    candidates: candidates.filter((candidate) =>
      candidate.dreamsign.tides.some((entry) => normalizedTide(entry) === tideKey)
    ),
  }));
  const byValueProfile = [
    "tidal:quest",
    "tidal:battle",
    "tidal:general",
    "neutral:quest",
    "neutral:battle",
    "neutral:general",
  ].map((key) => {
    const [kind, orientation] = key.split(":");

    return {
      key,
      candidates: candidates.filter((candidate) =>
        candidate.dreamsign.kind === kind &&
        (candidate.dreamsign.orientation ?? "general") === orientation
      ),
    };
  });

  return [
    ...groupedDreamsignRows({
      rule: "curated_pool_tags",
      entries: bySelectedTide,
      baseWeight: 8,
    }),
    ...groupedDreamsignRows({
      rule: "same_tide_overlap",
      entries: byAnyTide,
      baseWeight: 6,
    }),
    ...groupedDreamsignRows({
      rule: "similar_value",
      entries: byValueProfile,
      baseWeight: 4,
    }),
    ...groupedDreamsignRows({
      rule: "same_kind",
      entries: byKind,
      baseWeight: 3,
    }),
  ];
}

export function selectNamedDreamsignShopRow(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage: JourneyStage;
  sources?: readonly DreamsignSelectionSource[];
  count?: number;
}): NamedDreamsignShopRowSelection | undefined {
  const count = args.count ?? 3;
  const groups = namedDreamsignShopRowCandidateGroups(args);

  if (groups.length === 0) {
    return undefined;
  }

  const group = weightedChoice(
    args.drawContext,
    `${args.label}:named-dreamsign-shop-group`,
    groups.map((candidateGroup) => ({
      item: candidateGroup,
      weight: candidateGroup.weight,
    })),
  );
  const candidates = shuffleDeterministic(
    args.drawContext,
    `${args.label}:named-dreamsign-shop-row`,
    group.candidates,
  ).slice(0, count);

  if (candidates.length < count) {
    return undefined;
  }

  return {
    coherenceRule: group.coherenceRule,
    coherenceKey: group.coherenceKey,
    candidates,
  };
}
