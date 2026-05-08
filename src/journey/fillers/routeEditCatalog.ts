import { drawInt, shuffleDeterministic, type DrawContext } from "../../util/rng.js";

export type RouteOperationKind =
  | "add_site"
  | "remove_site"
  | "replace_site"
  | "purge_site"
  | "probability_adjustment";

export type RouteScope =
  | "current_dreamscape"
  | "next_dreamscape"
  | "future_dreamscapes"
  | "full_atlas";

export type RoutePolarity = "positive" | "negative" | "neutral";

type RouteSite =
  | "Battle"
  | "Draft"
  | "Shop"
  | "Specialty Shop"
  | "Purge"
  | "Transfiguration"
  | "Dreamsign Offering"
  | "Dream Journey";

type RouteEditCandidate = {
  operation: RouteOperationKind;
  routeScope: RouteScope;
  polarity: RoutePolarity;
  baseSiteDeltaValue: number;
  siteType?: RouteSite;
  fromSite?: RouteSite;
  toSite?: RouteSite;
  probabilityDirection?: 1 | -1;
};

export type RouteEditReward = {
  key: string;
  text: string;
  payload: Record<string, unknown>;
  effect: number;
};

const STATIC_ROUTE_DRAW_CONTEXT: DrawContext = {
  seed: "route-edit-catalog",
  contentVersion: "route-edit-catalog",
  rootJourneyIndex: 0,
};

const ROUTE_SITE_VALUES: Record<RouteSite, number> = {
  Battle: -15,
  Draft: -10,
  Shop: 45,
  "Specialty Shop": 65,
  Purge: 95,
  Transfiguration: 110,
  "Dreamsign Offering": 120,
  "Dream Journey": 100,
};

const ROUTE_SCOPES: readonly RouteScope[] = [
  "current_dreamscape",
  "next_dreamscape",
  "future_dreamscapes",
  "full_atlas",
];

const MUTABLE_ROUTE_SCOPES: readonly RouteScope[] = [
  "current_dreamscape",
  "next_dreamscape",
  "future_dreamscapes",
];

const ROUTE_SITES = Object.keys(ROUTE_SITE_VALUES) as RouteSite[];
const HIGH_AGENCY_SITES: readonly RouteSite[] = [
  "Shop",
  "Specialty Shop",
  "Purge",
  "Transfiguration",
  "Dreamsign Offering",
  "Dream Journey",
];

const ROUTE_SCOPE_MULTIPLIERS: Record<RouteScope, number> = {
  current_dreamscape: 1,
  next_dreamscape: 0.85,
  future_dreamscapes: 0.75,
  full_atlas: 0.9,
};

const ROUTE_TIMING: Record<RouteScope, string> = {
  current_dreamscape: "current dreamscape",
  next_dreamscape: "next dreamscape",
  future_dreamscapes: "future dreamscapes",
  full_atlas: "full atlas",
};

const ROUTE_SCOPE_NOUN: Record<RouteScope, string> = {
  current_dreamscape: "the current dreamscape",
  next_dreamscape: "the next dreamscape",
  future_dreamscapes: "future dreamscapes",
  full_atlas: "the full atlas",
};

function polarityForDelta(delta: number): RoutePolarity {
  if (delta >= 30) {
    return "positive";
  }

  if (delta <= -30) {
    return "negative";
  }

  return "neutral";
}

function scopedValue(delta: number, scope: RouteScope): number {
  return Math.round(delta * ROUTE_SCOPE_MULTIPLIERS[scope]);
}

