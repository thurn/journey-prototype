import { drawInt, shuffleDeterministic, type DrawContext } from "../../util/rng.js";
import { SITE_TYPES } from "../effects.js";

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

export type RouteSite = (typeof SITE_TYPES)[number];

export type RouteMenuCompanion =
  | "small_essence_reward"
  | "small_omen_reward"
  | "bane_burden"
  | "card_operation";

type RouteEditCandidate = {
  operation: RouteOperationKind;
  routeScope: RouteScope;
  polarity: RoutePolarity;
  baseSiteDeltaValue: number;
  siteType?: RouteSite;
  fromSite?: RouteSite;
  toSite?: RouteSite;
  probabilityDirection?: 1 | -1;
  allMatchingSiteType?: boolean;
};

type RouteMenuSpec = {
  operation: RouteOperationKind;
  routeScope: RouteScope;
  siteType?: RouteSite;
  fromSite?: RouteSite;
  toSite?: RouteSite;
  probabilityDirection?: 1 | -1;
  probabilityDeltaPercent?: number;
  allMatchingSiteType?: boolean;
  companion?: RouteMenuCompanion;
};

export type RouteEditReward = {
  key: string;
  text: string;
  payload: Record<string, unknown>;
  effect: number;
  companion?: RouteMenuCompanion;
};

export type RouteEditMenuVariantId =
  | "shared-current-draft-replacement"
  | "map-fold"
  | "atlas-locksmith"
  | "atlas-needle"
  | "route-and-card-services"
  | "negative-site-pruning";

export type RouteEditMenuSelection = {
  variantId: RouteEditMenuVariantId;
  sharedProperty: string;
  rewards: RouteEditReward[];
};

const STATIC_ROUTE_DRAW_CONTEXT: DrawContext = {
  seed: "route-edit-catalog",
  contentVersion: "route-edit-catalog",
  rootJourneyIndex: 0,
};

const ROUTE_SITE_VALUES: Record<RouteSite, number> = {
  Battle: -15,
  Draft: -10,
  Essence: 70,
  Shop: 45,
  "Specialty Shop": 65,
  Purge: 95,
  Transfiguration: 110,
  "Dreamsign Offering": 120,
  "Dreamsign Draft": 145,
  "Dream Journey": 100,
  Duplication: 105,
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
  "Essence",
  "Shop",
  "Specialty Shop",
  "Purge",
  "Transfiguration",
  "Dreamsign Offering",
  "Dreamsign Draft",
  "Dream Journey",
  "Duplication",
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

function articleForSite(siteType: RouteSite | undefined): "a" | "an" {
  return siteType?.match(/^[AEIOU]/u) ? "an" : "a";
}

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

      candidates.push({
        operation: "remove_site",
        routeScope,
        polarity: polarityForDelta(-siteValue * 2),
        baseSiteDeltaValue: scopedValue(-siteValue * 2, routeScope),
        siteType,
        allMatchingSiteType: true,
      });
    }
  }

  for (const routeScope of ["current_dreamscape", "future_dreamscapes", "full_atlas"] satisfies RouteScope[]) {
    for (const siteType of ROUTE_SITES) {
      const siteValue = ROUTE_SITE_VALUES[siteType];
      const positiveDirection: 1 | -1 = siteValue >= 0 ? 1 : -1;

      if (routeScope !== "current_dreamscape") {
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
      }
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
    candidate.allMatchingSiteType ? "all" : undefined,
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
      return `add ${articleForSite(candidate.siteType)} ${candidate.siteType} site to ${scope}`;
    case "remove_site":
      if (candidate.allMatchingSiteType) {
        return `remove all ${candidate.siteType} sites from ${scope}`;
      }

      return `remove ${articleForSite(candidate.siteType)} ${candidate.siteType} site from ${scope}`;
    case "replace_site":
      return `replace ${articleForSite(candidate.fromSite)} ${candidate.fromSite} site in ${scope} with ${articleForSite(candidate.toSite)} ${candidate.toSite} site`;
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
  allMatchingSiteType?: boolean;
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
    ...(args.allMatchingSiteType ? { allMatchingSiteType: true } : {}),
  };
}

