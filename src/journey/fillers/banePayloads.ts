export function banePayload(args: {
  kind: string;
  baneName: string;
  count?: number;
  targetContext?: "current_state" | "future_burden" | "manifest_obligation";
  selection?: "exact" | "chosen_after_commitment" | "visible_random";
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