function routeEditCandidates(): RouteEditCandidate[] {
  const candidates: RouteEditCandidate[] = [];

  for (const routeScope of MUTABLE_ROUTE_SCOPES) {
    for (const fromSite of ROUTE_SITES) {
      for (const toSite of HIGH_AGENCY_SITES) {
        if (fromSite === toSite) {
          continue;
        }

        const rawDelta = ROUTE_SITE_VALUES[toSite] - ROUTE_SITE_VALUES[fromSite];

        candidates.push({
          operation: "replace_site",
          routeScope,
          polarity: polarityForDelta(rawDelta),
          baseSiteDeltaValue: scopedValue(rawDelta, routeScope),
          fromSite,
          toSite,
        });
      }
    }
  }

  for (const routeScope of ROUTE_SCOPES) {
    for (const siteType of ROUTE_SITES) {
      const siteValue = ROUTE_SITE_VALUES[siteType];

      if (routeScope !== "full_atlas") {
        candidates.push({
          operation: "add_site",
          routeScope,
          polarity: polarityForDelta(siteValue),
          baseSiteDeltaValue: scopedValue(siteValue, routeScope),
          siteType,
        });
      }

      candidates.push({
        operation: "remove_site",
        routeScope,
        polarity: polarityForDelta(-siteValue),
        baseSiteDeltaValue: scopedValue(-siteValue, routeScope),
        siteType,
      });
    }
  }

  for (const routeScope of ["future_dreamscapes", "full_atlas"] satisfies RouteScope[]) {
    for (const siteType of ROUTE_SITES) {
      const siteValue = ROUTE_SITE_VALUES[siteType];
      const positiveDirection: 1 | -1 = siteValue >= 0 ? 1 : -1;

      candidates.push({
        operation: "probability_adjustment",
        routeScope,
        polarity: "positive",
        baseSiteDeltaValue: scopedValue(Math.max(30, Math.abs(siteValue)), routeScope),
        siteType,
        probabilityDirection: positiveDirection,
      });
      candidates.push({
        operation: "probability_adjustment",
        routeScope,
        polarity: "negative",
        baseSiteDeltaValue: -scopedValue(Math.max(30, Math.abs(siteValue)), routeScope),
        siteType,
        probabilityDirection: positiveDirection === 1 ? -1 : 1,
      });
      candidates.push({
        operation: "purge_site",
        routeScope,
        polarity: polarityForDelta(-siteValue),
        baseSiteDeltaValue: scopedValue(-siteValue, routeScope),
        siteType,
      });
    }
  }

  return candidates;
}

function routeEffectKey(candidate: RouteEditCandidate): string {
  return [
    candidate.operation,
    candidate.routeScope,
    candidate.polarity,
    candidate.fromSite,
    candidate.toSite,
    candidate.siteType,
    candidate.probabilityDirection,
  ]
    .filter((entry) => entry !== undefined)
    .join(":")
    .toLowerCase()
    .replaceAll(" ", "-");
}

function boundedSiteDeltaValue(
  candidate: RouteEditCandidate,
  drawContext: DrawContext,
  label: string,
): number {
  const magnitude = Math.abs(candidate.baseSiteDeltaValue);
  const variance = drawInt(drawContext, `${label}:site-delta`, 0, 18);
  const value = Math.max(20, magnitude + variance);

  return candidate.baseSiteDeltaValue < 0 ? -value : value;
}

function routeEditDescription(candidate: RouteEditCandidate, probabilityDeltaPercent?: number): string {
  const scope = ROUTE_SCOPE_NOUN[candidate.routeScope];

  switch (candidate.operation) {
    case "add_site":
      return `add a ${candidate.siteType} site to ${scope}`;
    case "remove_site":
      return `remove a ${candidate.siteType} site from ${scope}`;
    case "replace_site":
      return `replace a ${candidate.fromSite} site in ${scope} with a ${candidate.toSite} site`;
    case "purge_site":
      return `purge ${candidate.siteType} sites from ${scope}`;
    case "probability_adjustment": {
      const verb = (probabilityDeltaPercent ?? 0) >= 0 ? "increase" : "decrease";

      return `${verb} ${candidate.siteType} site odds in ${scope}`;
    }
  }
}

function routeEditText(candidate: RouteEditCandidate, probabilityDeltaPercent?: number): string {
  const description = routeEditDescription(candidate, probabilityDeltaPercent);

  return `${description[0]!.toUpperCase()}${description.slice(1)}.`;
}