function routeEditRewardFromCandidate(
  candidate: RouteEditCandidate,
  drawContext: DrawContext,
  label: string,
  options: {
    probabilityDeltaPercent?: number;
    companion?: RouteMenuCompanion;
  } = {},
): RouteEditReward {
  const siteDeltaValue = boundedSiteDeltaValue(candidate, drawContext, label);
  const probabilityDeltaPercent = candidate.operation === "probability_adjustment"
    ? options.probabilityDeltaPercent ?? candidate.probabilityDirection! *
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
    ...(candidate.allMatchingSiteType ? { allMatchingSiteType: true } : {}),
    timing: ROUTE_TIMING[candidate.routeScope],
    description,
  });

  return {
    key: routeEffectKey(candidate),
    text: routeEditText(candidate, probabilityDeltaPercent),
    payload,
    effect: siteDeltaValue,
    ...(options.companion ? { companion: options.companion } : {}),
  };
}

function routeCandidate(args: {
  operation: RouteOperationKind;
  routeScope: RouteScope;
  siteType?: RouteSite;
  fromSite?: RouteSite;
  toSite?: RouteSite;
  probabilityDirection?: 1 | -1;
  allMatchingSiteType?: boolean;
}): RouteEditCandidate {
  if (args.operation === "replace_site") {
    const fromValue = ROUTE_SITE_VALUES[args.fromSite!];
    const toValue = ROUTE_SITE_VALUES[args.toSite!];
    const rawDelta = toValue - fromValue;

    return {
      operation: args.operation,
      routeScope: args.routeScope,
      polarity: polarityForDelta(rawDelta),
      baseSiteDeltaValue: scopedValue(rawDelta, args.routeScope),
      fromSite: args.fromSite,
      toSite: args.toSite,
    };
  }

  if (args.operation === "probability_adjustment") {
    const siteValue = ROUTE_SITE_VALUES[args.siteType!];
    const direction = args.probabilityDirection ?? (siteValue >= 0 ? 1 : -1);
    const magnitude = scopedValue(Math.max(30, Math.abs(siteValue)), args.routeScope);

    return {
      operation: args.operation,
      routeScope: args.routeScope,
      polarity: direction === (siteValue >= 0 ? 1 : -1) ? "positive" : "negative",
      baseSiteDeltaValue: direction === (siteValue >= 0 ? 1 : -1) ? magnitude : -magnitude,
      siteType: args.siteType,
      probabilityDirection: direction,
    };
  }

  const siteValue = ROUTE_SITE_VALUES[args.siteType!];
  const multiplier = args.allMatchingSiteType ? 2 : 1;
  const signedValue = args.operation === "add_site" ? siteValue : -siteValue * multiplier;

  return {
    operation: args.operation,
    routeScope: args.routeScope,
    polarity: polarityForDelta(signedValue),
    baseSiteDeltaValue: scopedValue(signedValue, args.routeScope),
    siteType: args.siteType,
    ...(args.allMatchingSiteType ? { allMatchingSiteType: true } : {}),
  };
}

