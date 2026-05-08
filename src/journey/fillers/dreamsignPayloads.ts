import type { DreamsignContent } from "../../content/model.js";
import type { JourneyContext } from "../../quest/context.js";
import { target } from "./shared.js";

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

export function dreamsignExactTarget(
  dreamsign: DreamsignContent,
  source: "catalog" | "active" | "pool",
) {
  return target("dreamsign", `${dreamsign.name} in Dreamsign ${source}`, {
    source,
    ids: [dreamsign.id],
    names: [dreamsign.name],
  });
}
