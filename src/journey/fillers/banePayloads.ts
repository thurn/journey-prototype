export type BaneTargetContextId =
  | "current_state"
  | "future_burden"
  | "manifest_obligation";

export type BaneSelectionMode =
  | "exact"
  | "chosen_after_commitment"
  | "visible_random";

export function banePayload(args: {
  kind: string;
  baneName: string;
  count?: number;
  targetContext?: BaneTargetContextId;
  selection?: BaneSelectionMode;
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

export function baneGainPayload(args: {
  baneName: string;
  count?: number;
  targetContext?: BaneTargetContextId;
  timing?: string;
  temporary?: boolean;
  duration?: string;
  durationCount?: number;
}): Record<string, unknown> {
  return banePayload({
    kind: "bane_gain",
    baneName: args.baneName,
    count: args.count,
    targetContext: args.targetContext ?? "future_burden",
    timing: args.timing,
    extra: {
      ...(args.temporary === true ? { temporary: true } : {}),
      ...(args.duration ? { duration: args.duration } : {}),
      ...(args.durationCount !== undefined ? { durationCount: args.durationCount } : {}),
      ...(args.timing && args.timing !== "immediate" ? { delayed: true } : {}),
    },
  });
}

export function banePurgePayload(args: {
  baneName: string;
  count?: number;
  targetContext?: BaneTargetContextId;
  selection?: BaneSelectionMode;
}): Record<string, unknown> {
  const selection = args.selection ?? "chosen_after_commitment";

  return banePayload({
    kind: selection === "visible_random"
      ? "bane_random_purge"
      : selection === "chosen_after_commitment"
        ? "bane_chosen_purge"
        : "bane_purge",
    baneName: args.baneName,
    count: args.count,
    targetContext: args.targetContext ?? "manifest_obligation",
    selection,
  });
}

export function baneReplaceWithCardPayload(args: {
  baneName: string;
  cardId: string;
  cardName: string;
  source?: "catalog" | "deck" | "draftPool";
  targetContext?: BaneTargetContextId;
  selection?: BaneSelectionMode;
}): Record<string, unknown> {
  return banePayload({
    kind: "bane_replace",
    baneName: args.baneName,
    targetContext: args.targetContext ?? "manifest_obligation",
    selection: args.selection ?? "chosen_after_commitment",
    extra: {
      replacementKind: "non_bane_card",
      cardId: args.cardId,
      cardName: args.cardName,
      source: args.source ?? "catalog",
    },
  });
}

export function baneTransformToCardPayload(args: {
  baneName: string;
  cardId: string;
  cardName: string;
  source?: "catalog" | "deck" | "draftPool";
  targetContext?: BaneTargetContextId;
  timing?: string;
  delayed?: boolean;
}): Record<string, unknown> {
  return banePayload({
    kind: "bane_transform_to_card",
    baneName: args.baneName,
    targetContext: args.targetContext ?? "manifest_obligation",
    timing: args.timing,
    extra: {
      cardId: args.cardId,
      cardName: args.cardName,
      source: args.source ?? "catalog",
      ...(args.delayed === true ? { delayed: true } : {}),
    },
  });
}
