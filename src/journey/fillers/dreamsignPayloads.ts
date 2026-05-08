import type { DreamsignContent } from "../../content/model.js";
import type { JourneyContext } from "../../quest/context.js";
import { weightedChoice, type DrawContext } from "../../util/rng.js";
import { resolveDreamsignTargets, type DreamsignTargetPredicate } from "../effects.js";
import type { JourneyStage, TargetResolutionOrigin } from "../manifest.js";

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

export function sourcePoolSizeForDreamsignSource(
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

  return dreamsign.tides.some((tide) => tides.has(tide.toLocaleLowerCase("en-US")));
}

function dreamsignIsActive(
  dreamsign: DreamsignContent,
  context: JourneyContext,
): boolean {
  return context.state.quest.activeDreamsigns.some((entry) => entry.dreamsignId === dreamsign.id);
}

function targetOriginForDreamsignSource(source: DreamsignSelectionSource): TargetResolutionOrigin {
  switch (source) {
    case "active":
      return "current_object";
    case "pool":
      return "dreamsign_pool_candidate";
    case "catalog":
      return "catalog_reward";
  }
}

function stageWeight(
  dreamsign: DreamsignContent,
  stage: JourneyStage,
): number {
  if (stage === "early") {
    return dreamsign.kind === "neutral" ? 3 : 2;
  }

  if (stage === "late") {
    return dreamsign.kind === "tidal" ? 4 : 2;
  }

  return 3;
}

export function dreamsignSelectionWeightHooks(
  dreamsign: DreamsignContent,
  context: JourneyContext,
  stage: JourneyStage,
  source: DreamsignSelectionSource,
): DreamsignSelectionWeightHooks {
  return {
    kind: dreamsign.kind === "tidal" ? 4 : 2,
    tideOverlap: dreamsignTideOverlap(dreamsign, context) ? 5 : 0,
    currentAvailability: dreamsignIsActive(dreamsign, context) ? 5 : source === "pool" ? 2 : 0,
    stage: stageWeight(dreamsign, stage),
  };
}

function dreamsignCandidateWeight(hooks: DreamsignSelectionWeightHooks): number {
  return Math.max(
    1,
    hooks.kind + hooks.tideOverlap + hooks.currentAvailability + hooks.stage,
  );
}

export function dreamsignExactTarget(
  dreamsign: DreamsignContent,
  source: "catalog" | "active" | "pool",
) {
  return {
    kind: "dreamsign",
    description: `${dreamsign.name} in Dreamsign ${source}`,
    predicate: {
      source,
      ids: [dreamsign.id],
      names: [dreamsign.name],
    },
    source,
    ids: [dreamsign.id],
    names: [dreamsign.name],
    selection: "exact",
    required: true,
  };
}

export function contentBackedDreamsignCandidates(args: {
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

export function selectContentBackedDreamsign(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage: JourneyStage;
  sources: readonly DreamsignSelectionSource[];
  predicate?: Omit<DreamsignTargetPredicate, "source">;
}): ContentBackedDreamsignSelection | undefined {
  const candidates = contentBackedDreamsignCandidates(args);

  if (candidates.length === 0) {
    return undefined;
  }

  return weightedChoice(
    args.drawContext,
    `${args.label}:content-backed-dreamsign`,
    candidates.map((candidate) => ({
      item: candidate,
      weight: candidate.weight,
    })),
  );
}

export function namedDreamsignPayload(
  args: {
    kind: string;
    dreamsign: DreamsignContent;
    source?: "catalog" | "active" | "pool";
    result?: DreamsignContent;
    resultSource?: "catalog" | "active" | "pool";
    extra?: Record<string, unknown>;
  },
  context: JourneyContext,
): Record<string, unknown> {
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