export function routePayload(args: {
  operation: RouteOperationKind;
  routeScope: RouteScope;
  polarity: RoutePolarity;
  siteDeltaValue: number;
  siteType?: string;
  fromSite?: string;
  toSite?: string;
  probabilityDeltaPercent?: number;
  timing: string;
  description: string;
}): Record<string, unknown> {
  return {
    kind: `route_${args.operation}`,
    routeOperationKind: args.operation,
    routeScope: args.routeScope,
    routePolarity: args.polarity,
    siteDeltaValue: args.siteDeltaValue,
    timing: args.timing,
    source: "simulated_manifest_only",
    description: args.description,
    ...(args.siteType ? { siteType: args.siteType } : {}),
    ...(args.fromSite ? { fromSite: args.fromSite } : {}),
    ...(args.toSite ? { toSite: args.toSite } : {}),
    ...(args.probabilityDeltaPercent !== undefined
      ? { probabilityDeltaPercent: args.probabilityDeltaPercent }
      : {}),
  };
}

function routeEditRewardFromCandidate(
  candidate: RouteEditCandidate,
  drawContext: DrawContext,
  label: string,
): RouteEditReward {
  const siteDeltaValue = boundedSiteDeltaValue(candidate, drawContext, label);
  const probabilityDeltaPercent = candidate.operation === "probability_adjustment"
    ? candidate.probabilityDirection! *
      [15, 20, 25, 30][drawInt(drawContext, `${label}:probability-delta`, 0, 3)]!
    : undefined;
  const description = routeEditDescription(candidate, probabilityDeltaPercent);
  const payload = routePayload({
    operation: candidate.operation,
    routeScope: candidate.routeScope,
    polarity: candidate.polarity,
    siteDeltaValue,
    ...(candidate.siteType ? { siteType: candidate.siteType } : {}),
    ...(candidate.fromSite ? { fromSite: candidate.fromSite } : {}),
    ...(candidate.toSite ? { toSite: candidate.toSite } : {}),
    ...(probabilityDeltaPercent !== undefined ? { probabilityDeltaPercent } : {}),
    timing: ROUTE_TIMING[candidate.routeScope],
    description,
  });

  return {
    key: routeEffectKey(candidate),
    text: routeEditText(candidate, probabilityDeltaPercent),
    payload,
    effect: siteDeltaValue,
  };
}

export function routeEditCatalog(): RouteEditReward[] {
  return routeEditCandidates().map((candidate, index) =>
    routeEditRewardFromCandidate(
      candidate,
      STATIC_ROUTE_DRAW_CONTEXT,
      `route-edit-catalog:${index}`,
    )
  );
}

export function routeEditRewards(args: {
  drawContext: DrawContext;
  label: string;
  count: number;
  operationKinds?: readonly RouteOperationKind[];
  scopes?: readonly RouteScope[];
  polarities?: readonly RoutePolarity[];
}): RouteEditReward[] {
  const operationKinds = new Set(args.operationKinds);
  const scopes = new Set(args.scopes);
  const polarities = new Set(args.polarities);
  const candidates = routeEditCandidates().filter((candidate) =>
    (operationKinds.size === 0 || operationKinds.has(candidate.operation)) &&
    (scopes.size === 0 || scopes.has(candidate.routeScope)) &&
    (polarities.size === 0 || polarities.has(candidate.polarity))
  );

  return shuffleDeterministic(args.drawContext, args.label, candidates)
    .slice(0, args.count)
    .map((candidate, index) =>
      routeEditRewardFromCandidate(
        candidate,
        args.drawContext,
        `${args.label}:${index}:${routeEffectKey(candidate)}`,
      )
    );
}

export function firstRouteEditReward(args: {
  future?: boolean;
  drawContext?: DrawContext;
  label?: string;
  operationKinds?: readonly RouteOperationKind[];
  polarities?: readonly RoutePolarity[];
} = {}): RouteEditReward {
  const scope = args.future ? "next_dreamscape" : "current_dreamscape";

  return routeEditRewards({
    drawContext: args.drawContext ?? STATIC_ROUTE_DRAW_CONTEXT,
    label: args.label ?? `route-edit:${scope}`,
    count: 1,
    operationKinds: args.operationKinds,
    scopes: [scope],
    polarities: args.polarities ?? ["positive"],
  })[0]!;
}
