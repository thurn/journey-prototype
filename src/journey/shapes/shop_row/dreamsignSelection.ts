import type { DreamsignContent } from "../../../content/model.js";
import type { JourneyContext } from "../../../quest/context.js";
import {
  resolveDreamsignTargets,
  type DreamsignTargetPredicate,
} from "../../effects.js";
import type { JourneyStage, TargetResolutionOrigin } from "../../manifest.js";
import {
  shuffleDeterministic,
  weightedChoice,
  type DrawContext,
} from "../../../util/rng.js";

export type DreamsignSelectionSource = "catalog" | "active" | "pool";

export type DreamsignSelectionWeightHooks = {
  kind: number;
  tideOverlap: number;
  currentAvailability: number;
  stage: number;
};

export type ContentBackedDreamsignSelection = {
  dreamsign: DreamsignContent;
  source: DreamsignSelectionSource;
  targetOrigin: TargetResolutionOrigin;
  weight: number;
  weightHooks: DreamsignSelectionWeightHooks;
};

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

function selectedTides(context: JourneyContext): Set<string> {
  return new Set(
    context.state.quest.selectedTides.map((tide) =>
      tide.toLocaleLowerCase("en-US"),
    ),
  );
}

function dreamsignTideOverlap(
  dreamsign: DreamsignContent,
  context: JourneyContext,
): boolean {
  const tides = selectedTides(context);

  return dreamsign.tides.some((tide) =>
    tides.has(tide.toLocaleLowerCase("en-US"))
  );
}

function dreamsignIsActive(
  dreamsign: DreamsignContent,
  context: JourneyContext,
): boolean {
  return context.state.quest.activeDreamsigns.some((entry) =>
    entry.dreamsignId === dreamsign.id
  );
}

function targetOriginForDreamsignSource(
  source: DreamsignSelectionSource,
): TargetResolutionOrigin {
  switch (source) {
    case "active":
      return "current_object";
    case "pool":
      return "dreamsign_pool_candidate";
    case "catalog":
      return "catalog_reward";
  }
}

function stageWeight(dreamsign: DreamsignContent, stage: JourneyStage): number {
  if (stage === "early") {
    return dreamsign.kind === "neutral" ? 3 : 2;
  }

  if (stage === "late") {
    return dreamsign.kind === "tidal" ? 4 : 2;
  }

  return 3;
}

function dreamsignSelectionWeightHooks(
  dreamsign: DreamsignContent,
  context: JourneyContext,
  stage: JourneyStage,
  source: DreamsignSelectionSource,
): DreamsignSelectionWeightHooks {
  return {
    kind: dreamsign.kind === "tidal" ? 4 : 2,
    tideOverlap: dreamsignTideOverlap(dreamsign, context) ? 5 : 0,
    currentAvailability: dreamsignIsActive(dreamsign, context)
      ? 5
      : source === "pool" ? 2 : 0,
    stage: stageWeight(dreamsign, stage),
  };
}

function dreamsignCandidateWeight(
  hooks: DreamsignSelectionWeightHooks,
): number {
  return Math.max(
    1,
    hooks.kind + hooks.tideOverlap + hooks.currentAvailability + hooks.stage,
  );
}

function contentBackedDreamsignCandidates(args: {
  context: JourneyContext;
  stage: JourneyStage;
  sources: readonly DreamsignSelectionSource[];
  predicate?: Omit<DreamsignTargetPredicate, "source">;
}): ContentBackedDreamsignSelection[] {
  const seen = new Set<string>();

  return args.sources.flatMap((source) => {
    const dreamsigns = resolveDreamsignTargets(
      args.context.content,
      args.context.state.quest,
      {
        source,
        ...(args.predicate ?? {}),
      },
    );

    return dreamsigns.flatMap((dreamsign) => {
      const key = `${source}:${dreamsign.id}`;

      if (seen.has(key)) {
        return [];
      }

      seen.add(key);

      const weightHooks = dreamsignSelectionWeightHooks(
        dreamsign,
        args.context,
        args.stage,
        source,
      );

      return [{
        dreamsign,
        source,
        targetOrigin: targetOriginForDreamsignSource(source),
        weight: dreamsignCandidateWeight(weightHooks),
        weightHooks,
      }];
    });
  });
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