const ROUTE_MENU_VARIANTS = Object.freeze([
  {
    variantId: "shared-current-draft-replacement",
    sharedProperty: "current_dreamscape replace_site from Draft",
    specs: [
      { operation: "replace_site", routeScope: "current_dreamscape", fromSite: "Draft", toSite: "Purge" },
      { operation: "replace_site", routeScope: "current_dreamscape", fromSite: "Draft", toSite: "Transfiguration" },
      { operation: "replace_site", routeScope: "current_dreamscape", fromSite: "Draft", toSite: "Dreamsign Offering" },
    ],
  },
  {
    variantId: "map-fold",
    sharedProperty: "three route timing scopes",
    specs: [
      { operation: "add_site", routeScope: "current_dreamscape", siteType: "Dreamsign Offering" },
      { operation: "add_site", routeScope: "next_dreamscape", siteType: "Transfiguration" },
      { operation: "probability_adjustment", routeScope: "future_dreamscapes", siteType: "Shop", probabilityDirection: 1, probabilityDeltaPercent: 30 },
    ],
  },
  {
    variantId: "atlas-locksmith",
    sharedProperty: "current_dreamscape valuable site access",
    specs: [
      { operation: "replace_site", routeScope: "current_dreamscape", fromSite: "Draft", toSite: "Purge" },
      { operation: "replace_site", routeScope: "current_dreamscape", fromSite: "Essence", toSite: "Transfiguration" },
      { operation: "add_site", routeScope: "current_dreamscape", siteType: "Dreamsign Offering" },
    ],
  },
  {
    variantId: "atlas-needle",
    sharedProperty: "compound current_dreamscape route edits",
    specs: [
      { operation: "replace_site", routeScope: "current_dreamscape", fromSite: "Draft", toSite: "Dreamsign Draft" },
      { operation: "replace_site", routeScope: "current_dreamscape", fromSite: "Shop", toSite: "Purge", companion: "small_omen_reward" },
      { operation: "add_site", routeScope: "current_dreamscape", siteType: "Dream Journey", companion: "bane_burden" },
    ],
  },
  {
    variantId: "route-and-card-services",
    sharedProperty: "route edits with minor service payloads",
    specs: [
      { operation: "add_site", routeScope: "current_dreamscape", siteType: "Purge", companion: "card_operation" },
      { operation: "replace_site", routeScope: "next_dreamscape", fromSite: "Battle", toSite: "Essence", companion: "small_essence_reward" },
      { operation: "add_site", routeScope: "next_dreamscape", siteType: "Duplication" },
    ],
  },
  {
    variantId: "negative-site-pruning",
    sharedProperty: "negative all-site-type removal costs",
    specs: [
      { operation: "remove_site", routeScope: "full_atlas", siteType: "Shop", allMatchingSiteType: true },
      { operation: "purge_site", routeScope: "current_dreamscape", siteType: "Essence" },
      { operation: "add_site", routeScope: "current_dreamscape", siteType: "Dream Journey", companion: "bane_burden" },
    ],
  },
] satisfies readonly {
  variantId: RouteEditMenuVariantId;
  sharedProperty: string;
  specs: readonly RouteMenuSpec[];
}[]);

const PRODUCTION_ROUTE_MENU_VARIANTS = ROUTE_MENU_VARIANTS.filter(
  (variant) => variant.variantId !== "negative-site-pruning",
);

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

export function routeEditMenuRewards(args: {
  drawContext: DrawContext;
  label: string;
  variantId?: RouteEditMenuVariantId;
}): RouteEditMenuSelection {
  const variants = args.variantId
    ? ROUTE_MENU_VARIANTS.filter((variant) => variant.variantId === args.variantId)
    : PRODUCTION_ROUTE_MENU_VARIANTS;
  const selected = variants[
    args.variantId
      ? 0
      : drawInt(args.drawContext, `${args.label}:variant`, 0, variants.length - 1)
  ];

  if (!selected) {
    throw new Error(`Unknown route edit menu variant: ${args.variantId}`);
  }

  return {
    variantId: selected.variantId,
    sharedProperty: selected.sharedProperty,
    rewards: (selected.specs as readonly RouteMenuSpec[]).map((spec, index) =>
      routeEditRewardFromCandidate(
        routeCandidate(spec),
        args.drawContext,
        `${args.label}:${selected.variantId}:${index}`,
        {
          ...(spec.probabilityDeltaPercent !== undefined
            ? { probabilityDeltaPercent: spec.probabilityDeltaPercent }
            : {}),
          ...(spec.companion ? { companion: spec.companion } : {}),
        },
      )
    ),
  };
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
